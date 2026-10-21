//! User sample folders (SPEC §4.5): recursive scan, Strudel-safe sound names.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use walkdir::WalkDir;

use crate::error::{Error, Result};

pub const AUDIO_EXTS: &[&str] = &["wav", "aif", "aiff", "flac", "mp3", "ogg", "m4a"];

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SampleFile {
    /// Strudel sound name, e.g. `vox` for `vox.wav`.
    pub name: String,
    pub path: String,
    /// Lowercase extension without the dot.
    pub ext: String,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct SampleScan {
    pub path: String,
    pub files: Vec<SampleFile>,
}

pub fn is_audio_ext(ext: &str) -> bool {
    AUDIO_EXTS.iter().any(|e| e.eq_ignore_ascii_case(ext))
}

/// Lowercase, keep `[a-z0-9]`, collapse every other run into `_`. Safe inside mini-notation (`s("vox")`).
pub fn sound_name(stem: &str) -> String {
    let mut out = String::new();
    for c in stem.chars().flat_map(char::to_lowercase) {
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches('_');
    if trimmed.is_empty() {
        "sample".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Recursively list audio files under `folder`, sorted by path; later duplicates get `2`, `3`… suffixes.
/// Hidden files and folders (`.DS_Store`, `._foo.wav`, `.git`) are skipped.
pub fn scan(folder: &Path) -> Result<SampleScan> {
    if !folder.is_dir() {
        return Err(Error::NotFound(format!(
            "sample folder {}",
            folder.display()
        )));
    }
    let mut found: Vec<(std::path::PathBuf, String, String)> = Vec::new();
    let walker = WalkDir::new(folder)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || !e.file_name().to_string_lossy().starts_with('.'));
    for entry in walker {
        let entry = entry.map_err(|e| Error::Internal(e.to_string()))?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let Some(ext) = path.extension().map(|e| e.to_string_lossy().to_lowercase()) else {
            continue;
        };
        if !is_audio_ext(&ext) {
            continue;
        }
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        found.push((path.to_path_buf(), sound_name(&stem), ext));
    }
    found.sort_by(|a, b| a.0.cmp(&b.0));

    let mut used: HashSet<String> = HashSet::new();
    let mut files = Vec::with_capacity(found.len());
    for (path, base, ext) in found {
        let mut name = base.clone();
        let mut n = 2u32;
        while !used.insert(name.clone()) {
            name = format!("{base}{n}");
            n += 1;
        }
        files.push(SampleFile {
            name,
            path: path.display().to_string(),
            ext,
        });
    }
    Ok(SampleScan {
        path: folder.display().to_string(),
        files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn touch(root: &Path, rel: &str) {
        let p = root.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, b"x").unwrap();
    }

    #[test]
    fn names_are_strudel_safe() {
        assert_eq!(sound_name("vox"), "vox");
        assert_eq!(sound_name("Kick Drum - 01"), "kick_drum_01");
        assert_eq!(sound_name("__Snare!!"), "snare");
        assert_eq!(sound_name("808.hat"), "808_hat");
        assert_eq!(sound_name("***"), "sample");
        assert_eq!(sound_name("Ünïcode"), "n_code");
    }

    #[test]
    fn scans_recursively_filters_extensions_and_hidden_files() {
        let tmp = tempfile::tempdir().unwrap();
        let r = tmp.path();
        for f in [
            "vox.wav",
            "kit/Kick.WAV",
            "kit/snare.flac",
            "kit/deep/loop.m4a",
            "a.aif",
            "b.aiff",
            "c.mp3",
            "d.ogg",
        ] {
            touch(r, f);
        }
        for f in [
            "notes.txt",
            "kit/readme.md",
            ".DS_Store",
            "._vox.wav",
            ".hidden/x.wav",
            "noext",
        ] {
            touch(r, f);
        }
        let scan = scan(r).unwrap();
        let names: Vec<_> = scan.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(names, ["a", "b", "c", "d", "kick", "loop", "snare", "vox"]);
        let kick = scan.files.iter().find(|f| f.name == "kick").unwrap();
        assert_eq!(kick.ext, "wav");
        assert!(kick.path.ends_with("kit/Kick.WAV"));
    }

    #[test]
    fn name_collisions_get_deterministic_numeric_suffixes() {
        let tmp = tempfile::tempdir().unwrap();
        let r = tmp.path();
        for f in [
            "a/vox.wav",
            "b/vox.wav",
            "b/Vox.mp3",
            "c/vox.flac",
            "c/vox2.wav",
        ] {
            touch(r, f);
        }
        let first = scan(r).unwrap();
        let pairs: Vec<_> = first
            .files
            .iter()
            .map(|f| {
                (
                    f.name.clone(),
                    f.path
                        .strip_prefix(&r.display().to_string())
                        .unwrap()
                        .to_owned(),
                )
            })
            .collect();
        // Sorted by path: a/vox.wav, b/Vox.mp3 (uppercase sorts first), b/vox.wav, c/vox.flac, c/vox2.wav
        assert_eq!(
            pairs,
            [
                ("vox".to_owned(), "/a/vox.wav".to_owned()),
                ("vox2".to_owned(), "/b/Vox.mp3".to_owned()),
                ("vox3".to_owned(), "/b/vox.wav".to_owned()),
                ("vox4".to_owned(), "/c/vox.flac".to_owned()),
                ("vox22".to_owned(), "/c/vox2.wav".to_owned()),
            ]
        );
        assert_eq!(scan(r).unwrap(), first, "deterministic across runs");
        let unique: HashSet<_> = first.files.iter().map(|f| &f.name).collect();
        assert_eq!(unique.len(), first.files.len());
    }

    #[test]
    fn missing_folder_is_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(
            scan(&tmp.path().join("nope")).unwrap_err().code(),
            "not_found"
        );
    }
}
