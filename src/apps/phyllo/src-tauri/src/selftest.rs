//! In-app self-test support (T7.5a): the definition-of-done flow runs inside the real web view with the real engine
//! and native layer, driven by `src/selftest/` in the frontend. Off unless the app is launched with
//! `PHYLLO_SELFTEST=1` (see `scripts/selftest.sh`); every command below refuses to act otherwise.
//!
//! The commands live here rather than in `commands.rs` on purpose: they are test plumbing, not part of the app's
//! `NativeApi` / `COMMANDS` contract, and the frontend calls them with `invoke` from `src/selftest/` only.

use std::ffi::OsString;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::{Error, IoContext, Result};
use crate::fsutil;

// ── commands ───────────────────────────────────────────────────────────────

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| Error::Internal(e.to_string()))?
}

#[tauri::command]
pub fn selftest_config(config: State<'_, SelftestConfig>) -> SelftestConfig {
    config.inner().clone()
}

/// Write the report JSON to the configured path (the web view never chooses the path).
#[tauri::command]
pub async fn selftest_write_report(config: State<'_, SelftestConfig>, json: String) -> Result<()> {
    let path = config.require()?;
    blocking(move || write_report(&path, &json)).await
}

/// Header + peak of an exported WAV (or the STREAMINFO of a FLAC).
#[tauri::command]
pub async fn selftest_inspect_wav(
    config: State<'_, SelftestConfig>,
    path: String,
) -> Result<AudioInfo> {
    config.require()?;
    blocking(move || inspect_audio(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn selftest_file_info(
    config: State<'_, SelftestConfig>,
    path: String,
) -> Result<FileInfo> {
    config.require()?;
    blocking(move || file_info(&PathBuf::from(path))).await
}

/// Quit with `code` once the report is written.
#[tauri::command]
pub fn selftest_exit(app: AppHandle, config: State<'_, SelftestConfig>, code: i32) -> Result<()> {
    config.require()?;
    app.exit(code);
    Ok(())
}

// ── pure parts ─────────────────────────────────────────────────────────────

pub const ENV_ENABLED: &str = "PHYLLO_SELFTEST";
/// Where the report goes; default `$TMPDIR/phyllo-selftest-report.json`.
pub const ENV_REPORT: &str = "PHYLLO_SELFTEST_REPORT";
const DEFAULT_REPORT: &str = "phyllo-selftest-report.json";

/// Read once at startup (managed state).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SelftestConfig {
    pub enabled: bool,
    pub report_path: Option<String>,
}

impl SelftestConfig {
    pub fn from_env() -> Self {
        Self::from_values(
            std::env::var_os(ENV_ENABLED),
            std::env::var_os(ENV_REPORT),
            std::env::temp_dir(),
        )
    }

    /// `enabled` is `1` / `true` (case-insensitive); anything else, or unset, is off.
    pub fn from_values(enabled: Option<OsString>, report: Option<OsString>, tmp: PathBuf) -> Self {
        let on = enabled
            .and_then(|v| v.into_string().ok())
            .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
        if !on {
            return Self {
                enabled: false,
                report_path: None,
            };
        }
        let path = report
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| tmp.join(DEFAULT_REPORT));
        Self {
            enabled: true,
            report_path: Some(path.display().to_string()),
        }
    }

    /// The report path, or `invalid_argument` when the self-test is off.
    pub fn require(&self) -> Result<PathBuf> {
        match (&self.report_path, self.enabled) {
            (Some(p), true) => Ok(PathBuf::from(p)),
            _ => Err(Error::InvalidArgument(format!(
                "self-test is off (launch with {ENV_ENABLED}=1)"
            ))),
        }
    }
}

/// Validates `json` and writes it atomically to `path`.
pub fn write_report(path: &Path, json: &str) -> Result<()> {
    let value: serde_json::Value = serde_json::from_str(json)?;
    let pretty = serde_json::to_vec_pretty(&value)?;
    fsutil::atomic_write(path, &pretty)
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioInfo {
    /// `wav` or `flac`
    pub format: &'static str,
    pub sample_rate: u32,
    pub channels: u16,
    pub bits_per_sample: u16,
    pub frames: u64,
    /// Linear sample peak 0–1 (WAV only; FLAC reports the STREAMINFO header without decoding).
    pub peak: Option<f64>,
    pub size_bytes: u64,
}

/// Header (and, for WAV, peak) of an exported audio file.
pub fn inspect_audio(path: &Path) -> Result<AudioInfo> {
    let size_bytes = fs::metadata(path).at(path)?.len();
    let mut magic = [0u8; 4];
    fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut magic))
        .at(path)?;
    match &magic {
        b"RIFF" => inspect_wav(path, size_bytes),
        b"fLaC" => inspect_flac(path, size_bytes),
        _ => Err(Error::InvalidFormat(format!(
            "{}: not a WAV or FLAC file",
            path.display()
        ))),
    }
}

