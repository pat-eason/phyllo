//! Version history: `.history/<projectId>/<timestamp>.json`, newest 50 kept.

use std::fs;
use std::path::Path;

use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, Utc};
use serde::Serialize;

use crate::error::{Error, IoContext, Result};
use crate::{fsutil, paths, project};

pub const KEEP: usize = 50;
const ID_FORMAT: &str = "%Y%m%dT%H%M%S%3fZ";
const EXT: &str = "json";

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    /// Sortable timestamp, e.g. `20261021T124100123Z`.
    pub id: String,
    /// ISO 8601
    pub taken_at: String,
    pub size_bytes: u64,
}

/// `20261021T124100123Z` -> `2026-10-21T12:41:00.123Z`.
fn parse_id(id: &str) -> Option<DateTime<Utc>> {
    NaiveDateTime::parse_from_str(id, ID_FORMAT)
        .ok()
        .map(|t| t.and_utc())
}

fn taken_at(id: &str) -> Option<String> {
    parse_id(id).map(|t| t.to_rfc3339_opts(SecondsFormat::Millis, true))
}

/// Ids of existing snapshots in `dir`, newest first. Unknown files are ignored.
fn ids(dir: &Path) -> Result<Vec<String>> {
    let read = match fs::read_dir(dir) {
        Ok(r) => r,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e).at(dir),
    };
    let mut ids: Vec<String> = Vec::new();
    for entry in read {
        let path = entry.at(dir)?.path();
        let stem = path
            .extension()
            .filter(|e| *e == EXT)
            .and_then(|_| path.file_stem())
            .map(|s| s.to_string_lossy().into_owned());
        if let Some(stem) = stem.filter(|s| taken_at(s).is_some()) {
            ids.push(stem);
        }
    }
    ids.sort_unstable_by(|a, b| b.cmp(a));
    Ok(ids)
}

fn info(dir: &Path, id: String) -> Result<SnapshotInfo> {
    let path = dir.join(format!("{id}.{EXT}"));
    let size_bytes = fs::metadata(&path).at(&path)?.len();
    let taken_at = taken_at(&id).unwrap_or_default();
    Ok(SnapshotInfo {
        id,
        taken_at,
        size_bytes,
    })
}

pub fn snapshot(root: &Path, project_id: &str, json: &str) -> Result<SnapshotInfo> {
    snapshot_at(root, project_id, json, Utc::now())
}

fn snapshot_at(
    root: &Path,
    project_id: &str,
    json: &str,
    now: DateTime<Utc>,
) -> Result<SnapshotInfo> {
    project::validate(json)?;
    let dir = paths::history_dir(root, project_id)?;
    paths::ensure_dir(&dir)?;
    // Millisecond ids that must sort strictly after the newest existing snapshot (same-millisecond saves, clock
    // going backwards); otherwise a new snapshot could land below the pruning cutoff and be deleted at once.
    let newest = ids(&dir)?.first().and_then(|id| parse_id(id));
    let at = match newest {
        Some(newest) if now <= newest => newest + Duration::milliseconds(1),
        _ => now,
    };
    let id = at.format(ID_FORMAT).to_string();
    fsutil::atomic_write(&dir.join(format!("{id}.{EXT}")), json.as_bytes())?;
    for stale in ids(&dir)?.into_iter().skip(KEEP) {
        let path = dir.join(format!("{stale}.{EXT}"));
        fs::remove_file(&path).at(&path)?;
    }
    info(&dir, id)
}

/// Snapshots newest first.
pub fn list(root: &Path, project_id: &str) -> Result<Vec<SnapshotInfo>> {
    let dir = paths::history_dir(root, project_id)?;
    ids(&dir)?.into_iter().map(|id| info(&dir, id)).collect()
}

