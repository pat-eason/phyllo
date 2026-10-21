//! Tauri command layer: thin wrappers that resolve paths and run the blocking work off the main thread.
//! The logic lives in the sibling modules, which take explicit paths and are unit-tested with tempdirs.

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

use notify::RecommendedWatcher;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{Error, Result};
use crate::history::{self, SnapshotInfo};
use crate::library::{self, LibraryScan};
use crate::midi::{self, MidiHub, OutMessage, PortInfo};
use crate::osc::{OscConfig, OscMessageIn, OscState};
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

// ── MIDI ────────────────────────────────────────────────────────────────────

/// Start the input-event emitter and the 2 s hot-plug poller. Called once from `setup`.
pub fn start_midi(app: &AppHandle) {
    let hub = app.state::<MidiHub>();
    let handle = app.clone();
    hub.start_emitter(move |message| {
        let _ = handle.emit(midi::EVENT_MESSAGE, message);
    });

    let handle = app.clone();
    let spawned = std::thread::Builder::new()
        .name("phyllo-midi-poll".into())
        .spawn(move || {
            // The enumerator lives on this thread for the life of the app, so each poll is cheap.
            let Ok(lister) = midi::Enumerator::new() else {
                return;
            };
            loop {
                let refresh = handle.state::<MidiHub>().refresh_with(&lister);
                if refresh.changed {
                    let _ = handle.emit(midi::EVENT_PORTS_CHANGED, &refresh.ports);
                }
                std::thread::sleep(midi::POLL_INTERVAL);
            }
        });
    if let Err(e) = spawned {
        eprintln!("phyllo: MIDI hot-plug poller not started: {e}");
    }
}

/// Current ports, inputs first. Emits `midi://ports-changed` if the list moved since the last enumeration.
async fn refresh_ports(app: &AppHandle) -> Result<Vec<PortInfo>> {
    let handle = app.clone();
    let refresh = blocking(move || handle.state::<MidiHub>().refresh()).await?;
    if refresh.changed {
        let _ = app.emit(midi::EVENT_PORTS_CHANGED, &refresh.ports);
    }
    Ok(refresh.ports)
}

#[tauri::command]
pub async fn midi_list_ports(app: AppHandle) -> Result<Vec<PortInfo>> {
    refresh_ports(&app).await
}

/// Re-enumerate now (the 2 s poller would find changes anyway) and return the list.
#[tauri::command]
pub async fn midi_rescan(app: AppHandle) -> Result<Vec<PortInfo>> {
    refresh_ports(&app).await
}

/// Incoming messages arrive as `midi://message` events.
#[tauri::command]
pub async fn midi_open_input(app: AppHandle, id: String) -> Result<()> {
    blocking(move || app.state::<MidiHub>().open_input(&id)).await
}

#[tauri::command]
pub fn midi_close_input(hub: State<'_, MidiHub>, id: String) {
    hub.close_input(&id);
}

#[tauri::command]
pub async fn midi_open_output(app: AppHandle, id: String) -> Result<()> {
    blocking(move || app.state::<MidiHub>().open_output(&id)).await
}

#[tauri::command]
pub async fn midi_close_output(app: AppHandle, id: String) -> Result<()> {
    blocking(move || app.state::<MidiHub>().close_output(&id)).await
}

/// Queue messages for the output thread; `atMs` is relative to the moment this command arrives.
#[tauri::command]
pub async fn midi_send(app: AppHandle, id: String, messages: Vec<OutMessage>) -> Result<()> {
    let received = Instant::now();
    blocking(move || app.state::<MidiHub>().send(&id, received, &messages)).await
}

/// All-notes-off on 16 channels; also drops anything still queued for the port.
#[tauri::command]
pub async fn midi_panic(app: AppHandle, id: String) -> Result<()> {
    blocking(move || app.state::<MidiHub>().panic(&id)).await
}

// ── OSC ─────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn osc_configure(app: AppHandle, config: OscConfig) -> Result<()> {
    blocking(move || app.state::<OscState>().configure(config)).await
}

/// No-op while OSC is disabled.
#[tauri::command]
pub async fn osc_send(app: AppHandle, messages: Vec<OscMessageIn>) -> Result<()> {
    blocking(move || app.state::<OscState>().send(&messages).map(|_| ())).await
}
