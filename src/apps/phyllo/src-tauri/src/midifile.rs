//! Standard MIDI File (type 1) writer. Track 0 carries the tempo; each requested track follows with its notes.
//! Pure: [`build`] returns the bytes, [`write`] puts them on disk atomically.

use std::path::Path;

use midly::num::{u4, u7, u15, u24, u28};
use midly::{
    Format, Header, MetaMessage, MidiMessage, Smf, Timing, Track, TrackEvent, TrackEventKind,
};
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};
use crate::fsutil;

pub const DEFAULT_PPQ: u16 = 480;
pub const MIN_BPM: f64 = 20.0;
pub const MAX_BPM: f64 = 999.0;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiFileSpec {
    pub bpm: f64,
    /// Ticks per quarter note; defaults to 480.
    pub ppq: Option<u16>,
    pub tracks: Vec<MidiFileTrack>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiFileTrack {
    pub name: String,
    /// 1-based, 1..=16.
    pub channel: u8,
    pub notes: Vec<MidiFileNote>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiFileNote {
    pub start_sec: f64,
    pub duration_sec: f64,
    pub note: u8,
    pub velocity: u8,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MidiFileResult {
    pub path: String,
    pub bytes: u64,
}

fn invalid(msg: String) -> Error {
    Error::InvalidArgument(msg)
}

fn validate(spec: &MidiFileSpec) -> Result<u16> {
    if !(spec.bpm.is_finite() && (MIN_BPM..=MAX_BPM).contains(&spec.bpm)) {
        return Err(invalid(format!(
            "bpm must be between {MIN_BPM} and {MAX_BPM}, got {}",
            spec.bpm
        )));
    }
    let ppq = spec.ppq.unwrap_or(DEFAULT_PPQ);
    if !(1..=0x7FFF).contains(&ppq) {
        return Err(invalid(format!("ppq must be 1..=32767, got {ppq}")));
    }
    for t in &spec.tracks {
        if !(1..=16).contains(&t.channel) {
            return Err(invalid(format!(
                "track {:?}: channel must be 1..=16, got {}",
                t.name, t.channel
            )));
        }
        for n in &t.notes {
            if n.note > 127 {
                return Err(invalid(format!("note out of range: {}", n.note)));
            }
            if !(1..=127).contains(&n.velocity) {
                return Err(invalid(format!(
                    "velocity must be 1..=127, got {}",
                    n.velocity
                )));
            }
            if !(n.start_sec.is_finite() && n.start_sec >= 0.0) {
                return Err(invalid(format!(
                    "startSec must be >= 0, got {}",
                    n.start_sec
                )));
            }
            if !(n.duration_sec.is_finite() && n.duration_sec > 0.0) {
                return Err(invalid(format!(
                    "durationSec must be > 0, got {}",
                    n.duration_sec
                )));
            }
        }
    }
    Ok(ppq)
}

fn ticks(sec: f64, bpm: f64, ppq: u16) -> Result<u32> {
    let t = (sec * bpm / 60.0 * f64::from(ppq)).round();
    if t > f64::from(0x0FFF_FFFFu32) {
        return Err(invalid(format!("time out of range: {sec} s")));
    }
    Ok(t as u32)
}

/// Serialise to Standard MIDI File bytes.
pub fn build(spec: &MidiFileSpec) -> Result<Vec<u8>> {
    let ppq = validate(spec)?;
    let micros_per_quarter = (60_000_000.0 / spec.bpm).round() as u32;

    let mut tracks: Vec<Track<'_>> = Vec::with_capacity(spec.tracks.len() + 1);
    tracks.push(vec![
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::TrackName(b"Phyllo")),
        },
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::Tempo(u24::new(micros_per_quarter))),
        },
        TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
        },
    ]);

    for t in &spec.tracks {
        // (absolute tick, is_on, note, velocity). At equal ticks note-offs sort first so repeated notes retrigger.
        let mut events: Vec<(u32, bool, u8, u8)> = Vec::with_capacity(t.notes.len() * 2);
        for n in &t.notes {
            let on = ticks(n.start_sec, spec.bpm, ppq)?;
            let off = ticks(n.start_sec + n.duration_sec, spec.bpm, ppq)?.max(on + 1);
            events.push((on, true, n.note, n.velocity));
            events.push((off, false, n.note, 64));
        }
        events.sort_by_key(|&(tick, on, note, _)| (tick, on, note));

        let channel = u4::new(t.channel - 1);
        let mut track: Track<'_> = Vec::with_capacity(events.len() + 2);
        track.push(TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::TrackName(t.name.as_bytes())),
        });
        let mut last = 0u32;
        for (tick, on, note, vel) in events {
            let key = u7::new(note);
            let vel = u7::new(vel);
            track.push(TrackEvent {
                delta: u28::new(tick - last),
                kind: TrackEventKind::Midi {
                    channel,
                    message: if on {
                        MidiMessage::NoteOn { key, vel }
                    } else {
                        MidiMessage::NoteOff { key, vel }
                    },
                },
            });
            last = tick;
        }
        track.push(TrackEvent {
            delta: u28::new(0),
            kind: TrackEventKind::Meta(MetaMessage::EndOfTrack),
        });
        tracks.push(track);
    }

    let smf = Smf {
        header: Header::new(Format::Parallel, Timing::Metrical(u15::new(ppq))),
        tracks,
    };
    let mut bytes = Vec::new();
    smf.write_std(&mut bytes)
        .map_err(|e| Error::Encode(format!("MIDI file: {e}")))?;
    Ok(bytes)
}