pub fn read(root: &Path, project_id: &str, snapshot_id: &str) -> Result<String> {
    paths::check_component("snapshot id", snapshot_id)?;
    let path = paths::history_dir(root, project_id)?.join(format!("{snapshot_id}.{EXT}"));
    if !path.is_file() {
        return Err(Error::NotFound(format!(
            "snapshot {snapshot_id} of {project_id}"
        )));
    }
    fsutil::read_to_string(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn doc(n: usize) -> String {
        format!(r#"{{"format":"phyllo/1","id":"p","rev":{n}}}"#)
    }

    #[test]
    fn snapshot_list_read_newest_first() {
        let tmp = tempfile::tempdir().unwrap();
        let t0: DateTime<Utc> = "2026-10-21T12:00:00Z".parse().unwrap();
        let a = snapshot_at(tmp.path(), "p", &doc(1), t0).unwrap();
        let b = snapshot_at(tmp.path(), "p", &doc(2), t0 + Duration::seconds(5)).unwrap();
        assert_eq!(a.taken_at, "2026-10-21T12:00:00.000Z");
        assert_eq!(a.size_bytes, doc(1).len() as u64);

        let listed = list(tmp.path(), "p").unwrap();
        assert_eq!(
            listed.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            [b.id.as_str(), a.id.as_str()]
        );
        assert_eq!(read(tmp.path(), "p", &a.id).unwrap(), doc(1));
        assert_eq!(
            read(tmp.path(), "p", "20000101T000000000Z")
                .unwrap_err()
                .code(),
            "not_found"
        );
        assert!(list(tmp.path(), "other").unwrap().is_empty());
    }

    #[test]
    fn same_millisecond_snapshots_do_not_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let t: DateTime<Utc> = "2026-10-21T12:00:00Z".parse().unwrap();
        let a = snapshot_at(tmp.path(), "p", &doc(1), t).unwrap();
        let b = snapshot_at(tmp.path(), "p", &doc(2), t).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(read(tmp.path(), "p", &a.id).unwrap(), doc(1));
        assert_eq!(read(tmp.path(), "p", &b.id).unwrap(), doc(2));
    }

    #[test]
    fn a_full_history_keeps_same_millisecond_snapshots() {
        let tmp = tempfile::tempdir().unwrap();
        let t: DateTime<Utc> = "2026-10-21T12:00:00Z".parse().unwrap();
        for i in 0..(KEEP + 10) {
            let info = snapshot_at(tmp.path(), "p", &doc(i), t).unwrap();
            assert_eq!(
                read(tmp.path(), "p", &info.id).unwrap(),
                doc(i),
                "snapshot {i} must survive pruning"
            );
        }
        // A clock that jumped backwards still produces the newest snapshot.
        let back = snapshot_at(tmp.path(), "p", &doc(999), t - Duration::days(1)).unwrap();
        assert_eq!(list(tmp.path(), "p").unwrap()[0].id, back.id);
    }

    #[test]
    fn prunes_to_the_newest_fifty() {
        let tmp = tempfile::tempdir().unwrap();
        let t0: DateTime<Utc> = "2026-10-21T12:00:00Z".parse().unwrap();
        for i in 0..60 {
            snapshot_at(tmp.path(), "p", &doc(i), t0 + Duration::seconds(i as i64)).unwrap();
        }
        let listed = list(tmp.path(), "p").unwrap();
        assert_eq!(listed.len(), KEEP);
        // Newest survives, the 10 oldest are gone.
        assert_eq!(read(tmp.path(), "p", &listed[0].id).unwrap(), doc(59));
        assert_eq!(
            read(tmp.path(), "p", &listed[KEEP - 1].id).unwrap(),
            doc(10)
        );
        let files = fs::read_dir(paths::history_dir(tmp.path(), "p").unwrap())
            .unwrap()
            .count();
        assert_eq!(files, KEEP, "no temp files left behind");
    }

    #[test]
    fn rejects_bad_ids_and_invalid_documents() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(
            snapshot(tmp.path(), "../evil", &doc(1)).unwrap_err().code(),
            "invalid_argument"
        );
        assert_eq!(
            read(tmp.path(), "p", "../x").unwrap_err().code(),
            "invalid_argument"
        );
        assert_eq!(
            snapshot(tmp.path(), "p", "nope").unwrap_err().code(),
            "json"
        );
        assert!(list(tmp.path(), "p").unwrap().is_empty());
    }
}
