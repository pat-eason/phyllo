//! Native MIDI bridge (WKWebView has no Web MIDI).
//!
//! Input: `midir` callback -> [`parse_message`] -> channel -> emitter thread -> `midi://message` events.
//! Output: JS hands over messages with a relative `atMs`; a dedicated thread owns every output connection and
//! sends each message at its due time (sleep, then spin for the last ~2 ms).
//!
//! Everything that does not touch hardware (ids, parsing, coalescing, scheduling, the output actor over a
//! [`MidiSink`], hot-plug diffing) is pure and unit-tested. The `midir` glue at the bottom is thin.

use std::cmp::{Ordering, Reverse};
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use midir::{Ignore, MidiInput, MidiInputConnection, MidiOutput, MidiOutputConnection};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

pub const EVENT_MESSAGE: &str = "midi://message";
pub const EVENT_PORTS_CHANGED: &str = "midi://ports-changed";

/// How often the hot-plug thread re-enumerates ports.
pub const POLL_INTERVAL: Duration = Duration::from_secs(2);
/// Minimum gap between event batches towards JS (continuous controllers are coalesced inside a batch).
pub const EMIT_GAP: Duration = Duration::from_millis(1);
/// The output thread sleeps until this long before a due time, then spins.
const SPIN_WINDOW: Duration = Duration::from_millis(2);
/// Upper bound for `atMs` (one minute of look-ahead is far more than the JS scheduler needs).
pub const MAX_DELAY_MS: f64 = 60_000.0;
/// Longest accepted raw message (a short SysEx fits).
pub const MAX_MESSAGE_BYTES: usize = 1024;

// ── Wire types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Direction {
    In,
    Out,
}

