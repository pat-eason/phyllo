//! Files handed to Phyllo by the OS: Finder "Open With" / double-click (macOS `RunEvent::Opened`) and command-line
//! arguments (Windows/Linux file associations launch `phyllo <path>`).
//!
//! Opens that arrive before the web view is listening (cold start) are buffered until JS calls
//! `take_pending_open_files`; after that first call every open is pushed as `app://open-files` `{ paths }` to the main
//! window instead.

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub const EVENT_OPEN_FILES: &str = "app://open-files";

/// Extensions Phyllo opens (`bundle.fileAssociations` in tauri.conf.json), compared case-insensitively.
pub const EXTENSIONS: &[&str] = &["phyllo", "strudel"];

pub fn is_openable(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXTENSIONS.iter().any(|x| x.eq_ignore_ascii_case(e)))
}

/// Keep only `.phyllo` / `.strudel` paths, made absolute against `cwd`, de-duplicated in arrival order.
pub fn filter_paths(paths: impl IntoIterator<Item = PathBuf>, cwd: &Path) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for path in paths {
        if !is_openable(&path) {
            continue;
        }
        let abs = if path.is_absolute() {
            path
        } else {
            cwd.join(path)
        };
        let s = abs.display().to_string();
        if !out.contains(&s) {
            out.push(s);
        }
    }
    out
}

/// Candidate files from `std::env::args_os()`: skips the program name and anything that looks like a flag.
pub fn paths_from_args(args: impl IntoIterator<Item = OsString>) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|a| !a.to_string_lossy().starts_with('-'))
        .map(PathBuf::from)
        .collect()
}

/// Openable files from a second launch's `argv` (program name first), relative paths resolved against that launch's
/// `cwd` (or `fallback` when it is empty).
pub fn second_instance_paths(argv: Vec<String>, cwd: &str, fallback: &Path) -> Vec<String> {
    let cwd = if cwd.is_empty() {
        fallback.to_path_buf()
    } else {
        PathBuf::from(cwd)
    };
    filter_paths(paths_from_args(argv.into_iter().map(OsString::from)), &cwd)
}

/// Local paths from the URLs macOS passes to `application:openURLs:`; non-`file:` URLs are dropped.
pub fn paths_from_urls(urls: &[tauri::Url]) -> Vec<PathBuf> {
    urls.iter()
        .filter(|u| u.scheme() == "file")
        .filter_map(|u| u.to_file_path().ok())
        .collect()
}

#[derive(Default)]
struct QueueState {
    /// JS has asked for the pending files at least once, so it is listening for `app://open-files`.
    ready: bool,
    pending: Vec<String>,
}

/// Buffer for opens that arrive before JS is ready.
#[derive(Default)]
pub struct OpenFileQueue(Mutex<QueueState>);

impl OpenFileQueue {
    /// Queue `paths`, or hand them back for an immediate `app://open-files` once JS is ready. Empty input is ignored.
    pub fn push(&self, paths: Vec<String>) -> Option<Vec<String>> {
        if paths.is_empty() {
            return None;
        }
        let mut st = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if st.ready {
            return Some(paths);
        }
        for p in paths {
            if !st.pending.contains(&p) {
                st.pending.push(p);
            }
        }
        None
    }

