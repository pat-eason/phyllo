//! Tauri command layer: thin wrappers that resolve paths and run the blocking work off the main thread.
//! The logic lives in the sibling modules, which take explicit paths and are unit-tested with tempdirs.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use notify::RecommendedWatcher;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{Error, Result};
use crate::export::{self, BeginOptions, BeginResult, ExportResult, ExportSessions};
use crate::history::{self, SnapshotInfo};
use crate::library::{self, LibraryScan};
use crate::media::{self, MediaState, NowPlaying};
use crate::menu::{MenuItemState, MenuState, RecentItem};
use crate::midi::{self, MidiHub, OutMessage, PortInfo};
use crate::midifile::{self, MidiFileResult, MidiFileSpec};
use crate::notifications::{self, ExportFinished};
use crate::open_files::{self, OpenFileQueue};
use crate::osc::{OscConfig, OscMessageIn, OscState};
use crate::paths::{self, PhylloPaths};
use crate::samples::{self, SampleScan};
use crate::sound_cache::{self, CacheStatus, Progress, SoundCache};
use crate::tray::{self, TrayState};
use crate::windows::{self, KeepRunning};
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

// ── Export ──────────────────────────────────────────────────────────────────

/// Header carrying the session id on `export_chunk` (the body is the raw PCM).
pub const EXPORT_SESSION_HEADER: &str = "x-session";

fn export_scratch_dir() -> PathBuf {
    std::env::temp_dir().join("phyllo-export")
}

/// Open a streaming export. A bare `path` file name goes to `Exports/`.
#[tauri::command]
pub async fn export_begin(app: AppHandle, options: BeginOptions) -> Result<BeginResult> {
    blocking(move || {
        app.state::<ExportSessions>()
            .begin(&paths::root()?, &export_scratch_dir(), &options)
    })
    .await
}

/// Append PCM. The body is raw interleaved little-endian `f32` (binary IPC, no JSON); the session id is the
/// `x-session` header.
#[tauri::command]
pub async fn export_chunk(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<()> {
    let session = request
        .headers()
        .get(EXPORT_SESSION_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| Error::InvalidArgument(format!("missing {EXPORT_SESSION_HEADER} header")))?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::InvalidArgument(
            "export_chunk expects a raw binary body".into(),
        ));
    };
    let bytes = bytes.clone();
    blocking(move || app.state::<ExportSessions>().chunk(&session, &bytes)).await
}

/// Normalize (if asked), encode and move into place. The session is consumed even on failure.
#[tauri::command]
pub async fn export_finish(app: AppHandle, session_id: String) -> Result<ExportResult> {
    blocking(move || app.state::<ExportSessions>().finish(&session_id)).await
}

/// Discard the session and its partial data. Unknown ids are ignored.
#[tauri::command]
pub fn export_cancel(sessions: State<'_, ExportSessions>, session_id: String) {
    sessions.cancel(&session_id);
}

/// A file name for a default-named export that doesn't replace an earlier one: `Groove.wav`, else `Groove 2.wav`,
/// `Groove 3.wav`… A bare name resolves in `Exports/`; an absolute path keeps its folder. Nothing is written.
#[tauri::command]
pub async fn export_unique_path(file_name: String) -> Result<String> {
    blocking(move || {
        Ok(export::unique_path(&paths::root()?, &file_name)?
            .display()
            .to_string())
    })
    .await
}

/// Write a Standard MIDI File (type 1). A bare file name goes to `Exports/`; `.mid` is added if missing.
#[tauri::command]
pub async fn midi_file_write(path: String, spec: MidiFileSpec) -> Result<MidiFileResult> {
    blocking(move || {
        let dest = export::resolve_output(&paths::root()?, &path, "mid")?;
        let bytes = midifile::write(&dest, &spec)?;
        Ok(MidiFileResult {
            path: dest.display().to_string(),
            bytes,
        })
    })
    .await
}

// ── System integration (menu, windows, tray, media keys, open files, notifications) ────────────

#[tauri::command]
pub fn menu_set_state(state: State<'_, MenuState>, item: MenuItemState) -> Result<()> {
    state.set_state(&item)
}

/// Replace File › Open Recent; at most 10 entries are shown.
#[tauri::command]
pub fn menu_set_recent(
    app: AppHandle,
    state: State<'_, MenuState>,
    items: Vec<RecentItem>,
) -> Result<()> {
    state.set_recent(&app, items)
}

/// Focus the Settings window, creating it if needed. Async: creating a window from a sync command deadlocks on
/// Windows (WebView2), see `WebviewWindowBuilder::new`.
#[tauri::command]
pub async fn open_settings_window(app: AppHandle) -> Result<()> {
    windows::open_settings(&app)
}

/// Create or remove the menu-bar tray icon; resolves whether one exists now.
#[tauri::command]
pub async fn tray_set_enabled(app: AppHandle, enabled: bool) -> Result<bool> {
    tray::set_enabled(&app, &app.state::<TrayState>(), enabled)
}

#[tauri::command]
pub fn tray_set_playing(app: AppHandle, state: State<'_, TrayState>, playing: bool) -> Result<()> {
    tray::set_playing(&app, &state, playing)
}

/// While on, closing the main window hides it and audio keeps running.
#[tauri::command]
pub fn app_set_keep_running(state: State<'_, KeepRunning>, keep: bool) {
    state.set(keep);
}

