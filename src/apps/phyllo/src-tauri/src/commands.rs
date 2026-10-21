//! Tauri command layer: thin wrappers that resolve paths and run the blocking work off the main thread.
//! The logic lives in the sibling modules, which take explicit paths and are unit-tested with tempdirs.

use std::path::PathBuf;
use std::sync::Mutex;

use notify::RecommendedWatcher;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{Error, Result};
use crate::history::{self, SnapshotInfo};
use crate::library::{self, LibraryScan};
use crate::paths::{self, PhylloPaths};
use crate::samples::{self, SampleScan};
use crate::{project, trash, watch};

pub const EVENT_LIBRARY_CHANGED: &str = "library://changed";
pub const EVENT_SAMPLES_CHANGED: &str = "samples://changed";

/// Live watchers; replacing a slot drops (and so stops) the previous watcher.
#[derive(Default)]
pub struct Watchers {
    library: Mutex<Option<RecommendedWatcher>>,
    samples: Mutex<Option<RecommendedWatcher>>,
}

/// Run blocking filesystem work on the blocking pool so the UI thread stays free.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| Error::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn paths_get() -> Result<PhylloPaths> {
    blocking(paths::resolve_all).await
}

#[tauri::command]
pub async fn project_read(path: String) -> Result<String> {
    blocking(move || project::read(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn project_write(path: String, json: String) -> Result<()> {
    blocking(move || project::write(&PathBuf::from(path), &json)).await
}

#[tauri::command]
pub async fn project_new_path(name: String) -> Result<String> {
    blocking(move || {
        Ok(project::new_path(&paths::root()?, &name)?
            .display()
            .to_string())
    })
    .await
}

#[tauri::command]
pub async fn strudel_read(path: String) -> Result<String> {
    blocking(move || project::text_read(&PathBuf::from(path))).await
}

#[tauri::command]
pub async fn strudel_write(path: String, code: String) -> Result<()> {
    blocking(move || project::text_write(&PathBuf::from(path), &code)).await
}

#[tauri::command]
pub async fn library_scan() -> Result<LibraryScan> {
    blocking(|| library::scan(&paths::root()?)).await
}

#[tauri::command]
pub async fn library_mark_opened(path: String) -> Result<()> {
    blocking(move || library::mark_opened(&paths::root()?, &path)).await
}

/// Start (or restart) watching the library root; emits `library://changed` after ~300 ms of quiet.
#[tauri::command]
pub fn library_watch(app: AppHandle, watchers: State<'_, Watchers>) -> Result<()> {
    let root = paths::root()?;
    let watcher = watch::watch_library(&root, watch::DEBOUNCE, move || {
        let _ = app.emit(EVENT_LIBRARY_CHANGED, ());
    })?;
    *watchers.library.lock().unwrap_or_else(|e| e.into_inner()) = Some(watcher);
    Ok(())
}

#[tauri::command]
pub async fn history_snapshot(project_id: String, json: String) -> Result<SnapshotInfo> {
    blocking(move || history::snapshot(&paths::root()?, &project_id, &json)).await
}

#[tauri::command]
pub async fn history_list(project_id: String) -> Result<Vec<SnapshotInfo>> {
    blocking(move || history::list(&paths::root()?, &project_id)).await
}

#[tauri::command]
pub async fn history_read(project_id: String, snapshot_id: String) -> Result<String> {
    blocking(move || history::read(&paths::root()?, &project_id, &snapshot_id)).await
}

#[tauri::command]
pub async fn move_to_trash(path: String) -> Result<()> {
    blocking(move || trash::move_to_trash(&PathBuf::from(path))).await
}

/// Scan a sample folder and allow it on the asset protocol so the web view can load its files
/// through `convertFileSrc`.
#[tauri::command]
pub async fn sample_folder_scan(app: AppHandle, path: String) -> Result<SampleScan> {
    let folder = PathBuf::from(&path);
    let scan = {
        let folder = folder.clone();
        blocking(move || samples::scan(&folder)).await?
    };
    app.asset_protocol_scope()
        .allow_directory(&folder, true)
        .map_err(|e| Error::Internal(format!("asset scope: {e}")))?;
    Ok(scan)
}

/// Replace the watched set of sample folders; emits `samples://changed` `{ folder }` after ~300 ms of quiet.
#[tauri::command]
pub fn sample_folders_watch(
    app: AppHandle,
    watchers: State<'_, Watchers>,
    paths: Vec<String>,
) -> Result<()> {
    let watcher = watch::watch_samples(&paths, watch::DEBOUNCE, move |folder| {
        let _ = app.emit(
            EVENT_SAMPLES_CHANGED,
            serde_json::json!({ "folder": folder }),
        );
    })?;
    *watchers.samples.lock().unwrap_or_else(|e| e.into_inner()) = watcher;
    Ok(())
}
