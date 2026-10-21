//! Debounced filesystem watchers (`notify`) for the library root and user sample folders.
//!
//! A watcher's callback pushes a key into a channel; a small thread coalesces keys until the channel has been
//! quiet for the debounce window, then calls `emit` once per distinct key. Dropping the returned watcher drops the
//! sender, which ends the thread.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::Duration;

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::error::{Error, Result};
use crate::project::PROJECT_EXT;
use crate::{paths, samples};

pub const DEBOUNCE: Duration = Duration::from_millis(300);

fn watch_err(e: notify::Error) -> Error {
    Error::Watch(e.to_string())
}

/// Coalesce keys from `rx`; emit each distinct key once after `window` of quiet.
fn spawn_debouncer(rx: Receiver<String>, window: Duration, emit: impl Fn(String) + Send + 'static) {
    thread::spawn(move || {
        while let Ok(first) = rx.recv() {
            let mut pending = BTreeSet::from([first]);
            let mut closed = false;
            loop {
                match rx.recv_timeout(window) {
                    Ok(key) => {
                        pending.insert(key);
                    }
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => {
                        closed = true;
                        break;
                    }
                }
            }
            for key in pending {
                emit(key);
            }
            if closed {
                break;
            }
        }
    });
}

fn is_content_change(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .is_none_or(|n| n.to_string_lossy().starts_with('.'))
}

/// Watch `root` (non-recursively) for added, removed, renamed or modified `*.phyllo` files.
/// Sidecar/temp files, `.history/` and `Exports/` never trigger `emit`.
pub fn watch_library(
    root: &Path,
    window: Duration,
    emit: impl Fn() + Send + 'static,
) -> Result<RecommendedWatcher> {
    paths::ensure_dir(root)?;
    let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let given = root.to_path_buf();
    let (tx, rx) = mpsc::channel::<String>();
    spawn_debouncer(rx, window, move |_| emit());

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if !is_content_change(&event.kind) {
            return;
        }
        let relevant = event.paths.iter().any(|p| {
            let direct_child = p.parent().is_some_and(|d| d == canonical || d == given);
            direct_child
                && !is_hidden(p)
                && p.extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case(PROJECT_EXT))
        });
        if relevant {
            let _ = tx.send("library".to_owned());
        }
    })
    .map_err(watch_err)?;
    watcher
        .watch(root, RecursiveMode::NonRecursive)
        .map_err(watch_err)?;
    Ok(watcher)
}

/// Watch every existing folder in `folders` recursively; `emit(folder)` receives the folder string exactly as passed in.
/// Returns `None` when there is nothing to watch.
pub fn watch_samples(
    folders: &[String],
    window: Duration,
    emit: impl Fn(String) + Send + 'static,
) -> Result<Option<RecommendedWatcher>> {
    let targets: Vec<(String, PathBuf)> = folders
        .iter()
        .filter_map(|f| {
            Path::new(f)
                .canonicalize()
                .ok()
                .filter(|c| c.is_dir())
                .map(|c| (f.clone(), c))
        })
        .collect();
    if targets.is_empty() {
        return Ok(None);
    }
    let (tx, rx) = mpsc::channel::<String>();
    spawn_debouncer(rx, window, emit);

    let routes = targets.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        let Ok(event) = res else { return };
        if !is_content_change(&event.kind) {
            return;
        }
        for path in &event.paths {
            if is_hidden(path) {
                continue;
            }
            // Audio files and directories (no extension) matter; other files do not.
            let relevant = path
                .extension()
                .is_none_or(|e| samples::is_audio_ext(&e.to_string_lossy()));
            if !relevant {
                continue;
            }
            if let Some((given, _)) = routes
                .iter()
                .find(|(_, canonical)| path.starts_with(canonical))
            {
                let _ = tx.send(given.clone());
            }
        }
    })
    .map_err(watch_err)?;
    for (_, canonical) in &targets {
        watcher
            .watch(canonical, RecursiveMode::Recursive)
            .map_err(watch_err)?;
    }
    Ok(Some(watcher))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    const WINDOW: Duration = Duration::from_millis(100);

    #[test]
    fn debouncer_coalesces_bursts_and_flushes_on_close() {
        let (tx, rx) = mpsc::channel::<String>();
        let got = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = Arc::clone(&got);
        spawn_debouncer(rx, WINDOW, move |k| sink.lock().unwrap().push(k));
        for _ in 0..20 {
            tx.send("a".into()).unwrap();
            tx.send("b".into()).unwrap();
            thread::sleep(Duration::from_millis(5));
        }
        thread::sleep(WINDOW * 4);
        assert_eq!(
            *got.lock().unwrap(),
            ["a", "b"],
            "one emit per key per burst"
        );
        tx.send("c".into()).unwrap();
        drop(tx);
        thread::sleep(WINDOW * 4);
        assert_eq!(*got.lock().unwrap(), ["a", "b", "c"]);
    }

    fn wait_for(cond: impl Fn() -> bool) -> bool {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if cond() {
                return true;
            }
            thread::sleep(Duration::from_millis(50));
        }
        false
    }

    #[test]
    fn library_watcher_fires_for_phyllo_files_only() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Phyllo");
        let count = Arc::new(Mutex::new(0u32));
        let c = Arc::clone(&count);
        let _w = watch_library(&root, WINDOW, move || *c.lock().unwrap() += 1).unwrap();
        thread::sleep(Duration::from_millis(500)); // let the backend settle

        fs::write(root.join("notes.txt"), "x").unwrap();
        fs::write(root.join(".phyllo-index.json"), "{}").unwrap();
        fs::create_dir_all(root.join(".history/p")).unwrap();
        fs::write(root.join(".history/p/1.json"), "{}").unwrap();
        thread::sleep(Duration::from_millis(1000));
        assert_eq!(*count.lock().unwrap(), 0, "unrelated files must not fire");

        fs::write(root.join("a.phyllo"), r#"{"format":"phyllo/1"}"#).unwrap();
        assert!(
            wait_for(|| *count.lock().unwrap() >= 1),
            "no event for a new .phyllo file"
        );
    }

    #[test]
    fn sample_watcher_reports_the_folder_as_given() {
        let tmp = tempfile::tempdir().unwrap();
        let folder = tmp.path().join("samples");
        fs::create_dir_all(&folder).unwrap();
        let given = folder.display().to_string();
        let seen = Arc::new(Mutex::new(Vec::<String>::new()));
        let s = Arc::clone(&seen);
        let _w = watch_samples(
            &[given.clone(), "/no/such/folder".into()],
            WINDOW,
            move |f| s.lock().unwrap().push(f),
        )
        .unwrap()
        .expect("one folder exists");
        thread::sleep(Duration::from_millis(500));

        fs::write(folder.join("notes.txt"), "x").unwrap();
        thread::sleep(Duration::from_millis(1000));
        assert!(
            seen.lock().unwrap().is_empty(),
            "non-audio files must not fire"
        );

        fs::write(folder.join("kick.wav"), "x").unwrap();
        assert!(
            wait_for(|| !seen.lock().unwrap().is_empty()),
            "no event for a new wav"
        );
        assert_eq!(seen.lock().unwrap()[0], given);
    }

    #[test]
    fn nothing_to_watch_is_none() {
        assert!(watch_samples(&[], WINDOW, |_| {}).unwrap().is_none());
        assert!(
            watch_samples(&["/no/such/folder".into()], WINDOW, |_| {})
                .unwrap()
                .is_none()
        );
    }
}
