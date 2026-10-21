//! Library index: scans the Phyllo root for `.phyllo` files and summarizes them.
//!
//! Files are parsed leniently as `serde_json::Value`; the 3x16 punchcard previews are computed on the TS side.
//! "Last opened" times live in a sidecar (`.phyllo-index.json`, `path -> ISO`) so project files stay untouched.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use chrono::{DateTime, SecondsFormat, Utc};
use serde::Serialize;
use serde_json::Value;

use crate::error::{IoContext, Result};
use crate::project::{self, PROJECT_EXT};
use crate::{fsutil, paths};

/// Serializes read-modify-write cycles on the sidecar.
static INDEX_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackSummary {
    pub kind: String,
    pub color: String,
    pub pattern: String,
    pub source_type: String,
    pub mute: bool,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub name: String,
    pub tags: Vec<String>,
    pub favorite: bool,
    pub bpm: f64,
    pub beats_per_bar: u64,
    pub key: String,
    pub length_bars: u64,
    pub track_count: usize,
    pub created: String,
    pub modified: String,
    /// The first three tracks.
    pub tracks: Vec<TrackSummary>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub path: String,
    pub file_modified_ms: u64,
    pub summary: Summary,
    pub opened: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ScanError {
    pub path: String,
    pub message: String,
}

#[derive(Debug, Default, Serialize, PartialEq)]
pub struct LibraryScan {
    pub entries: Vec<LibraryEntry>,
    pub errors: Vec<ScanError>,
}

fn str_of(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn iso_from_ms(ms: u64) -> String {
    DateTime::<Utc>::from_timestamp_millis(ms as i64)
        .unwrap_or_default()
        .to_rfc3339_opts(SecondsFormat::Millis, true)
}

/// Build a summary from an already-validated project value. Missing fields fall back to defaults.
fn summarize(value: &Value, file_stem: &str, file_modified_ms: u64) -> Summary {
    let tempo = value.get("tempo");
    let tracks = value.get("tracks").and_then(Value::as_array);
    let modified = str_of(value, "modified").unwrap_or_else(|| iso_from_ms(file_modified_ms));
    Summary {
        id: str_of(value, "id").unwrap_or_else(|| file_stem.to_owned()),
        name: str_of(value, "name").unwrap_or_else(|| file_stem.to_owned()),
        tags: value
            .get("tags")
            .and_then(Value::as_array)
            .map(|a| {
                a.iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        favorite: value
            .get("favorite")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        bpm: tempo
            .and_then(|t| t.get("bpm"))
            .and_then(Value::as_f64)
            .unwrap_or(120.0),
        beats_per_bar: tempo
            .and_then(|t| t.get("beatsPerBar"))
            .and_then(Value::as_u64)
            .unwrap_or(4),
        key: str_of(value, "key").unwrap_or_default(),
        length_bars: value.get("lengthBars").and_then(Value::as_u64).unwrap_or(0),
        track_count: tracks.map_or(0, Vec::len),
        created: str_of(value, "created").unwrap_or_else(|| modified.clone()),
        modified,
        tracks: tracks
            .map(|a| {
                a.iter()
                    .take(3)
                    .map(|t| TrackSummary {
                        kind: str_of(t, "kind").unwrap_or_default(),
                        color: str_of(t, "color").unwrap_or_default(),
                        pattern: str_of(t, "pattern").unwrap_or_default(),
                        source_type: t
                            .get("source")
                            .and_then(|s| str_of(s, "type"))
                            .unwrap_or_default(),
                        mute: t.get("mute").and_then(Value::as_bool).unwrap_or(false),
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn read_opened(root: &Path) -> BTreeMap<String, String> {
    fs::read_to_string(paths::index_file(root))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn mtime_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64)
}

/// `*.phyllo` files directly inside `root` (sorted by path). `.history/` and `Exports/` are subfolders and
/// therefore never visited; dotfiles (macOS `._*` shadows, our temp files) are ignored.
fn project_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(root).at(root)? {
        let path = entry.at(root)?.path();
        let hidden = path
            .file_name()
            .is_none_or(|n| n.to_string_lossy().starts_with('.'));
        let is_project = path
            .extension()
            .is_some_and(|e| e.eq_ignore_ascii_case(PROJECT_EXT));
        if !hidden && is_project && path.is_file() {
            files.push(path);
        }
    }
    files.sort();
    Ok(files)
}

pub fn scan(root: &Path) -> Result<LibraryScan> {
    paths::ensure_dir(root)?;
    let opened = read_opened(root);
    let mut out = LibraryScan::default();
    for path in project_files(root)? {
        let shown = path.display().to_string();
        let loaded = (|| -> Result<LibraryEntry> {
            let text = fsutil::read_to_string(&path)?;
            let value = project::validate(&text)?;
            let modified_ms = mtime_ms(&fs::metadata(&path).at(&path)?);
            let stem = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            Ok(LibraryEntry {
                summary: summarize(&value, &stem, modified_ms),
                file_modified_ms: modified_ms,
                opened: opened.get(&shown).cloned(),
                path: shown.clone(),
            })
        })();
        match loaded {
            Ok(entry) => out.entries.push(entry),
            Err(e) => out.errors.push(ScanError {
                path: shown,
                message: e.to_string(),
            }),
        }
    }
    Ok(out)
}

/// Record "opened now" for `path` in the sidecar.
pub fn mark_opened(root: &Path, path: &str) -> Result<()> {
    mark_opened_at(root, path, Utc::now())
}

fn mark_opened_at(root: &Path, path: &str, at: DateTime<Utc>) -> Result<()> {
    paths::ensure_dir(root)?;
    let _guard = INDEX_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut index = read_opened(root);
    index.insert(
        path.to_owned(),
        at.to_rfc3339_opts(SecondsFormat::Millis, true),
    );
    let json = serde_json::to_string_pretty(&index)?;
    fsutil::atomic_write(&paths::index_file(root), json.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn project_json(name: &str, extra: Value) -> String {
        let mut v = json!({
            "format": "phyllo/1", "id": format!("id-{name}"), "name": name, "tags": ["house", "sketch"],
            "favorite": true, "created": "2026-10-21T12:00:00Z", "modified": "2026-10-21T12:41:00Z",
            "tempo": { "bpm": 124, "beatsPerBar": 4 }, "key": "C minor", "lengthBars": 32,
            "tracks": [
                { "kind": "drum", "color": "#7FD98A", "pattern": "bd*4", "source": { "type": "s" }, "mute": false },
                { "kind": "melodic", "color": "#F5C25B", "pattern": "c2", "source": { "type": "note" }, "mute": true },
                { "kind": "chord", "color": "#8AB4FF", "pattern": "<Cm>", "source": { "type": "chord" } },
                { "kind": "sample", "color": "#B9A2FF", "pattern": "vox", "source": { "type": "s" } }
            ]
        });
        if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) {
            o.extend(e.clone());
        }
        v.to_string()
    }

    #[test]
    fn scan_summarizes_valid_files_and_reports_invalid_ones() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::write(root.join("b.phyllo"), project_json("B", json!({}))).unwrap();
        fs::write(root.join("a.phyllo"), project_json("A", json!({}))).unwrap();
        fs::write(root.join("broken.phyllo"), "{ nope").unwrap();
        fs::write(root.join("wrong.phyllo"), r#"{"format":"other/9"}"#).unwrap();
        fs::write(root.join("notes.txt"), "ignored").unwrap();
        fs::write(root.join("._a.phyllo"), "ignored").unwrap();
        // Subfolders (history, exports) are never visited.
        fs::create_dir_all(root.join(".history/x")).unwrap();
        fs::write(
            root.join(".history/x/h.phyllo"),
            project_json("H", json!({})),
        )
        .unwrap();
        fs::create_dir_all(root.join("Exports")).unwrap();
        fs::write(root.join("Exports/e.phyllo"), project_json("E", json!({}))).unwrap();

        let scan = scan(root).unwrap();
        let names: Vec<_> = scan
            .entries
            .iter()
            .map(|e| e.summary.name.as_str())
            .collect();
        assert_eq!(names, ["A", "B"]);
        let errs: Vec<_> = scan
            .errors
            .iter()
            .map(|e| {
                Path::new(&e.path)
                    .file_name()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        assert_eq!(errs, ["broken.phyllo", "wrong.phyllo"]);

        let a = &scan.entries[0];
        assert_eq!(a.summary.bpm, 124.0);
        assert_eq!(a.summary.beats_per_bar, 4);
        assert_eq!(a.summary.length_bars, 32);
        assert_eq!(a.summary.track_count, 4);
        assert_eq!(a.summary.tracks.len(), 3, "only the first three tracks");
        assert!(a.summary.tracks[1].mute);
        assert_eq!(a.summary.tracks[2].source_type, "chord");
        assert_eq!(a.summary.tags, ["house", "sketch"]);
        assert!(a.summary.favorite);
        assert!(a.file_modified_ms > 0);
        assert_eq!(a.opened, None);
    }

    #[test]
    fn camel_case_wire_shape() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("a.phyllo"), project_json("A", json!({}))).unwrap();
        let v = serde_json::to_value(scan(tmp.path()).unwrap()).unwrap();
        let e = &v["entries"][0];
        assert!(e["fileModifiedMs"].is_u64());
        assert!(e["opened"].is_null());
        assert_eq!(e["summary"]["beatsPerBar"], 4);
        assert_eq!(e["summary"]["lengthBars"], 32);
        assert_eq!(e["summary"]["trackCount"], 4);
        assert_eq!(e["summary"]["tracks"][0]["sourceType"], "s");
        assert!(v["errors"].as_array().unwrap().is_empty());
    }

    #[test]
    fn lenient_defaults_for_sparse_files() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("Sparse.phyllo"), r#"{"format":"phyllo/1"}"#).unwrap();
        let scan = scan(tmp.path()).unwrap();
        let s = &scan.entries[0].summary;
        assert_eq!((s.id.as_str(), s.name.as_str()), ("Sparse", "Sparse"));
        assert_eq!((s.bpm, s.beats_per_bar, s.track_count), (120.0, 4, 0));
        assert!(!s.modified.is_empty() && s.created == s.modified);
    }

    #[test]
    fn opened_sidecar_round_trip_and_not_scanned_as_project() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        let file = root.join("a.phyllo");
        fs::write(&file, project_json("A", json!({}))).unwrap();
        let key = file.display().to_string();
        mark_opened_at(root, &key, "2026-10-21T10:00:00Z".parse().unwrap()).unwrap();
        mark_opened_at(root, "/elsewhere.phyllo", Utc::now()).unwrap();
        let scan = scan(root).unwrap();
        assert_eq!(scan.entries.len(), 1);
        assert_eq!(
            scan.entries[0].opened.as_deref(),
            Some("2026-10-21T10:00:00.000Z")
        );
        assert!(scan.errors.is_empty());
    }

    #[test]
    fn scan_creates_a_missing_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("fresh");
        let scan = scan(&root).unwrap();
        assert!(root.is_dir() && scan.entries.is_empty() && scan.errors.is_empty());
    }
}