impl Direction {
    fn tag(self) -> &'static str {
        match self {
            Direction::In => "in",
            Direction::Out => "out",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortInfo {
    pub id: String,
    pub name: String,
    pub direction: Direction,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Noteon,
    Noteoff,
    Cc,
    Pitchbend,
    Other,
}

/// One incoming message. `channel` is 1-based (1..=16, like Strudel's `midichan`); 0 for system messages.
/// `noteon`/`noteoff`: data1 = note, data2 = velocity (a note-on with velocity 0 becomes `noteoff`).
/// `cc`: data1 = controller, data2 = value. `pitchbend`: data1 = 14-bit value (0..=16383, centre 8192), data2 = 0.
/// `other`: data1/data2 are the raw data bytes. `status` is always the raw status byte.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiMessage {
    pub port_id: String,
    pub kind: Kind,
    pub channel: u8,
    pub data1: u16,
    pub data2: u8,
    pub status: u8,
    /// Microseconds on midir's monotonic clock (arbitrary origin). Only differences are meaningful.
    pub timestamp_us: u64,
}

/// One outgoing message for [`MidiHub::send`].
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutMessage {
    pub bytes: Vec<u8>,
    /// Delay relative to the moment Rust receives the command. Missing or <= 0 means now.
    pub at_ms: Option<f64>,
}

// ── Pure helpers ────────────────────────────────────────────────────────────

/// Stable ids: `<in|out>:<name>:<index among ports with the same name>`, in enumeration order. Two identical
/// devices keep distinct ids; unplugging the first of two identical devices shifts the second's index.
pub fn assign_ids(direction: Direction, names: &[String]) -> Vec<PortInfo> {
    let mut seen: HashMap<&str, usize> = HashMap::new();
    names
        .iter()
        .map(|name| {
            let index = seen.entry(name.as_str()).or_insert(0);
            let id = format!("{}:{}:{}", direction.tag(), name, index);
            *index += 1;
            PortInfo {
                id,
                name: name.clone(),
                direction,
            }
        })
        .collect()
}

/// Parse raw MIDI bytes from `midir`. `None` for what is deliberately dropped: timing clock, active sensing,
/// SysEx and other system-common messages.
pub fn parse_message(port_id: &str, timestamp_us: u64, bytes: &[u8]) -> Option<MidiMessage> {
    let status = *bytes.first()?;
    let make = |kind, channel, data1: u16, data2| MidiMessage {
        port_id: port_id.to_owned(),
        kind,
        channel,
        data1,
        data2,
        status,
        timestamp_us,
    };
    match status {
        0x80..=0xEF => {
            let channel = (status & 0x0F) + 1;
            let d1 = *bytes.get(1)? & 0x7F;
            let d2 = bytes.get(2).copied().unwrap_or(0) & 0x7F;
            Some(match status & 0xF0 {
                0x80 => make(Kind::Noteoff, channel, d1.into(), d2),
                0x90 if d2 == 0 => make(Kind::Noteoff, channel, d1.into(), 0),
                0x90 => make(Kind::Noteon, channel, d1.into(), d2),
                0xB0 => make(Kind::Cc, channel, d1.into(), d2),
                0xE0 => make(
                    Kind::Pitchbend,
                    channel,
                    (u16::from(d2) << 7) | u16::from(d1),
                    0,
                ),
                // poly pressure, program change, channel pressure
                _ => make(Kind::Other, channel, d1.into(), d2),
            })
        }
        // Start, continue, stop.
        0xFA..=0xFC => Some(make(Kind::Other, 0, 0, 0)),
        _ => None,
    }
}

/// Collapse a batch for the event stream. Continuous messages (CC per controller, pitch bend per channel) keep
/// only their latest value, at the position of that latest occurrence. Notes and everything else are kept in order.
pub fn coalesce(batch: Vec<MidiMessage>) -> Vec<MidiMessage> {
    let mut seen: HashSet<(String, Kind, u8, u16)> = HashSet::new();
    let mut kept: Vec<MidiMessage> = batch
        .into_iter()
        .rev()
        .filter(|m| match m.kind {
            Kind::Cc => seen.insert((m.port_id.clone(), m.kind, m.channel, m.data1)),
            Kind::Pitchbend => seen.insert((m.port_id.clone(), m.kind, m.channel, 0)),
            _ => true,
        })
        .collect();
    kept.reverse();
    kept
}

/// Validate and convert `atMs` to a non-negative delay.
pub fn delay_from_ms(at_ms: Option<f64>) -> Result<Duration> {
    match at_ms {
        None => Ok(Duration::ZERO),
        Some(ms) if ms.is_nan() => Err(Error::InvalidArgument("atMs is not a number".into())),
        Some(ms) => Ok(Duration::from_secs_f64(
            ms.clamp(0.0, MAX_DELAY_MS) / 1000.0,
        )),
    }
}

/// Reject malformed raw messages before anything is queued.
pub fn validate_bytes(bytes: &[u8]) -> Result<()> {
    match bytes.first() {
        None => Err(Error::InvalidArgument("empty MIDI message".into())),
        Some(b) if *b < 0x80 => Err(Error::InvalidArgument(format!(
            "MIDI message must start with a status byte (>= 0x80), got {b:#04x}"
        ))),
        _ if bytes.len() > MAX_MESSAGE_BYTES => Err(Error::InvalidArgument(format!(
            "MIDI message longer than {MAX_MESSAGE_BYTES} bytes"
        ))),
        _ => Ok(()),
    }
}

/// All-notes-off (CC 123) on each of the 16 channels.
pub fn panic_messages() -> Vec<[u8; 3]> {
    (0..16u8).map(|ch| [0xB0 | ch, 123, 0]).collect()
}

/// Tracks the last seen port list for hot-plug detection.
#[derive(Debug, Default)]
pub struct PortTracker {
    last: Option<Vec<PortInfo>>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Observation {
    /// First enumeration, or identical to the previous one.
    Same,
    /// The list differs; `removed` are ids that were present before and are gone now.
    Changed { removed: Vec<String> },
}

impl PortTracker {
    pub fn observe(&mut self, ports: &[PortInfo]) -> Observation {
        let outcome = match &self.last {
            None => Observation::Same,
            Some(prev) if prev.as_slice() == ports => Observation::Same,
            Some(prev) => Observation::Changed {
                removed: prev
                    .iter()
                    .filter(|p| !ports.iter().any(|q| q.id == p.id))
                    .map(|p| p.id.clone())
                    .collect(),
            },
        };
        self.last = Some(ports.to_vec());
        outcome
    }
}

// ── Scheduler (pure) ────────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Eq)]
pub struct Scheduled {
    pub due: Instant,
    seq: u64,
    pub port: String,
    pub bytes: Vec<u8>,
}

impl Ord for Scheduled {
    fn cmp(&self, other: &Self) -> Ordering {
        (self.due, self.seq).cmp(&(other.due, other.seq))
    }
}
impl PartialOrd for Scheduled {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Min-heap on `(due, insertion order)`: equal due times keep the order they were queued in.
#[derive(Debug, Default)]
pub struct Scheduler {
    heap: BinaryHeap<Reverse<Scheduled>>,
    seq: u64,
}

impl Scheduler {
    pub fn push(&mut self, due: Instant, port: &str, bytes: Vec<u8>) {
        self.seq += 1;
        self.heap.push(Reverse(Scheduled {
            due,
            seq: self.seq,
            port: port.to_owned(),
            bytes,
        }));
    }

    pub fn next_due(&self) -> Option<Instant> {
        self.heap.peek().map(|Reverse(s)| s.due)
    }

    /// Pops everything due at or before `now`, earliest first.
    pub fn pop_due(&mut self, now: Instant) -> Vec<Scheduled> {
        let mut out = Vec::new();
        while self.next_due().is_some_and(|due| due <= now) {
            if let Some(Reverse(s)) = self.heap.pop() {
                out.push(s);
            }
        }
        out
    }