fn inspect_wav(path: &Path, size_bytes: u64) -> Result<AudioInfo> {
    let bad = |e: hound::Error| Error::InvalidFormat(format!("{}: {e}", path.display()));
    let mut reader = hound::WavReader::open(path).map_err(bad)?;
    let spec = reader.spec();
    let frames = u64::from(reader.duration());
    let mut peak = 0f64;
    match spec.sample_format {
        hound::SampleFormat::Float => {
            for s in reader.samples::<f32>() {
                peak = peak.max(f64::from(s.map_err(bad)?.abs()));
            }
        }
        hound::SampleFormat::Int => {
            let full = f64::from(1u32 << (spec.bits_per_sample - 1));
            for s in reader.samples::<i32>() {
                peak = peak.max(f64::from(s.map_err(bad)?).abs() / full);
            }
        }
    }
    Ok(AudioInfo {
        format: "wav",
        sample_rate: spec.sample_rate,
        channels: spec.channels,
        bits_per_sample: spec.bits_per_sample,
        frames,
        peak: Some(peak),
        size_bytes,
    })
}

/// STREAMINFO is always the first metadata block: `fLaC`, a 4-byte block header, then 34 bytes.
fn inspect_flac(path: &Path, size_bytes: u64) -> Result<AudioInfo> {
    let mut head = [0u8; 42];
    fs::File::open(path)
        .and_then(|mut f| f.read_exact(&mut head))
        .at(path)?;
    if head[4] & 0x7f != 0 {
        return Err(Error::InvalidFormat(format!(
            "{}: first FLAC block is not STREAMINFO",
            path.display()
        )));
    }
    // STREAMINFO bytes 10..18: 20 bits rate, 3 bits channels-1, 5 bits bps-1, 36 bits total samples.
    let b = &head[8 + 10..8 + 18];
    let packed = b.iter().fold(0u64, |acc, &x| (acc << 8) | u64::from(x));
    let sample_rate = (packed >> 44) as u32;
    let channels = ((packed >> 41) & 0x7) as u16 + 1;
    let bits_per_sample = ((packed >> 36) & 0x1f) as u16 + 1;
    let frames = packed & 0xf_ffff_ffff;
    Ok(AudioInfo {
        format: "flac",
        sample_rate,
        channels,
        bits_per_sample,
        frames,
        peak: None,
        size_bytes,
    })
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub exists: bool,
    pub size_bytes: u64,
    /// First up to 4 bytes as lossy ASCII (`MThd`, `RIFF`, `fLaC`, `{\n  `).
    pub magic: String,
}