    /// Drain everything buffered so far and switch to event delivery for later opens.
    pub fn take(&self) -> Vec<String> {
        let mut st = self.0.lock().unwrap_or_else(|e| e.into_inner());
        st.ready = true;
        std::mem::take(&mut st.pending)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn second_instance_paths_use_the_second_launchs_cwd() {
        let argv = vec![
            "/Applications/Phyllo.app/Contents/MacOS/phyllo".to_string(),
            "--flag".to_string(),
            "songs/Groove.phyllo".to_string(),
            "/abs/beat.strudel".to_string(),
            "notes.txt".to_string(),
            "songs/Groove.phyllo".to_string(),
        ];
        assert_eq!(
            second_instance_paths(argv, "/Users/me", Path::new("/fallback")),
            vec![
                "/Users/me/songs/Groove.phyllo".to_string(),
                "/abs/beat.strudel".to_string()
            ]
        );
    }

    #[test]
    fn second_instance_paths_fall_back_when_cwd_is_unknown() {
        let argv = vec!["phyllo".to_string(), "a.phyllo".to_string()];
        assert_eq!(
            second_instance_paths(argv, "", Path::new("/fallback")),
            vec!["/fallback/a.phyllo".to_string()]
        );
        assert!(second_instance_paths(vec!["phyllo".into()], "/x", Path::new("/f")).is_empty());
    }

    #[test]
    fn openable_extensions_are_case_insensitive() {
        assert!(is_openable(Path::new("/a/Groove.phyllo")));
        assert!(is_openable(Path::new("/a/beat.STRUDEL")));
        assert!(is_openable(Path::new("relative.Phyllo")));
        assert!(!is_openable(Path::new("/a/song.wav")));
        assert!(!is_openable(Path::new("/a/phyllo")));
        assert!(!is_openable(Path::new("/a/.phyllo-index.json")));
    }

    #[cfg(unix)]
    #[test]
    fn filter_keeps_order_dedupes_and_absolutizes() {
        let cwd = Path::new("/work");
        let got = filter_paths(
            [
                PathBuf::from("/a/one.phyllo"),
                PathBuf::from("notes.txt"),
                PathBuf::from("two.strudel"),
                PathBuf::from("/a/one.phyllo"),
            ],
            cwd,
        );
        assert_eq!(
            got,
            vec!["/a/one.phyllo".to_string(), "/work/two.strudel".to_string()]
        );
    }

    #[test]
    fn args_skip_program_and_flags() {
        let args = [
            "phyllo",
            "--verbose",
            "/a/x.phyllo",
            "-psn_0_123",
            "y.strudel",
        ]
        .map(OsString::from);
        assert_eq!(
            paths_from_args(args),
            vec![PathBuf::from("/a/x.phyllo"), PathBuf::from("y.strudel")]
        );
    }

    #[cfg(unix)]
    #[test]
    fn urls_keep_only_file_scheme() {
        let urls = [
            tauri::Url::parse("file:///Users/me/Music/Phyllo/My%20Groove.phyllo").unwrap(),
            tauri::Url::parse("https://example.com/x.phyllo").unwrap(),
        ];
        assert_eq!(
            paths_from_urls(&urls),
            vec![PathBuf::from("/Users/me/Music/Phyllo/My Groove.phyllo")]
        );
    }

    #[test]
    fn queue_buffers_until_taken_then_passes_through() {
        let q = OpenFileQueue::default();
        assert_eq!(q.push(vec!["/a.phyllo".into()]), None);
        assert_eq!(q.push(vec!["/b.strudel".into(), "/a.phyllo".into()]), None);
        assert_eq!(q.push(vec![]), None);
        assert_eq!(
            q.take(),
            vec!["/a.phyllo".to_string(), "/b.strudel".to_string()]
        );
        // Ready: later opens go straight to the event and are not buffered twice.
        assert_eq!(
            q.push(vec!["/c.phyllo".into()]),
            Some(vec!["/c.phyllo".to_string()])
        );
        assert!(q.take().is_empty());
    }

    #[test]
    fn bundle_associations_match_the_accepted_extensions() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let assoc = conf["bundle"]["fileAssociations"].as_array().unwrap();
        let mut exts: Vec<&str> = assoc
            .iter()
            .flat_map(|a| {
                a["ext"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|e| e.as_str().unwrap())
            })
            .collect();
        exts.sort_unstable();
        let mut want = EXTENSIONS.to_vec();
        want.sort_unstable();
        assert_eq!(exts, want);
        for a in assoc {
            assert_eq!(a["role"], "Editor");
        }
        let phyllo = assoc.iter().find(|a| a["ext"][0] == "phyllo").unwrap();
        assert_eq!(phyllo["mimeType"], "application/x-phyllo+json");
        assert_eq!(phyllo["description"], "Phyllo project");

        // The main window keeps JS timers running while hidden (keep-playing-from-the-menu-bar).
        let main = &conf["app"]["windows"][0];
        assert_eq!(main["label"], crate::windows::MAIN);
        assert_eq!(main["backgroundThrottling"], "disabled");
    }
}