    /// Drops everything queued for `port`; returns how many.
    pub fn drop_port(&mut self, port: &str) -> usize {
        let before = self.heap.len();
        self.heap.retain(|Reverse(s)| s.port != port);
        before - self.heap.len()
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        self.heap.len()
    }
}

// ── Emitter (input events) ──────────────────────────────────────────────────

/// Drain `rx`, coalesce each burst and hand messages to `emit`, at most one burst per `gap`.
/// Returns when every sender is gone.
pub fn run_emitter(rx: Receiver<MidiMessage>, gap: Duration, mut emit: impl FnMut(&MidiMessage)) {
    while let Ok(first) = rx.recv() {
        let started = Instant::now();
        let mut batch = vec![first];
        while let Ok(more) = rx.try_recv() {
            batch.push(more);
        }
        for message in coalesce(batch) {
            emit(&message);
        }
        if let Some(rest) = gap.checked_sub(started.elapsed()) {
            std::thread::sleep(rest);
        }
    }
}

// ── Output actor ────────────────────────────────────────────────────────────

/// A connected output port. Implemented by `midir` in production and by a recorder in tests.
pub trait MidiSink: Send {
    fn send(&mut self, bytes: &[u8]) -> std::result::Result<(), String>;
}

type Opener = Box<dyn FnMut(&str) -> Result<Box<dyn MidiSink>> + Send>;
type Reply<T = ()> = Sender<Result<T>>;

enum Cmd {
    Open {
        id: String,
        reply: Reply,
    },
    Close {
        id: String,
        reply: Reply,
    },
    Send {
        id: String,
        received: Instant,
        items: Vec<(Duration, Vec<u8>)>,
        reply: Reply,
    },
    Panic {
        id: String,
        reply: Reply,
    },
}

/// Handle to the output thread.
pub struct OutputHandle {
    tx: Mutex<Sender<Cmd>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl OutputHandle {
    fn request<T>(&self, make: impl FnOnce(Reply<T>) -> Cmd) -> Result<T> {
        let (reply, answer) = mpsc::channel();
        lock(&self.tx)
            .send(make(reply))
            .map_err(|_| Error::Internal("MIDI output thread stopped".into()))?;
        answer
            .recv()
            .map_err(|_| Error::Internal("MIDI output thread stopped".into()))?
    }

    pub fn open(&self, id: &str) -> Result<()> {
        self.request(|reply| Cmd::Open {
            id: id.to_owned(),
            reply,
        })
    }

    /// Sends all-notes-off, drops anything still queued for the port, then disconnects.
    pub fn close(&self, id: &str) -> Result<()> {
        self.request(|reply| Cmd::Close {
            id: id.to_owned(),
            reply,
        })
    }

    /// Validates every message first (nothing is queued if one is bad). `received` anchors the `atMs` delays.
    pub fn send(&self, id: &str, received: Instant, messages: &[OutMessage]) -> Result<()> {
        let mut items = Vec::with_capacity(messages.len());
        for m in messages {
            validate_bytes(&m.bytes)?;
            items.push((delay_from_ms(m.at_ms)?, m.bytes.clone()));
        }
        self.request(|reply| Cmd::Send {
            id: id.to_owned(),
            received,
            items,
            reply,
        })
    }

    /// All-notes-off on 16 channels now; also drops anything still queued for the port.
    pub fn panic(&self, id: &str) -> Result<()> {
        self.request(|reply| Cmd::Panic {
            id: id.to_owned(),
            reply,
        })
    }
}

struct Actor {
    opener: Opener,
    sinks: HashMap<String, Box<dyn MidiSink>>,
    scheduler: Scheduler,
}

impl Actor {
    fn sink(&mut self, id: &str) -> Result<&mut Box<dyn MidiSink>> {
        self.sinks
            .get_mut(id)
            .ok_or_else(|| Error::NotFound(format!("MIDI output not open: {id}")))
    }

    fn panic_now(&mut self, id: &str) -> Result<()> {
        self.scheduler.drop_port(id);
        let sink = self.sink(id)?;
        let mut first_error = None;
        for msg in panic_messages() {
            if let Err(e) = sink.send(&msg) {
                first_error.get_or_insert(e);
            }
        }
        first_error.map_or(Ok(()), |e| Err(Error::Midi(e)))
    }

    fn handle(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::Open { id, reply } => {
                let result = if self.sinks.contains_key(&id) {
                    Ok(())
                } else {
                    (self.opener)(&id).map(|sink| {
                        self.sinks.insert(id, sink);
                    })
                };
                let _ = reply.send(result);
            }
            Cmd::Close { id, reply } => {
                let result = match self.panic_now(&id) {
                    Err(Error::NotFound(_)) => Ok(()), // already closed
                    other => other.or(Ok(())),         // best effort: the device may be gone
                };
                self.sinks.remove(&id);
                let _ = reply.send(result);
            }
            Cmd::Send {
                id,
                received,
                items,
                reply,
            } => {
                let result = self.sink(&id).map(|_| ());
                if result.is_ok() {
                    for (delay, bytes) in items {
                        self.scheduler.push(received + delay, &id, bytes);
                    }
                }
                let _ = reply.send(result);
            }
            Cmd::Panic { id, reply } => {
                let _ = reply.send(self.panic_now(&id));
            }
        }
    }