/// Resolves `true` when native media keys are active (macOS); `false` elsewhere.
#[tauri::command]
pub fn media_set_enabled(
    app: AppHandle,
    state: State<'_, MediaState>,
    enabled: bool,
) -> Result<bool> {
    media::set_enabled(&app, &state, enabled)
}

/// Resolves `true` when the native Now Playing info was updated.
#[tauri::command]
pub fn media_set_now_playing(
    app: AppHandle,
    state: State<'_, MediaState>,
    info: NowPlaying,
) -> Result<bool> {
    media::set_now_playing(&app, &state, info)
}

/// Files the OS asked Phyllo to open before JS was listening. After the first call, opens arrive as
/// `app://open-files` events instead.
#[tauri::command]
pub fn take_pending_open_files(queue: State<'_, OpenFileQueue>) -> Vec<String> {
    queue.take()
}

#[tauri::command]
pub fn notify_export_finished(app: AppHandle, notification: ExportFinished) -> Result<bool> {
    notifications::export_finished(&app, notification)
}

/// Queue or deliver files the OS handed us (Finder open, command line). Shows the main window when delivering.
pub fn deliver_open_files(app: &AppHandle, paths: Vec<PathBuf>) {
    let cwd = std::env::current_dir().unwrap_or_default();
    deliver_filtered(app, open_files::filter_paths(paths, &cwd));
}

/// A second launch was folded into this one by tauri-plugin-single-instance (D96): bring the main window forward
/// and open the files it was given (relative to the second launch's working directory) like any other open.
pub fn on_second_instance(app: &AppHandle, argv: Vec<String>, cwd: &str) {
    windows::show_main(app);
    let fallback = std::env::current_dir().unwrap_or_default();
    deliver_filtered(app, open_files::second_instance_paths(argv, cwd, &fallback));
}

fn deliver_filtered(app: &AppHandle, paths: Vec<String>) {
    if let Some(paths) = app.state::<OpenFileQueue>().push(paths) {
        windows::show_main(app);
        let _ = app.emit_to(
            tauri::EventTarget::webview_window(windows::MAIN),
            open_files::EVENT_OPEN_FILES,
            serde_json::json!({ "paths": paths }),
        );
    }
}

// ── Offline sound cache (T6.6) ─────────────────────────────────────────────

/// The downloader (built on first use) and whether the cache directory is already on the asset-protocol scope.
#[derive(Default)]
pub struct SoundCacheState {
    cache: Mutex<Option<Arc<SoundCache>>>,
    scope_granted: AtomicBool,
}

#[derive(serde::Serialize)]
pub struct SoundCacheFetched {
    path: String,
}

impl SoundCacheState {
    fn cache(&self) -> Result<Arc<SoundCache>> {
        let mut slot = self.cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(cache) = slot.as_ref() {
            return Ok(Arc::clone(cache));
        }
        let cache = Arc::new(SoundCache::new()?);
        *slot = Some(Arc::clone(&cache));
        Ok(cache)
    }

    /// Resolve (and create) the cache directory and allow it on the asset protocol so `convertFileSrc` URLs load.
    /// Needed explicitly: the static scope's `**` does not match the hidden `.cache` folder.
    fn dir(&self, app: &AppHandle) -> Result<PathBuf> {
        let dir = sound_cache::cache_dir(&paths::root()?);
        paths::ensure_dir(&dir)?;
        if !self.scope_granted.load(Ordering::Acquire) {
            app.asset_protocol_scope()
                .allow_directory(&dir, true)
                .map_err(|e| Error::Internal(format!("asset scope: {e}")))?;
            self.scope_granted.store(true, Ordering::Release);
        }
        Ok(dir)
    }
}

/// Make sure `url` (an allowlisted Strudel sound URL) is in the cache and return the cached file's path.
/// Download failures reject with `network`; a disallowed URL with `invalid_argument`.
#[tauri::command]
pub async fn sound_cache_fetch(
    app: AppHandle,
    state: State<'_, SoundCacheState>,
    url: String,
) -> Result<SoundCacheFetched> {
    let cache = state.cache()?;
    cache.policy().check(&url)?;
    let dir = state.dir(&app)?;
    let path = cache.fetch(&dir, &url).await?;
    Ok(SoundCacheFetched {
        path: path.display().to_string(),
    })
}

#[tauri::command]
pub async fn sound_cache_status() -> Result<CacheStatus> {
    blocking(|| sound_cache::status(&sound_cache::cache_dir(&paths::root()?))).await
}

#[tauri::command]
pub async fn sound_cache_clear() -> Result<()> {
    blocking(|| sound_cache::clear(&sound_cache::cache_dir(&paths::root()?))).await
}

/// Download `urls` (max 6 at a time), emitting `sound-cache://progress` `{ done, total, failed }` as files finish.
/// Resolves with the final counts; per-file failures are counted, not thrown.
#[tauri::command]
pub async fn sound_cache_prefetch(
    app: AppHandle,
    state: State<'_, SoundCacheState>,
    urls: Vec<String>,
) -> Result<Progress> {
    let cache = state.cache()?;
    let dir = state.dir(&app)?;
    let emitter = app.clone();
    cache
        .prefetch(&dir, &urls, move |progress| {
            let _ = emitter.emit(sound_cache::EVENT_PROGRESS, progress);
        })
        .await
}