pub fn file_info(path: &Path) -> Result<FileInfo> {
    let Ok(meta) = fs::metadata(path) else {
        return Ok(FileInfo {
            exists: false,
            size_bytes: 0,
            magic: String::new(),
        });
    };
    let mut magic = Vec::with_capacity(4);
    fs::File::open(path)
        .and_then(|f| f.take(4).read_to_end(&mut magic))
        .at(path)?;
    Ok(FileInfo {
        exists: meta.is_file(),
        size_bytes: meta.len(),
        magic: String::from_utf8_lossy(&magic).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(s: &str) -> Option<OsString> {
        Some(OsString::from(s))
    }

    #[test]
    fn config_is_off_unless_flag_set() {
        let tmp = PathBuf::from("/t");
        let off = SelftestConfig::from_values(None, os("/r.json"), tmp.clone());
        assert!(!off.enabled);
        assert!(off.require().is_err());
        assert!(!SelftestConfig::from_values(os("0"), None, tmp.clone()).enabled);
        assert!(!SelftestConfig::from_values(os("yes"), None, tmp.clone()).enabled);

        let on = SelftestConfig::from_values(os("1"), None, tmp.clone());
        assert_eq!(
            on.report_path.as_deref(),
            Some("/t/phyllo-selftest-report.json")
        );
        let custom = SelftestConfig::from_values(os("TRUE"), os("/x/r.json"), tmp);
        assert_eq!(custom.require().unwrap(), PathBuf::from("/x/r.json"));
    }

    #[test]
    fn report_must_be_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("r.json");
        assert_eq!(write_report(&path, "{nope").unwrap_err().code(), "json");
        write_report(&path, r#"{"ok":true}"#).unwrap();
        let back: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(back, serde_json::json!({ "ok": true }));
    }

    #[test]
    fn inspects_24_bit_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48000,
            bits_per_sample: 24,
            sample_format: hound::SampleFormat::Int,
        };
        let mut w = hound::WavWriter::create(&path, spec).unwrap();
        for i in 0..100 {
            let v = if i == 50 { -(1 << 22) } else { 0 };
            w.write_sample(v).unwrap();
            w.write_sample(0).unwrap();
        }
        w.finalize().unwrap();
        let info = inspect_audio(&path).unwrap();
        assert_eq!(
            (
                info.format,
                info.sample_rate,
                info.channels,
                info.bits_per_sample,
                info.frames
            ),
            ("wav", 48000, 2, 24, 100)
        );
        assert!((info.peak.unwrap() - 0.5).abs() < 1e-9);
        // hound writes WAVE_FORMAT_EXTENSIBLE (68-byte header) for 24-bit
        assert_eq!(info.size_bytes, 68 + 100 * 2 * 3);
    }

    #[test]
    fn inspects_flac_streaminfo() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.flac");
        // 48 kHz, stereo, 24-bit, 123456 samples
        let packed: u64 = (48000u64 << 44) | (1 << 41) | (23 << 36) | 123_456;
        let mut bytes = b"fLaC".to_vec();
        bytes.extend_from_slice(&[0x80, 0, 0, 34]); // last block, STREAMINFO, length 34
        bytes.extend_from_slice(&[0; 10]); // block / frame sizes
        bytes.extend_from_slice(&packed.to_be_bytes());
        bytes.extend_from_slice(&[0; 16]); // MD5
        fs::write(&path, &bytes).unwrap();
        let info = inspect_audio(&path).unwrap();
        assert_eq!(
            (
                info.format,
                info.sample_rate,
                info.channels,
                info.bits_per_sample,
                info.frames
            ),
            ("flac", 48000, 2, 24, 123_456)
        );
        assert_eq!(info.peak, None);
    }

    #[test]
    fn rejects_other_files_and_reports_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.mid");
        fs::write(&path, b"MThd\0\0\0\x06").unwrap();
        assert_eq!(inspect_audio(&path).unwrap_err().code(), "invalid_format");
        let info = file_info(&path).unwrap();
        assert_eq!(
            (info.exists, info.size_bytes, info.magic.as_str()),
            (true, 8, "MThd")
        );
        assert!(!file_info(&dir.path().join("none")).unwrap().exists);
        assert_eq!(
            inspect_audio(&dir.path().join("none")).unwrap_err().code(),
            "not_found"
        );
    }
}