    fn flush_due(&mut self) {
        for item in self.scheduler.pop_due(Instant::now()) {
            if let Some(sink) = self.sinks.get_mut(&item.port) {
                // A vanished device fails every send; there is nobody to tell mid-stream.
                let _ = sink.send(&item.bytes);
            }
        }
    }

    fn run(mut self, rx: Receiver<Cmd>) {
        loop {
            self.flush_due();
            let wait = self
                .scheduler
                .next_due()
                .map(|due| due.saturating_duration_since(Instant::now()));
            let cmd = match wait {
                None => match rx.recv() {
                    Ok(cmd) => Some(cmd),
                    Err(_) => return,
                },
                Some(wait) if wait > SPIN_WINDOW => match rx.recv_timeout(wait - SPIN_WINDOW) {
                    Ok(cmd) => Some(cmd),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(RecvTimeoutError::Disconnected) => return,
                },
                Some(_) => match rx.try_recv() {
                    Ok(cmd) => Some(cmd),
                    Err(TryRecvError::Empty) => {
                        std::hint::spin_loop();
                        None
                    }
                    Err(TryRecvError::Disconnected) => return,
                },
            };
            if let Some(cmd) = cmd {
                self.handle(cmd);
            }
        }
    }
}

/// Start the output thread. `opener` connects a port by id and runs on that thread.
pub fn spawn_output_actor(
    opener: impl FnMut(&str) -> Result<Box<dyn MidiSink>> + Send + 'static,
) -> OutputHandle {
    let (tx, rx) = mpsc::channel();
    let actor = Actor {
        opener: Box::new(opener),
        sinks: HashMap::new(),
        scheduler: Scheduler::default(),
    };
    std::thread::Builder::new()
        .name("phyllo-midi-out".into())
        .spawn(move || actor.run(rx))
        .expect("spawn MIDI output thread");
    OutputHandle { tx: Mutex::new(tx) }
}

// ── midir glue ──────────────────────────────────────────────────────────────

fn midi_err(context: &str, e: impl std::fmt::Display) -> Error {
    Error::Midi(format!("{context}: {e}"))
}

/// Holds one `MidiInput` and `MidiOutput` purely to enumerate ports.
pub struct Enumerator {
    input: MidiInput,
    output: MidiOutput,
}

impl Enumerator {
    pub fn new() -> Result<Self> {
        Ok(Self {
            input: MidiInput::new("phyllo-enumerate-in").map_err(|e| midi_err("MIDI init", e))?,
            output: MidiOutput::new("phyllo-enumerate-out")
                .map_err(|e| midi_err("MIDI init", e))?,
        })
    }

    pub fn list(&self) -> Vec<PortInfo> {
        let in_names: Vec<String> = self
            .input
            .ports()
            .iter()
            .map(|p| {
                self.input
                    .port_name(p)
                    .unwrap_or_else(|_| "Unknown port".into())
            })
            .collect();
        let out_names: Vec<String> = self
            .output
            .ports()
            .iter()
            .map(|p| {
                self.output
                    .port_name(p)
                    .unwrap_or_else(|_| "Unknown port".into())
            })
            .collect();
        let mut all = assign_ids(Direction::In, &in_names);
        all.extend(assign_ids(Direction::Out, &out_names));
        all
    }
}

struct MidirSink(MidiOutputConnection);

impl MidiSink for MidirSink {
    fn send(&mut self, bytes: &[u8]) -> std::result::Result<(), String> {
        self.0.send(bytes).map_err(|e| e.to_string())
    }
}

fn open_output(id: &str) -> Result<Box<dyn MidiSink>> {
    let output = MidiOutput::new("phyllo-out").map_err(|e| midi_err("MIDI init", e))?;
    let names: Vec<String> = output
        .ports()
        .iter()
        .map(|p| {
            output
                .port_name(p)
                .unwrap_or_else(|_| "Unknown port".into())
        })
        .collect();
    let index = assign_ids(Direction::Out, &names)
        .iter()
        .position(|p| p.id == id)
        .ok_or_else(|| Error::NotFound(format!("MIDI output not found: {id}")))?;
    let port = output.ports()[index].clone();
    let connection = output
        .connect(&port, "phyllo-out")
        .map_err(|e| midi_err("could not open MIDI output", e))?;
    Ok(Box::new(MidirSink(connection)))
}

/// Managed state: open inputs, the output thread, the hot-plug tracker and the event queue.
pub struct MidiHub {
    msg_tx: Sender<MidiMessage>,
    msg_rx: Mutex<Option<Receiver<MidiMessage>>>,
    inputs: Mutex<HashMap<String, MidiInputConnection<()>>>,
    output: OutputHandle,
    tracker: Mutex<PortTracker>,
}

impl Default for MidiHub {
    fn default() -> Self {
        let (msg_tx, msg_rx) = mpsc::channel();
        Self {
            msg_tx,
            msg_rx: Mutex::new(Some(msg_rx)),
            inputs: Mutex::new(HashMap::new()),
            output: spawn_output_actor(open_output),
            tracker: Mutex::new(PortTracker::default()),
        }
    }
}

/// Result of re-enumerating ports.
pub struct Refresh {
    pub ports: Vec<PortInfo>,
    /// `true` when the list differs from the previous enumeration (JS should be told).
    pub changed: bool,
}

impl MidiHub {
    /// Take the input queue (once) and run the emitter over it on its own thread.
    pub fn start_emitter(&self, emit: impl FnMut(&MidiMessage) + Send + 'static) {
        if let Some(rx) = lock(&self.msg_rx).take() {
            std::thread::Builder::new()
                .name("phyllo-midi-emit".into())
                .spawn(move || run_emitter(rx, EMIT_GAP, emit))
                .expect("spawn MIDI emitter thread");
        }
    }

