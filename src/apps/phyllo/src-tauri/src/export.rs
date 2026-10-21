//! Streaming export sessions: the web view renders (or captures) audio and hands over interleaved `f32` PCM
//! in chunks; `finish` normalizes (optional) and encodes to the final file atomically (temp + rename).
//!
//! Lifecycle: `begin` validates and opens a spool file; `chunk` appends raw little-endian `f32` frames and tracks
//! the peak; `finish` encodes `spool -> <dest dir>/.<name>.<id>.tmp -> dest` and returns the result; `cancel` (or
//! dropping the session) deletes the spool. The destination is never touched before the final rename, so a
//! cancelled or failed export leaves any pre-existing file alone.
//!
//! Normalize: when `normalize_dbfs` is set the whole signal is scaled so its sample peak equals the target
//! (boosting quiet material, attenuating loud material). Silence (peak under -120 dBFS) is left alone rather than
//! amplified into noise.

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::encode::{self, Format, Spec, clean};
use crate::error::{Error, IoContext, Result};
use crate::paths;

/// Largest single chunk accepted (the web view sends ~1 s, a few hundred KB).
pub const MAX_CHUNK_BYTES: usize = 64 * 1024 * 1024;

/// Below this peak the signal counts as silence and is not normalized.
const SILENCE_PEAK: f32 = 1e-6;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginOptions {
    /// A bare file name goes to `Exports/`; anything else must be an absolute path in an existing folder.
    /// A missing extension gets the format's.
    pub path: String,
    pub format: Format,
    /// 16, 24 or 32 (float, WAV only). Ignored for MP3.
    pub bit_depth: u8,
    pub sample_rate: u32,
    pub channels: u8,
    /// Peak target in dBFS (e.g. -1). `null`/missing leaves levels alone.
    #[serde(default)]
    pub normalize_dbfs: Option<f64>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BeginResult {
    pub session_id: String,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub duration_sec: f64,
    /// Sample peak of the written audio in dBFS (after normalize); `null` for digital silence.
    pub peak_dbfs: Option<f64>,
    pub bytes: u64,
}

/// Resolve where an export lands. A bare file name goes to `<root>/Exports/` (created on demand); any other
/// value must be an absolute path without `..` whose folder exists. `default_ext` is added when missing.
pub fn resolve_output(root: &Path, requested: &str, default_ext: &str) -> Result<PathBuf> {
    if requested.trim().is_empty() {
        return Err(Error::InvalidArgument("export path is empty".into()));
    }
    let given = Path::new(requested);
    let mut comps = given.components();
    let bare = matches!(
        (comps.next(), comps.next()),
        (Some(Component::Normal(_)), None)
    );
    let mut out = if bare {
        let dir = paths::exports_dir(root);
        paths::ensure_dir(&dir)?;
        dir.join(given)
    } else {
        if !given.is_absolute() {
            return Err(Error::InvalidArgument(format!(
                "export path must be absolute or a bare file name: {requested}"
            )));
        }
        if given.components().any(|c| c == Component::ParentDir) {
            return Err(Error::InvalidArgument(format!(
                "export path must not contain '..': {requested}"
            )));
        }
        given.to_path_buf()
    };
    if out.file_name().is_none() || out.is_dir() {
        return Err(Error::InvalidArgument(format!(
            "export path is not a file: {requested}"
        )));
    }
    if out.extension().is_none() {
        out.set_extension(default_ext);
    }
    let parent = out
        .parent()
        .ok_or_else(|| Error::InvalidArgument(format!("no parent folder: {requested}")))?;
    if !parent.is_dir() {
        return Err(Error::NotFound(format!(
            "folder does not exist: {}",
            parent.display()
        )));
    }
    Ok(out)
}

/// Linear gain that puts `peak` at `target_dbfs`; 1.0 for silence.
pub fn normalize_gain(peak: f32, target_dbfs: f64) -> f32 {
    if peak < SILENCE_PEAK {
        return 1.0;
    }
    (10f64.powf(target_dbfs / 20.0) / f64::from(peak)) as f32
}

fn dbfs(linear: f64) -> Option<f64> {
    (linear > 0.0).then(|| 20.0 * linear.log10())
}

struct Session {
    spec: Spec,
    dest: PathBuf,
    normalize_dbfs: Option<f64>,
    spool_path: PathBuf,
    writer: Option<BufWriter<File>>,
    frames: u64,
    peak: f32,
}

impl Drop for Session {
    fn drop(&mut self) {
        self.writer = None;
        let _ = fs::remove_file(&self.spool_path);
    }
}

#[derive(Default)]
pub struct ExportSessions {
    sessions: Mutex<HashMap<String, Arc<Mutex<Session>>>>,
    counter: AtomicU64,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl ExportSessions {
    fn get(&self, id: &str) -> Result<Arc<Mutex<Session>>> {
        lock(&self.sessions)
            .get(id)
            .cloned()
            .ok_or_else(|| Error::NotFound(format!("unknown export session: {id}")))
    }

    /// Validate, resolve the destination and open the spool in `scratch`.
    pub fn begin(
        &self,
        root: &Path,
        scratch: &Path,
        options: &BeginOptions,
    ) -> Result<BeginResult> {
        let spec = Spec {
            format: options.format,
            bit_depth: options.bit_depth,
            sample_rate: options.sample_rate,
            channels: options.channels,
        };
        spec.validate()?;
        if let Some(db) = options.normalize_dbfs
            && !(db.is_finite() && (-60.0..=0.0).contains(&db))
        {
            return Err(Error::InvalidArgument(format!(
                "normalizeDbfs must be between -60 and 0, got {db}"
            )));
        }
        let dest = resolve_output(root, &options.path, options.format.extension())?;
        paths::ensure_dir(scratch)?;
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.subsec_nanos());
        let id = format!(
            "{:x}{:x}{:x}",
            std::process::id(),
            self.counter.fetch_add(1, Ordering::Relaxed),
            nanos
        );
        let spool_path = scratch.join(format!("phyllo-export-{id}.f32"));
        let file = File::create(&spool_path).at(&spool_path)?;
        let session = Session {
            spec,
            dest,
            normalize_dbfs: options.normalize_dbfs,
            spool_path,
            writer: Some(BufWriter::with_capacity(1 << 20, file)),
            frames: 0,
            peak: 0.0,
        };
        lock(&self.sessions).insert(id.clone(), Arc::new(Mutex::new(session)));
        Ok(BeginResult { session_id: id })
    }

    /// Append interleaved little-endian `f32` frames. Must be a whole number of frames.
    pub fn chunk(&self, id: &str, bytes: &[u8]) -> Result<()> {
        if bytes.len() > MAX_CHUNK_BYTES {
            return Err(Error::InvalidArgument(format!(
                "chunk too large: {} bytes",
                bytes.len()
            )));
        }
        let session = self.get(id)?;
        let mut s = lock(&session);
        let frame_bytes = 4 * usize::from(s.spec.channels);
        if bytes.is_empty() || !bytes.len().is_multiple_of(frame_bytes) {
            return Err(Error::InvalidArgument(format!(
                "chunk of {} bytes is not a whole number of {}-channel f32 frames",
                bytes.len(),
                s.spec.channels
            )));
        }
        let peak = bytes
            .chunks_exact(4)
            .map(|b| clean(f32::from_le_bytes([b[0], b[1], b[2], b[3]])).abs())
            .fold(0.0f32, f32::max);
        s.peak = s.peak.max(peak);
        s.frames += (bytes.len() / frame_bytes) as u64;
        let spool = s.spool_path.clone();
        let writer = s
            .writer
            .as_mut()
            .ok_or_else(|| Error::Internal("export session already finished".into()))?;
        writer.write_all(bytes).at(&spool)
    }

    /// Normalize (optional), encode and move into place. The session is consumed even when this fails.
    pub fn finish(&self, id: &str) -> Result<ExportResult> {
        let session = lock(&self.sessions)
            .remove(id)
            .ok_or_else(|| Error::NotFound(format!("unknown export session: {id}")))?;
        let mut s = lock(&session);
        if let Some(mut w) = s.writer.take() {
            w.flush().at(&s.spool_path)?;
        }
        if s.frames == 0 {
            return Err(Error::InvalidArgument(
                "nothing to export: no audio was received".into(),
            ));
        }
        let gain = s
            .normalize_dbfs
            .map_or(1.0, |db| normalize_gain(s.peak, db));
        let out_peak = f64::from(s.peak) * f64::from(gain);

        let dir = s.dest.parent().unwrap_or_else(|| Path::new("."));
        let name = s
            .dest
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        let tmp = dir.join(format!(".{name}.{id}.tmp"));
        let result = encode::encode_file(&s.spool_path, s.spec, gain, &tmp)
            .and_then(|()| File::open(&tmp).and_then(|f| f.sync_all()).at(&tmp))
            .and_then(|()| fs::rename(&tmp, &s.dest).at(&s.dest));
        if let Err(e) = result {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
        let bytes = fs::metadata(&s.dest).at(&s.dest)?.len();
        Ok(ExportResult {
            path: s.dest.display().to_string(),
            duration_sec: s.frames as f64 / f64::from(s.spec.sample_rate),
            peak_dbfs: dbfs(out_peak),
            bytes,
        })
    }

    /// Drop the session and delete its spool. Unknown ids are fine (cancel is idempotent).
    pub fn cancel(&self, id: &str) {
        lock(&self.sessions).remove(id);
    }

    #[cfg(test)]
    fn open_count(&self) -> usize {
        lock(&self.sessions).len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn le(frames: &[f32]) -> Vec<u8> {
        frames.iter().flat_map(|f| f.to_le_bytes()).collect()
    }

    struct Rig {
        _tmp: tempfile::TempDir,
        root: PathBuf,
        scratch: PathBuf,
        sessions: ExportSessions,
    }

    fn rig() -> Rig {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Phyllo");
        fs::create_dir_all(&root).unwrap();
        let scratch = tmp.path().join("scratch");
        Rig {
            root,
            scratch,
            _tmp: tmp,
            sessions: ExportSessions::default(),
        }
    }

    fn opts(path: &str, format: Format, bits: u8) -> BeginOptions {
        BeginOptions {
            path: path.into(),
            format,
            bit_depth: bits,
            sample_rate: 48_000,
            channels: 2,
            normalize_dbfs: None,
        }
    }

    fn signal(frames: usize, amp: f32) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let v = amp * (i as f32 * 0.05).sin();
                [v, -v]
            })
            .collect()
    }

    fn read_wav_f32(path: &str) -> Vec<f32> {
        hound::WavReader::open(path)
            .unwrap()
            .samples::<f32>()
            .map(|s| s.unwrap())
            .collect()
    }

    fn scratch_is_empty(r: &Rig) -> bool {
        !r.scratch.exists() || fs::read_dir(&r.scratch).unwrap().next().is_none()
    }

    #[test]
    fn bare_name_lands_in_exports_with_extension() {
        let r = rig();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("groove", Format::Wav, 32))
            .unwrap()
            .session_id;
        r.sessions.chunk(&id, &le(&signal(100, 0.5))).unwrap();
        let res = r.sessions.finish(&id).unwrap();
        assert_eq!(
            Path::new(&res.path),
            r.root.join("Exports").join("groove.wav")
        );
        assert!(res.bytes > 44);
        assert!((res.duration_sec - 100.0 / 48_000.0).abs() < 1e-12);
        assert!(scratch_is_empty(&r), "spool removed after finish");
    }

    #[test]
    fn chunked_streaming_equals_single_shot() {
        let r = rig();
        let data = le(&signal(20_000, 0.7));
        let mut outputs = Vec::new();
        for (name, piece) in [("single.wav", data.len()), ("chunked.wav", 8 * 1000 + 8)] {
            let id = r
                .sessions
                .begin(&r.root, &r.scratch, &opts(name, Format::Wav, 24))
                .unwrap()
                .session_id;
            for part in data.chunks(piece) {
                r.sessions.chunk(&id, part).unwrap();
            }
            outputs.push(fs::read(r.sessions.finish(&id).unwrap().path).unwrap());
        }
        assert_eq!(outputs[0], outputs[1]);
    }

    #[test]
    fn normalize_sets_peak_to_target_both_directions() {
        let r = rig();
        let target = -1.0;
        let want = 10f32.powf(-1.0 / 20.0);
        for (name, amp) in [("quiet.wav", 0.1f32), ("loud.wav", 1.0)] {
            let mut o = opts(name, Format::Wav, 32);
            o.normalize_dbfs = Some(target);
            let id = r
                .sessions
                .begin(&r.root, &r.scratch, &o)
                .unwrap()
                .session_id;
            r.sessions.chunk(&id, &le(&signal(5000, amp))).unwrap();
            let res = r.sessions.finish(&id).unwrap();
            let got = read_wav_f32(&res.path)
                .iter()
                .fold(0.0f32, |m, v| m.max(v.abs()));
            assert!((got - want).abs() < 1e-4, "{name}: {got} vs {want}");
            assert!((res.peak_dbfs.unwrap() - target).abs() < 1e-3);
        }
    }

    #[test]
    fn without_normalize_reports_source_peak() {
        let r = rig();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("raw.wav", Format::Wav, 32))
            .unwrap()
            .session_id;
        r.sessions.chunk(&id, &le(&[0.5, 0.25, -0.5, 0.0])).unwrap();
        let res = r.sessions.finish(&id).unwrap();
        assert!((res.peak_dbfs.unwrap() - 20.0 * 0.5f64.log10()).abs() < 1e-9);
    }

    #[test]
    fn gain_math() {
        assert!((normalize_gain(0.5, -6.0206) - 1.0).abs() < 1e-3);
        assert!((normalize_gain(0.25, 0.0) - 4.0).abs() < 1e-6);
        assert_eq!(normalize_gain(0.0, -1.0), 1.0);
        assert_eq!(normalize_gain(1e-9, -1.0), 1.0);
    }

    #[test]
    fn silence_reports_null_peak_and_is_not_amplified() {
        let r = rig();
        let mut o = opts("silent.wav", Format::Wav, 32);
        o.normalize_dbfs = Some(-1.0);
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &o)
            .unwrap()
            .session_id;
        r.sessions.chunk(&id, &le(&[0.0; 200])).unwrap();
        let res = r.sessions.finish(&id).unwrap();
        assert_eq!(res.peak_dbfs, None);
        assert!(read_wav_f32(&res.path).iter().all(|v| *v == 0.0));
    }

    #[test]
    fn cancel_removes_spool_and_never_creates_destination() {
        let r = rig();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("gone.wav", Format::Wav, 16))
            .unwrap()
            .session_id;
        r.sessions.chunk(&id, &le(&signal(1000, 0.5))).unwrap();
        assert!(!scratch_is_empty(&r));
        r.sessions.cancel(&id);
        r.sessions.cancel(&id); // idempotent
        assert!(scratch_is_empty(&r));
        assert!(!r.root.join("Exports/gone.wav").exists());
        assert_eq!(r.sessions.open_count(), 0);
        assert_eq!(
            r.sessions.chunk(&id, &le(&[0.0, 0.0])).unwrap_err().code(),
            "not_found"
        );
        assert_eq!(r.sessions.finish(&id).unwrap_err().code(), "not_found");
    }

    #[test]
    fn cancel_keeps_an_existing_destination() {
        let r = rig();
        let dest = r.root.join("Exports").join("keep.wav");
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        fs::write(&dest, b"old").unwrap();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("keep.wav", Format::Wav, 16))
            .unwrap()
            .session_id;
        r.sessions.chunk(&id, &le(&[0.1, 0.1])).unwrap();
        r.sessions.cancel(&id);
        assert_eq!(fs::read(&dest).unwrap(), b"old");
    }

    #[test]
    fn dropping_the_registry_cleans_the_spool() {
        let r = rig();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("x.wav", Format::Wav, 16))
            .unwrap()
            .session_id;
        r.sessions.chunk(&id, &le(&[0.1, 0.1])).unwrap();
        drop(r.sessions);
        assert!(r.scratch.read_dir().unwrap().next().is_none());
    }

    #[test]
    fn failed_finish_leaves_no_temp_or_destination() {
        let r = rig();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("empty.wav", Format::Wav, 16))
            .unwrap()
            .session_id;
        assert_eq!(
            r.sessions.finish(&id).unwrap_err().code(),
            "invalid_argument"
        );
        let names: Vec<_> = fs::read_dir(r.root.join("Exports"))
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert!(names.is_empty(), "{names:?}");
        assert!(scratch_is_empty(&r));
    }

    #[test]
    fn rejects_bad_chunks_and_options() {
        let r = rig();
        let id = r
            .sessions
            .begin(&r.root, &r.scratch, &opts("c.wav", Format::Wav, 16))
            .unwrap()
            .session_id;
        // stereo: 3 floats is not a whole number of frames
        assert_eq!(
            r.sessions.chunk(&id, &le(&[0.0; 3])).unwrap_err().code(),
            "invalid_argument"
        );
        assert_eq!(
            r.sessions.chunk(&id, &[]).unwrap_err().code(),
            "invalid_argument"
        );
        r.sessions.cancel(&id);

        let mut bad = opts("c.wav", Format::Flac, 32);
        assert_eq!(
            r.sessions
                .begin(&r.root, &r.scratch, &bad)
                .unwrap_err()
                .code(),
            "invalid_argument"
        );
        bad = opts("c.wav", Format::Wav, 16);
        bad.normalize_dbfs = Some(3.0);
        assert_eq!(
            r.sessions
                .begin(&r.root, &r.scratch, &bad)
                .unwrap_err()
                .code(),
            "invalid_argument"
        );
        bad.normalize_dbfs = Some(f64::NAN);
        assert_eq!(
            r.sessions
                .begin(&r.root, &r.scratch, &bad)
                .unwrap_err()
                .code(),
            "invalid_argument"
        );
    }

    #[test]
    fn flac_and_mp3_sessions_end_to_end() {
        let r = rig();
        let data = le(&signal(48_000, 0.5));
        for (name, fmt) in [("a.flac", Format::Flac), ("a.mp3", Format::Mp3)] {
            let mut o = opts(name, fmt, 24);
            o.normalize_dbfs = Some(-1.0);
            let id = r
                .sessions
                .begin(&r.root, &r.scratch, &o)
                .unwrap()
                .session_id;
            for part in data.chunks(8 * 4800) {
                r.sessions.chunk(&id, part).unwrap();
            }
            let res = r.sessions.finish(&id).unwrap();
            assert!(res.bytes > 1000);
            assert!((res.duration_sec - 1.0).abs() < 1e-9);
            if fmt == Format::Flac {
                let rd = claxon::FlacReader::open(&res.path).unwrap();
                assert_eq!(rd.streaminfo().samples, Some(48_000));
            }
        }
    }

    #[test]
    fn output_path_rules() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let abs = root.join("elsewhere");
        fs::create_dir_all(&abs).unwrap();
        let ok = resolve_output(root, abs.join("m").to_str().unwrap(), "flac").unwrap();
        assert_eq!(ok, abs.join("m.flac"));
        let keep = resolve_output(root, abs.join("m.wav").to_str().unwrap(), "flac").unwrap();
        assert_eq!(keep, abs.join("m.wav"), "an explicit extension is kept");
        for bad in [
            "",
            "   ",
            "sub/dir.wav",
            "../x.wav",
            "rel/x.wav",
            &format!("{}/../x.wav", abs.display()),
            &format!("{}/nope/x.wav", abs.display()),
            abs.to_str().unwrap(),
        ] {
            assert!(resolve_output(root, bad, "wav").is_err(), "{bad:?}");
        }
        assert_eq!(
            resolve_output(root, &format!("{}/nope/x.wav", abs.display()), "wav")
                .unwrap_err()
                .code(),
            "not_found"
        );
    }
}
