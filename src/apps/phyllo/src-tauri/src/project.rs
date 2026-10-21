//! `.phyllo` project files and `.strudel` text files.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::error::{Error, Result};
use crate::{fsutil, paths};

pub const FORMAT: &str = "phyllo/1";
pub const PROJECT_EXT: &str = "phyllo";
const DEFAULT_NAME: &str = "Untitled Groove";
const MAX_NAME_CHARS: usize = 100;

/// Parse `json` and require `"format": "phyllo/1"`.
pub fn validate(json: &str) -> Result<Value> {
    let value: Value = serde_json::from_str(json)?;
    match value.get("format").and_then(Value::as_str) {
        Some(FORMAT) => Ok(value),
        Some(other) => Err(Error::InvalidFormat(format!(
            "unsupported project format {other:?} (expected \"{FORMAT}\")"
        ))),
        None => Err(Error::InvalidFormat(format!(
            "missing \"format\" field (expected \"{FORMAT}\")"
        ))),
    }
}

/// Read a project file as JSON text (not validated; the caller parses it).
pub fn read(path: &Path) -> Result<String> {
    fsutil::read_to_string(path)
}

/// Validate then write atomically.
pub fn write(path: &Path, json: &str) -> Result<()> {
    validate(json)?;
    fsutil::atomic_write(path, json.as_bytes())
}

/// Make `name` safe as a file stem on macOS, Windows and Linux.
pub fn sanitize_file_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated: String = collapsed.chars().take(MAX_NAME_CHARS).collect();
    let trimmed = truncated.trim_matches(|c: char| c == '.' || c.is_whitespace());
    if trimmed.is_empty() {
        DEFAULT_NAME.to_string()
    } else {
        trimmed.to_string()
    }
}

/// `<root>/<Name>.phyllo`, or `<Name> 2.phyllo`, `<Name> 3.phyllo`… when the name is taken.
pub fn new_path(root: &Path, name: &str) -> Result<PathBuf> {
    paths::ensure_dir(root)?;
    let stem = sanitize_file_stem(name);
    let mut candidate = root.join(format!("{stem}.{PROJECT_EXT}"));
    let mut n = 2u32;
    while candidate.exists() {
        candidate = root.join(format!("{stem} {n}.{PROJECT_EXT}"));
        n += 1;
    }
    Ok(candidate)
}

pub fn text_read(path: &Path) -> Result<String> {
    fsutil::read_to_string(path)
}

pub fn text_write(path: &Path, code: &str) -> Result<()> {
    fsutil::atomic_write(path, code.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const VALID: &str = r#"{"format":"phyllo/1","id":"a","name":"A"}"#;

    #[test]
    fn write_validates_format_and_json() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("a.phyllo");
        assert_eq!(write(&p, "not json").unwrap_err().code(), "json");
        assert_eq!(
            write(&p, r#"{"name":"x"}"#).unwrap_err().code(),
            "invalid_format"
        );
        assert_eq!(
            write(&p, r#"{"format":"phyllo/2"}"#).unwrap_err().code(),
            "invalid_format"
        );
        assert!(!p.exists(), "invalid input must not create the file");
        write(&p, VALID).unwrap();
        assert_eq!(read(&p).unwrap(), VALID);
    }

    #[test]
    fn invalid_write_keeps_the_previous_file() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("a.phyllo");
        write(&p, VALID).unwrap();
        assert!(write(&p, "{").is_err());
        assert_eq!(fs::read_to_string(&p).unwrap(), VALID);
    }

    #[test]
    fn new_path_suffixes_on_collision() {
        let tmp = tempfile::tempdir().unwrap();
        let first = new_path(tmp.path(), "My Groove").unwrap();
        assert_eq!(first.file_name().unwrap(), "My Groove.phyllo");
        fs::write(&first, VALID).unwrap();
        let second = new_path(tmp.path(), "My Groove").unwrap();
        assert_eq!(second.file_name().unwrap(), "My Groove 2.phyllo");
        fs::write(&second, VALID).unwrap();
        let third = new_path(tmp.path(), "My Groove").unwrap();
        assert_eq!(third.file_name().unwrap(), "My Groove 3.phyllo");
    }

    #[test]
    fn new_path_creates_the_root_and_sanitizes() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Phyllo");
        let p = new_path(&root, "  a/b:c?  ").unwrap();
        assert!(root.is_dir());
        assert_eq!(p.file_name().unwrap(), "a-b-c-.phyllo");
        assert_eq!(sanitize_file_stem("..."), DEFAULT_NAME);
        assert_eq!(sanitize_file_stem(""), DEFAULT_NAME);
        assert_eq!(
            sanitize_file_stem(&"x".repeat(300)).chars().count(),
            MAX_NAME_CHARS
        );
    }

    #[test]
    fn strudel_text_round_trip() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("s.strudel");
        text_write(&p, "$: s(\"bd\")").unwrap();
        assert_eq!(text_read(&p).unwrap(), "$: s(\"bd\")");
        assert_eq!(
            text_read(&tmp.path().join("nope.strudel"))
                .unwrap_err()
                .code(),
            "not_found"
        );
    }
}