    /// Enumerate with `lister`, record the result and close connections whose port disappeared.
    pub fn refresh_with(&self, lister: &Enumerator) -> Refresh {
        let ports = lister.list();
        let observation = lock(&self.tracker).observe(&ports);
        match observation {
            Observation::Same => Refresh {
                ports,
                changed: false,
            },
            Observation::Changed { removed } => {
                for id in removed {
                    if id.starts_with("out:") {
                        let _ = self.output.close(&id);
                    } else {
                        lock(&self.inputs).remove(&id);
                    }
                }
                Refresh {
                    ports,
                    changed: true,
                }
            }
        }
    }

    pub fn refresh(&self) -> Result<Refresh> {
        Ok(self.refresh_with(&Enumerator::new()?))
    }

    pub fn open_input(&self, id: &str) -> Result<()> {
        if lock(&self.inputs).contains_key(id) {
            return Ok(());
        }
        let mut input = MidiInput::new("phyllo-in").map_err(|e| midi_err("MIDI init", e))?;
        input.ignore(Ignore::All);
        let names: Vec<String> = input
            .ports()
            .iter()
            .map(|p| input.port_name(p).unwrap_or_else(|_| "Unknown port".into()))
            .collect();
        let index = assign_ids(Direction::In, &names)
            .iter()
            .position(|p| p.id == id)
            .ok_or_else(|| Error::NotFound(format!("MIDI input not found: {id}")))?;
        let port = input.ports()[index].clone();
        let tx = self.msg_tx.clone();
        let port_id = id.to_owned();
        let connection = input
            .connect(
                &port,
                "phyllo-in",
                move |timestamp_us, bytes, _| {
                    if let Some(message) = parse_message(&port_id, timestamp_us, bytes) {
                        let _ = tx.send(message);
                    }
                },
                (),
            )
            .map_err(|e| midi_err("could not open MIDI input", e))?;
        lock(&self.inputs).insert(id.to_owned(), connection);
        Ok(())
    }

    pub fn close_input(&self, id: &str) {
        lock(&self.inputs).remove(id);
    }

    pub fn open_output(&self, id: &str) -> Result<()> {
        self.output.open(id)
    }

    pub fn close_output(&self, id: &str) -> Result<()> {
        self.output.close(id)
    }

    pub fn send(&self, id: &str, received: Instant, messages: &[OutMessage]) -> Result<()> {
        self.output.send(id, received, messages)
    }

    pub fn panic(&self, id: &str) -> Result<()> {
        self.output.panic(id)
    }
}

// ── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    fn msg(kind: Kind, channel: u8, data1: u16, data2: u8) -> MidiMessage {
        MidiMessage {
            port_id: "in:Pad:0".into(),
            kind,
            channel,
            data1,
            data2,
            status: 0,
            timestamp_us: 0,
        }
    }

    // ids

    #[test]
    fn ids_include_direction_name_and_duplicate_index() {
        let ins = assign_ids(Direction::In, &names(&["KeyStep 37", "Pad", "Pad"]));
        let ids: Vec<&str> = ins.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["in:KeyStep 37:0", "in:Pad:0", "in:Pad:1"]);
        let outs = assign_ids(Direction::Out, &names(&["Pad"]));
        assert_eq!(outs[0].id, "out:Pad:0");
        assert_ne!(ins[1].id, outs[0].id);
    }

    #[test]
    fn ids_are_stable_across_enumerations() {
        let list = names(&["A", "B", "A"]);
        assert_eq!(
            assign_ids(Direction::Out, &list),
            assign_ids(Direction::Out, &list)
        );
    }

    #[test]
    fn port_info_serializes_camel_case() {
        let v = serde_json::to_value(&assign_ids(Direction::In, &names(&["A"]))[0]).unwrap();
        assert_eq!(
            v,
            serde_json::json!({ "id": "in:A:0", "name": "A", "direction": "in" })
        );
    }