/// Build and write atomically. Returns the size written.
pub fn write(path: &Path, spec: &MidiFileSpec) -> Result<u64> {
    let bytes = build(spec)?;
    fsutil::atomic_write(path, &bytes)?;
    Ok(bytes.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(start: f64, dur: f64, key: u8, vel: u8) -> MidiFileNote {
        MidiFileNote {
            start_sec: start,
            duration_sec: dur,
            note: key,
            velocity: vel,
        }
    }

    fn spec(bpm: f64, tracks: Vec<MidiFileTrack>) -> MidiFileSpec {
        MidiFileSpec {
            bpm,
            ppq: None,
            tracks,
        }
    }

    fn track(name: &str, channel: u8, notes: Vec<MidiFileNote>) -> MidiFileTrack {
        MidiFileTrack {
            name: name.into(),
            channel,
            notes,
        }
    }

    /// Absolute-tick events of a parsed track: (tick, on?, channel (0-based), key, vel).
    fn notes_of(track: &Track<'_>) -> Vec<(u32, bool, u8, u8, u8)> {
        let mut now = 0u32;
        let mut out = Vec::new();
        for ev in track {
            now += ev.delta.as_int();
            if let TrackEventKind::Midi { channel, message } = ev.kind {
                match message {
                    MidiMessage::NoteOn { key, vel } => {
                        out.push((now, true, channel.as_int(), key.as_int(), vel.as_int()))
                    }
                    MidiMessage::NoteOff { key, vel } => {
                        out.push((now, false, channel.as_int(), key.as_int(), vel.as_int()))
                    }
                    _ => {}
                }
            }
        }
        out
    }

    #[test]
    fn round_trip_tempo_ticks_names_and_channels() {
        // 120 bpm, 480 ppq: 1 s = 2 quarters = 960 ticks.
        let s = spec(
            120.0,
            vec![
                track(
                    "Drums",
                    10,
                    vec![note(0.0, 0.25, 36, 100), note(1.0, 0.5, 38, 90)],
                ),
                track("Bass", 2, vec![note(0.5, 1.0, 40, 127)]),
            ],
        );
        let bytes = build(&s).unwrap();
        assert_eq!(&bytes[..4], b"MThd");
        let smf = Smf::parse(&bytes).unwrap();
        assert_eq!(smf.header.format, Format::Parallel);
        assert_eq!(smf.header.timing, Timing::Metrical(u15::new(480)));
        assert_eq!(smf.tracks.len(), 3);

        let tempo = smf.tracks[0]
            .iter()
            .find_map(|e| match e.kind {
                TrackEventKind::Meta(MetaMessage::Tempo(t)) => Some(t.as_int()),
                _ => None,
            })
            .unwrap();
        assert_eq!(tempo, 500_000);

        let name = |t: &Track<'_>| {
            t.iter().find_map(|e| match e.kind {
                TrackEventKind::Meta(MetaMessage::TrackName(n)) => {
                    Some(String::from_utf8_lossy(n).into_owned())
                }
                _ => None,
            })
        };
        assert_eq!(name(&smf.tracks[1]).as_deref(), Some("Drums"));
        assert_eq!(name(&smf.tracks[2]).as_deref(), Some("Bass"));

        assert_eq!(
            notes_of(&smf.tracks[1]),
            vec![
                (0, true, 9, 36, 100),
                (240, false, 9, 36, 64),
                (960, true, 9, 38, 90),
                (1440, false, 9, 38, 64),
            ]
        );
        assert_eq!(
            notes_of(&smf.tracks[2]),
            vec![(480, true, 1, 40, 127), (1440, false, 1, 40, 64)]
        );
        // every track ends with EndOfTrack
        for t in &smf.tracks {
            assert!(matches!(
                t.last().unwrap().kind,
                TrackEventKind::Meta(MetaMessage::EndOfTrack)
            ));
        }
    }

    #[test]
    fn custom_ppq_and_odd_tempo() {
        let mut s = spec(
            93.0,
            vec![track("T", 1, vec![note(60.0 / 93.0, 60.0 / 93.0, 60, 80)])],
        );
        s.ppq = Some(96);
        let smf_bytes = build(&s).unwrap();
        let smf = Smf::parse(&smf_bytes).unwrap();
        assert_eq!(smf.header.timing, Timing::Metrical(u15::new(96)));
        // one beat in, one beat long
        assert_eq!(
            notes_of(&smf.tracks[1]),
            vec![(96, true, 0, 60, 80), (192, false, 0, 60, 64)]
        );
    }

    #[test]
    fn retrigger_orders_off_before_on_and_min_length_is_one_tick() {
        let s = spec(
            120.0,
            vec![track(
                "T",
                1,
                vec![
                    note(0.0, 0.5, 60, 100),
                    note(0.5, 0.5, 60, 100),
                    note(2.0, 1e-9, 61, 50),
                ],
            )],
        );
        let bytes = build(&s).unwrap();
        let smf = Smf::parse(&bytes).unwrap();
        assert_eq!(
            notes_of(&smf.tracks[1]),
            vec![
                (0, true, 0, 60, 100),
                (480, false, 0, 60, 64),
                (480, true, 0, 60, 100),
                (960, false, 0, 60, 64),
                (1920, true, 0, 61, 50),
                (1921, false, 0, 61, 64),
            ]
        );
    }

    #[test]
    fn notes_sorted_even_if_given_out_of_order() {
        let s = spec(
            60.0,
            vec![track(
                "T",
                1,
                vec![note(2.0, 1.0, 62, 80), note(0.0, 1.0, 60, 80)],
            )],
        );
        let bytes = build(&s).unwrap();
        let smf = Smf::parse(&bytes).unwrap();
        let ticks: Vec<u32> = notes_of(&smf.tracks[1]).iter().map(|e| e.0).collect();
        assert_eq!(ticks, vec![0, 480, 960, 1440]);
    }

    #[test]
    fn rejects_invalid_input() {
        let good = || note(0.0, 1.0, 60, 100);
        let bad_specs = vec![
            spec(0.0, vec![]),
            spec(f64::NAN, vec![]),
            spec(5000.0, vec![]),
            MidiFileSpec {
                ppq: Some(0),
                ..spec(120.0, vec![])
            },
            spec(120.0, vec![track("t", 0, vec![good()])]),
            spec(120.0, vec![track("t", 17, vec![good()])]),
            spec(120.0, vec![track("t", 1, vec![note(0.0, 1.0, 128, 100)])]),
            spec(120.0, vec![track("t", 1, vec![note(0.0, 1.0, 60, 0)])]),
            spec(120.0, vec![track("t", 1, vec![note(0.0, 1.0, 60, 128)])]),
            spec(120.0, vec![track("t", 1, vec![note(-1.0, 1.0, 60, 100)])]),
            spec(120.0, vec![track("t", 1, vec![note(0.0, 0.0, 60, 100)])]),
            spec(
                120.0,
                vec![track("t", 1, vec![note(f64::INFINITY, 1.0, 60, 100)])],
            ),
        ];
        for s in bad_specs {
            assert_eq!(build(&s).unwrap_err().code(), "invalid_argument", "{s:?}");
        }
    }

    #[test]
    fn writes_atomically_to_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("song.mid");
        let s = spec(120.0, vec![track("T", 1, vec![note(0.0, 1.0, 60, 100)])]);
        let n = write(&p, &s).unwrap();
        assert_eq!(n, std::fs::metadata(&p).unwrap().len());
        Smf::parse(&std::fs::read(&p).unwrap()).unwrap();
        // Empty note list still yields a valid file.
        write(&p, &spec(100.0, vec![track("E", 3, vec![])])).unwrap();
        assert_eq!(
            Smf::parse(&std::fs::read(&p).unwrap())
                .unwrap()
                .tracks
                .len(),
            2
        );
    }
}
