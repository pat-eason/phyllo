//! Filesystem layout: `~/Music/Phyllo/` (override with `PHYLLO_HOME`), `Exports/`, `.history/<projectId>/`.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{Error, IoContext, Result};

pub const ENV_HOME: &str = "PHYLLO_HOME";
pub const EXPORTS_DIR: &str = "Exports";
pub const HISTORY_DIR: &str = ".history";
pub const INDEX_FILE: &str = ".phyllo-index.json";

/// Root folder for projects. Does not create it.
pub fn root() -> Result<PathBuf> {
    if let Some(home) = std::env::var_os(ENV_HOME).filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(home));
    }
    dirs::audio_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Music")))
        .map(|m| m.join("Phyllo"))
        .ok_or_else(|| Error::Internal("cannot resolve the home directory".into()))
}

/// Create `dir` (and parents) if missing.
pub fn ensure_dir(dir: &Path) -> Result<()> {
    fs::create_dir_all(dir).at(dir)
}

pub fn exports_dir(root: &Path) -> PathBuf {
    root.join(EXPORTS_DIR)
}

pub fn index_file(root: &Path) -> PathBuf {
    root.join(INDEX_FILE)
}

/// `.history/<projectId>/`. The id must be a plain file-name component.
pub fn history_dir(root: &Path, project_id: &str) -> Result<PathBuf> {
    check_component("project id", project_id)?;
    Ok(root.join(HISTORY_DIR).join(project_id))
}

/// Reject anything that could escape its parent directory.
pub fn check_component(what: &str, value: &str) -> Result<()> {
    let ok = !value.is_empty()
        && value != "."
        && value != ".."
        && value.len() <= 128
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if ok {
        Ok(())
    } else {
        Err(Error::InvalidArgument(format!("invalid {what}: {value:?}")))
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PhylloPaths {
    pub root: String,
    pub exports: String,
}

/// Resolve and create the root and `Exports/`.
pub fn resolve_all() -> Result<PhylloPaths> {
    let root = root()?;
    ensure_dir(&root)?;
    let exports = exports_dir(&root);
    ensure_dir(&exports)?;
    Ok(PhylloPaths {
        root: root.display().to_string(),
        exports: exports.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_override_and_on_demand_creation() {
        // The only test that touches the process environment; everything else passes an explicit root.
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path().join("nested").join("Phyllo");
        unsafe { std::env::set_var(ENV_HOME, &home) };
        let paths = resolve_all().unwrap();
        unsafe { std::env::remove_var(ENV_HOME) };
        assert_eq!(paths.root, home.display().to_string());
        assert!(home.join("Exports").is_dir());
    }

    #[test]
    fn components_reject_traversal() {
        for bad in ["", ".", "..", "a/b", "a\\b", "../x", "x y"] {
            assert!(check_component("id", bad).is_err(), "{bad:?}");
        }
        assert!(check_component("id", "3f2a-b.c_d").is_ok());
        assert!(
            history_dir(Path::new("/r"), "abc")
                .unwrap()
                .ends_with(".history/abc")
        );
    }
}