    // parsing

    #[test]
    fn parses_note_on_and_off() {
        let on = parse_message("p", 42, &[0x93, 60, 100]).unwrap();
        assert_eq!(
            (on.kind, on.channel, on.data1, on.data2, on.timestamp_us),
            (Kind::Noteon, 4, 60, 100, 42)
        );
        let off = parse_message("p", 0, &[0x83, 60, 64]).unwrap();
        assert_eq!((off.kind, off.data1, off.data2), (Kind::Noteoff, 60, 64));
    }

    #[test]
    fn note_on_with_zero_velocity_is_note_off() {
        let m = parse_message("p", 0, &[0x90, 61, 0]).unwrap();
        assert_eq!(
            (m.kind, m.channel, m.data1, m.data2),
            (Kind::Noteoff, 1, 61, 0)
        );
    }

    #[test]
    fn parses_cc() {
        let m = parse_message("p", 0, &[0xBF, 13, 127]).unwrap();
        assert_eq!(
            (m.kind, m.channel, m.data1, m.data2),
            (Kind::Cc, 16, 13, 127)
        );
    }

    #[test]
    fn pitch_bend_is_one_14_bit_value() {
        let centre = parse_message("p", 0, &[0xE0, 0x00, 0x40]).unwrap();
        assert_eq!((centre.kind, centre.data1), (Kind::Pitchbend, 8192));
        let max = parse_message("p", 0, &[0xE2, 0x7F, 0x7F]).unwrap();
        assert_eq!((max.channel, max.data1), (3, 16383));
        let min = parse_message("p", 0, &[0xE0, 0, 0]).unwrap();
        assert_eq!(min.data1, 0);
    }

    #[test]
    fn other_channel_messages_pass_through_with_status() {
        let pc = parse_message("p", 0, &[0xC2, 5]).unwrap();
        assert_eq!(
            (pc.kind, pc.channel, pc.status, pc.data1, pc.data2),
            (Kind::Other, 3, 0xC2, 5, 0)
        );
        let at = parse_message("p", 0, &[0xA0, 60, 30]).unwrap();
        assert_eq!((at.kind, at.status, at.data2), (Kind::Other, 0xA0, 30));
    }

    #[test]
    fn transport_is_other_and_clock_is_dropped() {
        for status in [0xFA, 0xFB, 0xFC] {
            let m = parse_message("p", 0, &[status]).unwrap();
            assert_eq!((m.kind, m.channel, m.status), (Kind::Other, 0, status));
        }
        assert!(parse_message("p", 0, &[0xF8]).is_none());
        assert!(parse_message("p", 0, &[0xFE]).is_none());
        assert!(parse_message("p", 0, &[0xF0, 1, 2, 0xF7]).is_none());
        assert!(parse_message("p", 0, &[]).is_none());
        assert!(parse_message("p", 0, &[0x90]).is_none(), "truncated");
        assert!(
            parse_message("p", 0, &[0x40, 1]).is_none(),
            "data byte first"
        );
    }

