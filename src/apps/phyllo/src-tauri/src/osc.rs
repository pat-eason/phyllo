//! OSC sender for SuperDirt (`/dirt/play`), UDP, off by default.
//!
//! Encoding rules (SuperDirt's sclang receiver is dynamically typed, so both numeric tags work):
//! - a JS number that is integral and fits `i32` is sent as `int32` (keeps `orbit`, `n`, cycle counters exact);
//! - any other finite number is sent as `float32`;
//! - strings are sent as OSC strings;
//! - NaN, infinities and numbers outside the `float32` range are rejected as `invalid_argument`.
//!
//! A message with `atMs` goes out as an OSC bundle whose timetag is `now + atMs` (NTP time); without it,
//! as a plain message. The datagram is sent immediately either way: SuperDirt does the waiting.

use std::net::{SocketAddr, ToSocketAddrs, UdpSocket};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime};

use rosc::{OscBundle, OscMessage, OscPacket, OscTime, OscType};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_PORT: u16 = 57120;
/// Same one-minute cap as MIDI look-ahead.
pub const MAX_DELAY_MS: f64 = 60_000.0;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
}

impl Default for OscConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            host: DEFAULT_HOST.into(),
            port: DEFAULT_PORT,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum OscArg {
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscMessageIn {
    pub address: String,
    #[serde(default)]
    pub args: Vec<OscArg>,
    pub at_ms: Option<f64>,
}

fn invalid(msg: impl Into<String>) -> Error {
    Error::InvalidArgument(msg.into())
}

pub fn encode_arg(arg: &OscArg) -> Result<OscType> {
    match arg {
        OscArg::Text(s) => Ok(OscType::String(s.clone())),
        OscArg::Number(n) if !n.is_finite() => {
            Err(invalid(format!("OSC argument is not finite: {n}")))
        }
        OscArg::Number(n)
            if n.fract() == 0.0 && *n >= f64::from(i32::MIN) && *n <= f64::from(i32::MAX) =>
        {
            Ok(OscType::Int(*n as i32))
        }
        OscArg::Number(n) => {
            let f = *n as f32;
            if f.is_finite() {
                Ok(OscType::Float(f))
            } else {
                Err(invalid(format!("OSC argument out of float32 range: {n}")))
            }
        }
    }
}

/// Build the packet for one message. `now` is injected so tests can pin the timetag.
pub fn build_packet(message: &OscMessageIn, now: SystemTime) -> Result<OscPacket> {
    if !message.address.starts_with('/') {
        return Err(invalid(format!(
            "OSC address must start with '/': {:?}",
            message.address
        )));
    }
    let args = message
        .args
        .iter()
        .map(encode_arg)
        .collect::<Result<Vec<_>>>()?;
    let packet = OscPacket::Message(OscMessage {
        addr: message.address.clone(),
        args,
    });
    let Some(at_ms) = message.at_ms else {
        return Ok(packet);
    };
    if at_ms.is_nan() {
        return Err(invalid("atMs is not a number"));
    }
    let delay = Duration::from_secs_f64(at_ms.clamp(0.0, MAX_DELAY_MS) / 1000.0);
    let timetag =
        OscTime::try_from(now + delay).map_err(|e| Error::Internal(format!("OSC timetag: {e}")))?;
    Ok(OscPacket::Bundle(OscBundle {
        timetag,
        content: vec![packet],
    }))
}

pub fn encode_packet(packet: &OscPacket) -> Result<Vec<u8>> {
    rosc::encoder::encode(packet).map_err(|e| Error::Osc(format!("encode: {e}")))
}

/// Validate and encode a whole batch; nothing is sent unless every message encodes.
pub fn encode_all(messages: &[OscMessageIn], now: SystemTime) -> Result<Vec<Vec<u8>>> {
    messages
        .iter()
        .map(|m| build_packet(m, now).and_then(|p| encode_packet(&p)))
        .collect()
}

struct Sender {
    socket: UdpSocket,
    target: SocketAddr,
}

/// Managed state: the current config and, while enabled, the UDP socket.
#[derive(Default)]
pub struct OscState {
    config: Mutex<OscConfig>,
    sender: Mutex<Option<Sender>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl OscState {
    /// Apply a config. Disabling drops the socket; enabling resolves the host and binds a fresh socket.
    pub fn configure(&self, config: OscConfig) -> Result<()> {
        if !config.enabled {
            *lock(&self.sender) = None;
            *lock(&self.config) = config;
            return Ok(());
        }
        if config.host.trim().is_empty() {
            return Err(invalid("OSC host is empty"));
        }
        if config.port == 0 {
            return Err(invalid("OSC port must be 1-65535"));
        }
        let target = (config.host.as_str(), config.port)
            .to_socket_addrs()
            .map_err(|e| Error::Osc(format!("cannot resolve {}: {e}", config.host)))?
            .next()
            .ok_or_else(|| Error::Osc(format!("no address for {}", config.host)))?;
        let bind: SocketAddr = if target.is_ipv4() {
            ([0, 0, 0, 0], 0).into()
        } else {
            ([0u16; 8], 0).into()
        };
        let socket = UdpSocket::bind(bind)
            .map_err(|e| Error::Osc(format!("cannot open UDP socket: {e}")))?;
        *lock(&self.sender) = Some(Sender { socket, target });
        *lock(&self.config) = config;
        Ok(())
    }

    #[cfg(test)]
    pub fn config(&self) -> OscConfig {
        lock(&self.config).clone()
    }

    /// Send a batch. A no-op (returns `Ok(0)`) while disabled; otherwise returns the datagram count.
    pub fn send(&self, messages: &[OscMessageIn]) -> Result<usize> {
        let sender = lock(&self.sender);
        let Some(sender) = sender.as_ref() else {
            return Ok(0);
        };
        let datagrams = encode_all(messages, SystemTime::now())?;
        let mut first_error = None;
        for bytes in &datagrams {
            // Unconnected socket: no ICMP "connection refused" noise while SuperDirt is not running.
            if let Err(e) = sender.socket.send_to(bytes, sender.target) {
                first_error.get_or_insert(e);
            }
        }
        match first_error {
            Some(e) => Err(Error::Osc(format!("send to {}: {e}", sender.target))),
            None => Ok(datagrams.len()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::UNIX_EPOCH;

    fn dirt(at_ms: Option<f64>) -> OscMessageIn {
        OscMessageIn {
            address: "/dirt/play".into(),
            args: vec![
                OscArg::Text("s".into()),
                OscArg::Text("bd".into()),
                OscArg::Text("n".into()),
                OscArg::Number(3.0),
                OscArg::Text("gain".into()),
                OscArg::Number(0.8),
                OscArg::Text("cps".into()),
                OscArg::Number(0.5625),
            ],
            at_ms,
        }
    }

    fn decode(bytes: &[u8]) -> OscPacket {
        let (rest, packet) = rosc::decoder::decode_udp(bytes).unwrap();
        assert!(rest.is_empty(), "no trailing bytes");
        packet
    }

    #[test]
    fn default_config_is_disabled_superdirt() {
        assert_eq!(
            OscConfig::default(),
            OscConfig {
                enabled: false,
                host: "127.0.0.1".into(),
                port: 57120
            }
        );
    }

    #[test]
    fn config_and_message_deserialize_from_js_shapes() {
        let c: OscConfig = serde_json::from_value(
            serde_json::json!({ "enabled": true, "host": "localhost", "port": 57120 }),
        )
        .unwrap();
        assert!(c.enabled);
        let m: OscMessageIn = serde_json::from_value(
            serde_json::json!({ "address": "/dirt/play", "args": ["s", "bd", "n", 3, "gain", 0.8], "atMs": 20 }),
        )
        .unwrap();
        assert_eq!(m.args[3], OscArg::Number(3.0));
        assert_eq!(m.args[1], OscArg::Text("bd".into()));
        assert_eq!(m.at_ms, Some(20.0));
    }

    #[test]
    fn dirt_play_message_round_trips() {
        let packet = build_packet(&dirt(None), UNIX_EPOCH).unwrap();
        let bytes = encode_packet(&packet).unwrap();
        assert_eq!(bytes.len() % 4, 0, "OSC is 4-byte aligned");
        let OscPacket::Message(m) = decode(&bytes) else {
            panic!("expected a plain message");
        };
        assert_eq!(m.addr, "/dirt/play");
        assert_eq!(
            m.args,
            vec![
                OscType::String("s".into()),
                OscType::String("bd".into()),
                OscType::String("n".into()),
                OscType::Int(3),
                OscType::String("gain".into()),
                OscType::Float(0.8),
                OscType::String("cps".into()),
                OscType::Float(0.5625),
            ]
        );
    }

    #[test]
    fn at_ms_makes_a_bundle_with_the_timetag_now_plus_delay() {
        let now = UNIX_EPOCH + Duration::from_secs(1_800_000_000);
        let bytes = encode_packet(&build_packet(&dirt(Some(250.0)), now).unwrap()).unwrap();
        assert!(bytes.starts_with(b"#bundle\0"));
        let OscPacket::Bundle(b) = decode(&bytes) else {
            panic!("expected a bundle");
        };
        let expected = OscTime::try_from(now + Duration::from_millis(250)).unwrap();
        assert_eq!(b.timetag, expected);
        // 250 ms is a quarter second of the 32-bit fraction.
        assert_eq!(b.timetag.fractional, 0x4000_0000);
        assert_eq!(b.content.len(), 1);
        let OscPacket::Message(m) = &b.content[0] else {
            panic!("bundle holds the message");
        };
        assert_eq!(m.addr, "/dirt/play");
        assert_eq!(m.args.len(), 8);
    }

    #[test]
    fn at_ms_zero_is_still_a_bundle_and_negative_clamps_to_now() {
        let now = UNIX_EPOCH + Duration::from_secs(1_800_000_000);
        for at in [0.0, -40.0] {
            let OscPacket::Bundle(b) = build_packet(&dirt(Some(at)), now).unwrap() else {
                panic!("expected bundle");
            };
            assert_eq!(b.timetag, OscTime::try_from(now).unwrap());
        }
    }

    #[test]
    fn number_encoding_rules() {
        let enc = |n| encode_arg(&OscArg::Number(n)).unwrap();
        assert_eq!(enc(0.0), OscType::Int(0));
        assert_eq!(enc(-7.0), OscType::Int(-7));
        assert_eq!(enc(2_147_483_647.0), OscType::Int(i32::MAX));
        assert_eq!(enc(2_147_483_648.0), OscType::Float(2_147_483_648.0));
        assert_eq!(enc(1.5), OscType::Float(1.5));
        assert_eq!(enc(-0.25), OscType::Float(-0.25));
        for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, 1e300] {
            assert_eq!(
                encode_arg(&OscArg::Number(bad)).unwrap_err().code(),
                "invalid_argument",
                "{bad}"
            );
        }
    }

    #[test]
    fn bad_messages_are_rejected_before_anything_is_encoded() {
        let mut m = dirt(None);
        m.address = "dirt/play".into();
        assert_eq!(
            build_packet(&m, UNIX_EPOCH).unwrap_err().code(),
            "invalid_argument"
        );
        let mut bad_at = dirt(Some(f64::NAN));
        bad_at.address = "/x".into();
        assert!(build_packet(&bad_at, UNIX_EPOCH).is_err());
        let mut nan = dirt(None);
        nan.args.push(OscArg::Number(f64::NAN));
        assert!(encode_all(&[dirt(None), nan], UNIX_EPOCH).is_err());
        assert_eq!(
            encode_all(&[dirt(None), dirt(Some(5.0))], UNIX_EPOCH)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn disabled_state_drops_messages_silently() {
        let state = OscState::default();
        assert_eq!(state.send(&[dirt(None)]).unwrap(), 0);
        assert!(!state.config().enabled);
    }

    #[test]
    fn enabled_state_delivers_datagrams_over_loopback() {
        let receiver = UdpSocket::bind("127.0.0.1:0").unwrap();
        receiver
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        let port = receiver.local_addr().unwrap().port();
        let state = OscState::default();
        state
            .configure(OscConfig {
                enabled: true,
                host: "127.0.0.1".into(),
                port,
            })
            .unwrap();
        assert_eq!(state.send(&[dirt(None), dirt(Some(100.0))]).unwrap(), 2);
        let mut buf = [0u8; 2048];
        let n = receiver.recv(&mut buf).unwrap();
        assert!(matches!(decode(&buf[..n]), OscPacket::Message(_)));
        let n = receiver.recv(&mut buf).unwrap();
        assert!(matches!(decode(&buf[..n]), OscPacket::Bundle(_)));

        state
            .configure(OscConfig {
                enabled: false,
                ..OscConfig::default()
            })
            .unwrap();
        assert_eq!(state.send(&[dirt(None)]).unwrap(), 0);
    }

    #[test]
    fn configure_rejects_bad_targets() {
        let state = OscState::default();
        let base = OscConfig {
            enabled: true,
            ..OscConfig::default()
        };
        let err = state
            .configure(OscConfig {
                host: " ".into(),
                ..base.clone()
            })
            .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        let err = state.configure(OscConfig { port: 0, ..base }).unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
    }
}