    #[test]
    fn message_serializes_camel_case() {
        let v = serde_json::to_value(parse_message("in:A:0", 7, &[0x90, 60, 90]).unwrap()).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "portId": "in:A:0", "kind": "noteon", "channel": 1,
                "data1": 60, "data2": 90, "status": 0x90, "timestampUs": 7
            })
        );
    }

    // coalescing

    #[test]
    fn coalesce_keeps_latest_cc_and_all_notes_in_order() {
        let batch = vec![
            msg(Kind::Cc, 1, 13, 1),
            msg(Kind::Noteon, 1, 60, 100),
            msg(Kind::Cc, 1, 13, 2),
            msg(Kind::Cc, 1, 14, 9),
            msg(Kind::Noteoff, 1, 60, 0),
            msg(Kind::Cc, 1, 13, 3),
            msg(Kind::Pitchbend, 1, 100, 0),
            msg(Kind::Pitchbend, 1, 200, 0),
            msg(Kind::Pitchbend, 2, 300, 0),
        ];
        let out: Vec<(Kind, u8, u16, u8)> = coalesce(batch)
            .iter()
            .map(|m| (m.kind, m.channel, m.data1, m.data2))
            .collect();
        assert_eq!(
            out,
            vec![
                (Kind::Noteon, 1, 60, 100),
                (Kind::Cc, 1, 14, 9),
                (Kind::Noteoff, 1, 60, 0),
                (Kind::Cc, 1, 13, 3),
                (Kind::Pitchbend, 1, 200, 0),
                (Kind::Pitchbend, 2, 300, 0),
            ]
        );
    }

    #[test]
    fn coalesce_separates_ports() {
        let mut a = msg(Kind::Cc, 1, 13, 1);
        let mut b = msg(Kind::Cc, 1, 13, 2);
        a.port_id = "in:A:0".into();
        b.port_id = "in:B:0".into();
        assert_eq!(coalesce(vec![a, b]).len(), 2);
    }

    #[test]
    fn emitter_delivers_everything_and_stops_when_senders_drop() {
        let (tx, rx) = mpsc::channel();
        for v in 0..50 {
            tx.send(msg(Kind::Cc, 1, 7, v)).unwrap();
        }
        tx.send(msg(Kind::Noteon, 1, 60, 90)).unwrap();
        drop(tx);
        let mut got = Vec::new();
        run_emitter(rx, Duration::from_millis(1), |m| got.push(m.clone()));
        // The 50 queued CCs collapse to the newest value; the note follows it.
        assert_eq!(got.len(), 2);
        assert_eq!((got[0].kind, got[0].data2), (Kind::Cc, 49));
        assert_eq!(got[1].kind, Kind::Noteon);
    }

    // validation

    #[test]
    fn delay_conversion() {
        assert_eq!(delay_from_ms(None).unwrap(), Duration::ZERO);
        assert_eq!(delay_from_ms(Some(-5.0)).unwrap(), Duration::ZERO);
        assert_eq!(
            delay_from_ms(Some(250.5)).unwrap(),
            Duration::from_micros(250_500)
        );
        assert_eq!(
            delay_from_ms(Some(1e12)).unwrap(),
            Duration::from_millis(MAX_DELAY_MS as u64)
        );
        assert_eq!(
            delay_from_ms(Some(f64::NAN)).unwrap_err().code(),
            "invalid_argument"
        );
    }

    #[test]
    fn bytes_validation() {
        assert!(validate_bytes(&[0x90, 60, 100]).is_ok());
        assert_eq!(validate_bytes(&[]).unwrap_err().code(), "invalid_argument");
        assert_eq!(
            validate_bytes(&[60, 100]).unwrap_err().code(),
            "invalid_argument"
        );
        assert_eq!(
            validate_bytes(&vec![0xF0; MAX_MESSAGE_BYTES + 1])
                .unwrap_err()
                .code(),
            "invalid_argument"
        );
    }

    #[test]
    fn out_message_deserializes_camel_case() {
        let m: OutMessage =
            serde_json::from_value(serde_json::json!({ "bytes": [144, 60, 100], "atMs": 12.5 }))
                .unwrap();
        assert_eq!((m.bytes, m.at_ms), (vec![144, 60, 100], Some(12.5)));
        let m: OutMessage =
            serde_json::from_value(serde_json::json!({ "bytes": [144, 60, 100] })).unwrap();
        assert_eq!(m.at_ms, None);
    }

    #[test]
    fn panic_covers_all_sixteen_channels() {
        let msgs = panic_messages();
        assert_eq!(msgs.len(), 16);
        assert_eq!(msgs[0], [0xB0, 123, 0]);
        assert_eq!(msgs[15], [0xBF, 123, 0]);
    }

    // hot plug

    fn ports(list: &[&str]) -> Vec<PortInfo> {
        assign_ids(Direction::In, &names(list))
    }

    #[test]
    fn tracker_reports_changes_and_removed_ids() {
        let mut t = PortTracker::default();
        assert_eq!(
            t.observe(&ports(&["A", "B"])),
            Observation::Same,
            "first enumeration is the baseline"
        );
        assert_eq!(t.observe(&ports(&["A", "B"])), Observation::Same);
        assert_eq!(
            t.observe(&ports(&["A", "B", "C"])),
            Observation::Changed { removed: vec![] }
        );
        assert_eq!(
            t.observe(&ports(&["B", "C"])),
            Observation::Changed {
                removed: vec!["in:A:0".into()]
            }
        );
    }

    // scheduler

    #[test]
    fn scheduler_orders_by_due_time_then_insertion() {
        let t0 = Instant::now();
        let mut s = Scheduler::default();
        s.push(t0 + Duration::from_millis(30), "p", vec![3]);
        s.push(t0 + Duration::from_millis(10), "p", vec![1]);
        s.push(t0 + Duration::from_millis(10), "p", vec![2]);
        s.push(t0 + Duration::from_millis(20), "q", vec![9]);
        assert_eq!(s.next_due(), Some(t0 + Duration::from_millis(10)));
        assert!(s.pop_due(t0 + Duration::from_millis(9)).is_empty());
        let order: Vec<u8> = s
            .pop_due(t0 + Duration::from_millis(25))
            .iter()
            .map(|i| i.bytes[0])
            .collect();
        assert_eq!(order, [1, 2, 9]);
        assert_eq!(s.len(), 1);
        assert_eq!(s.drop_port("p"), 1);
        assert_eq!(s.next_due(), None);
    }

    // output actor over a recording sink

    type Log = Arc<Mutex<Vec<(String, Vec<u8>, Instant)>>>;

    struct Recorder {
        name: String,
        log: Log,
    }

    impl MidiSink for Recorder {
        fn send(&mut self, bytes: &[u8]) -> std::result::Result<(), String> {
            lock(&self.log).push((self.name.clone(), bytes.to_vec(), Instant::now()));
            Ok(())
        }
    }

    fn recording_actor() -> (OutputHandle, Log) {
        let log: Log = Arc::default();
        let l = log.clone();
        let handle = spawn_output_actor(move |id| {
            if id.contains("missing") {
                return Err(Error::NotFound(format!("MIDI output not found: {id}")));
            }
            Ok(Box::new(Recorder {
                name: id.to_owned(),
                log: l.clone(),
            }))
        });
        (handle, log)
    }

    fn note(n: u8, at_ms: Option<f64>) -> OutMessage {
        OutMessage {
            bytes: vec![0x90, n, 100],
            at_ms,
        }
    }

    #[test]
    fn actor_sends_in_time_order_and_not_early() {
        let (out, log) = recording_actor();
        out.open("out:Synth:0").unwrap();
        let start = Instant::now();
        out.send(
            "out:Synth:0",
            start,
            &[
                note(3, Some(60.0)),
                note(1, None),
                note(2, Some(30.0)),
                note(4, Some(30.0)),
            ],
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(150));
        let log = lock(&log);
        let order: Vec<u8> = log.iter().map(|(_, b, _)| b[1]).collect();
        assert_eq!(order, [1, 2, 4, 3], "ties keep queue order");
        let due = [0u64, 30, 30, 60];
        for ((_, _, at), want_ms) in log.iter().zip(due) {
            let got = at.duration_since(start);
            assert!(
                got >= Duration::from_millis(want_ms),
                "sent early: {got:?} < {want_ms} ms"
            );
            assert!(
                got < Duration::from_millis(want_ms + 40),
                "sent late: {got:?}"
            );
        }
    }

    #[test]
    fn actor_validates_before_queueing_and_requires_open_port() {
        let (out, log) = recording_actor();
        assert_eq!(
            out.send("out:Nope:0", Instant::now(), &[note(1, None)])
                .unwrap_err()
                .code(),
            "not_found"
        );
        out.open("out:A:0").unwrap();
        let bad = OutMessage {
            bytes: vec![60],
            at_ms: None,
        };
        assert_eq!(
            out.send("out:A:0", Instant::now(), &[note(1, None), bad])
                .unwrap_err()
                .code(),
            "invalid_argument"
        );
        std::thread::sleep(Duration::from_millis(20));
        assert!(lock(&log).is_empty(), "a bad batch queues nothing");
        assert_eq!(out.open("out:missing:0").unwrap_err().code(), "not_found");
    }

    #[test]
    fn panic_drops_pending_messages_and_silences_all_channels() {
        let (out, log) = recording_actor();
        out.open("out:A:0").unwrap();
        out.send("out:A:0", Instant::now(), &[note(1, Some(50.0))])
            .unwrap();
        out.panic("out:A:0").unwrap();
        std::thread::sleep(Duration::from_millis(90));
        let log = lock(&log);
        assert_eq!(log.len(), 16, "pending note-on was dropped");
        assert!(log.iter().all(|(_, b, _)| b[1] == 123));
        assert_eq!(out.panic("out:B:0").unwrap_err().code(), "not_found");
    }

    #[test]
    fn close_silences_then_disconnects() {
        let (out, log) = recording_actor();
        out.open("out:A:0").unwrap();
        out.open("out:A:0").unwrap();
        out.close("out:A:0").unwrap();
        assert_eq!(lock(&log).len(), 16);
        assert_eq!(
            out.send("out:A:0", Instant::now(), &[note(1, None)])
                .unwrap_err()
                .code(),
            "not_found"
        );
        out.close("out:A:0").unwrap();
        assert_eq!(lock(&log).len(), 16, "closing a closed port is a no-op");
    }

    #[test]
    fn ports_are_independent() {
        let (out, log) = recording_actor();
        out.open("out:A:0").unwrap();
        out.open("out:B:0").unwrap();
        let t = Instant::now();
        out.send("out:A:0", t, &[note(1, Some(20.0))]).unwrap();
        out.send("out:B:0", t, &[note(2, Some(10.0))]).unwrap();
        out.panic("out:A:0").unwrap(); // must not drop B's message
        std::thread::sleep(Duration::from_millis(60));
        let log = lock(&log);
        assert!(log.iter().any(|(p, b, _)| p == "out:B:0" && b[1] == 2));
        assert!(!log.iter().any(|(p, b, _)| p == "out:A:0" && b[0] == 0x90));
    }

    /// Requires nothing plugged in: only proves `midir` can talk to the system MIDI service.
    #[test]
    #[ignore = "talks to the OS MIDI service"]
    fn smoke_enumerates_system_ports() {
        let ports = Enumerator::new().expect("MIDI service").list();
        println!("{ports:#?}");
        let ids: HashSet<&str> = ports.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids.len(), ports.len(), "ids are unique");
    }
}
