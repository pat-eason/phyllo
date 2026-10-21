import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { open, save } from '@tauri-apps/plugin-dialog';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';

import type { NativeApi } from './api';
import { broadcastEventName, isEnvelope } from './broadcast';
import { toNativeError } from './errors';
import {
  type MediaSessionBridge,
  createMediaSessionBridge,
  defaultMediaMetadata,
  defaultMediaSession,
} from './mediaSession';
import { COMMANDS, EVENTS } from './types';
import type {
  ExportResult,
  ExportSession,
  LibraryScan,
  MediaCommandEvent,
  MenuActionEvent,
  MidiFileResult,
  OpenFilesEvent,
  MidiMessageEvent,
  MidiPortInfo,
  PhylloPaths,
  SampleScan,
  SamplesChangedEvent,
  SnapshotInfo,
  SoundCacheFetchResult,
  SoundCacheProgress,
  SoundCacheStatus,
} from './types';

const SETTINGS_FILE = 'settings.json';
const SETTINGS_KEY = 'settings';

/** `invoke` with errors normalised to `NativeError`. */
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    throw toNativeError(err);
  }
}

/** Header that carries the session id on the raw-binary `export_chunk` command. */
export const EXPORT_SESSION_HEADER = 'x-session';

/** `invoke` with a raw binary body (Tauri binary IPC: no JSON, no base64) and the session id in a header. */
async function callRaw(command: string, body: Uint8Array, sessionId: string): Promise<void> {
  try {
    await invoke<void>(command, body, { headers: { [EXPORT_SESSION_HEADER]: sessionId } });
  } catch (err) {
    throw toNativeError(err);
  }
}

async function subscribe<T>(event: string, callback: (payload: T) => void) {
  try {
    return await listen<T>(event, (e) => callback(e.payload));
  } catch (err) {
    throw toNativeError(err);
  }
}

/**
 * Listen on this window only. Rust sends `menu://action`, `media://command` and `app://open-files` to the main
 * window with `emit_to`; a global `listen` would match them in every window (its target is "any").
 */
async function subscribeWindow<T>(event: string, callback: (payload: T) => void) {
  try {
    return await getCurrentWebviewWindow().listen<T>(event, (e) => callback(e.payload));
  } catch (err) {
    throw toNativeError(err);
  }
}

async function guard<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    throw toNativeError(err);
  }
}

export interface TauriApiOptions {
  /** `navigator.mediaSession` stand-in, used where native media keys are unavailable (Windows/Linux). */
  mediaSession?: MediaSessionBridge;
}

export function createTauriApi(options: TauriApiOptions = {}): NativeApi {
  const settings = () => load(SETTINGS_FILE, { autoSave: false });
  const webMedia = options.mediaSession ?? createMediaSessionBridge(defaultMediaSession(), defaultMediaMetadata());
  /** Which side answers now-playing updates: native after `media_set_enabled` returned true, else the web view. */
  let nativeMedia = false;
  const label = () => getCurrentWebviewWindow().label;

  return {
    kind: 'tauri',

    getPaths: () => call<PhylloPaths>(COMMANDS.pathsGet),

    projectRead: (path) => call<string>(COMMANDS.projectRead, { path }),
    projectWrite: (path, json) => call<void>(COMMANDS.projectWrite, { path, json }),
    projectNewPath: (name) => call<string>(COMMANDS.projectNewPath, { name }),
    strudelRead: (path) => call<string>(COMMANDS.strudelRead, { path }),
    strudelWrite: (path, code) => call<void>(COMMANDS.strudelWrite, { path, code }),

    libraryScan: () => call<LibraryScan>(COMMANDS.libraryScan),
    libraryMarkOpened: (path) => call<void>(COMMANDS.libraryMarkOpened, { path }),
    libraryWatch: () => call<void>(COMMANDS.libraryWatch),
    onLibraryChanged: (callback) => subscribe<null>(EVENTS.libraryChanged, () => callback()),

    historySnapshot: (projectId, json) => call<SnapshotInfo>(COMMANDS.historySnapshot, { projectId, json }),
    historyList: (projectId) => call<SnapshotInfo[]>(COMMANDS.historyList, { projectId }),
    historyRead: (projectId, snapshotId) => call<string>(COMMANDS.historyRead, { projectId, snapshotId }),

    moveToTrash: (path) => call<void>(COMMANDS.moveToTrash, { path }),

    sampleFolderScan: (path) => call<SampleScan>(COMMANDS.sampleFolderScan, { path }),
    sampleFoldersWatch: (paths) => call<void>(COMMANDS.sampleFoldersWatch, { paths }),
    onSamplesChanged: (callback) => subscribe<SamplesChangedEvent>(EVENTS.samplesChanged, callback),

    midiListPorts: () => call<MidiPortInfo[]>(COMMANDS.midiListPorts),
    midiRescan: () => call<MidiPortInfo[]>(COMMANDS.midiRescan),
    midiOpenInput: (id) => call<void>(COMMANDS.midiOpenInput, { id }),
    midiCloseInput: (id) => call<void>(COMMANDS.midiCloseInput, { id }),
    midiOpenOutput: (id) => call<void>(COMMANDS.midiOpenOutput, { id }),
    midiCloseOutput: (id) => call<void>(COMMANDS.midiCloseOutput, { id }),
    midiSend: (id, messages) => call<void>(COMMANDS.midiSend, { id, messages }),
    midiPanic: (id) => call<void>(COMMANDS.midiPanic, { id }),
    onMidiMessage: (callback) => subscribe<MidiMessageEvent>(EVENTS.midiMessage, callback),
    onMidiPortsChanged: (callback) => subscribe<MidiPortInfo[]>(EVENTS.midiPortsChanged, callback),

    oscConfigure: (config) => call<void>(COMMANDS.oscConfigure, { config }),
    oscSend: (messages) => call<void>(COMMANDS.oscSend, { messages }),

    exportBegin: (options) => call<ExportSession>(COMMANDS.exportBegin, { options }),
    exportChunk: (sessionId, frames) =>
      callRaw(COMMANDS.exportChunk, new Uint8Array(frames.buffer, frames.byteOffset, frames.byteLength), sessionId),
    exportFinish: (sessionId) => call<ExportResult>(COMMANDS.exportFinish, { sessionId }),
    exportCancel: (sessionId) => call<void>(COMMANDS.exportCancel, { sessionId }),
    midiFileWrite: (path, spec) => call<MidiFileResult>(COMMANDS.midiFileWrite, { path, spec }),

    openDialog: (options) => guard(async () => (await open(options)) ?? null),
    saveDialog: (options) => guard(async () => (await save(options)) ?? null),
    revealInFinder: (path) => guard(() => revealItemInDir(path)),
    notify: ({ title, body }) =>
      guard(async () => {
        const granted = (await isPermissionGranted()) || (await requestPermission()) === 'granted';
        if (!granted) return false;
        sendNotification(body === undefined ? { title } : { title, body });
        return true;
      }),
    convertFileSrc: (path) => convertFileSrc(path),

    onMenuAction: (callback) => subscribeWindow<MenuActionEvent>(EVENTS.menuAction, callback),
    menuSetState: (item) => call<void>(COMMANDS.menuSetState, { item }),
    menuSetRecent: (items) => call<void>(COMMANDS.menuSetRecent, { items }),

    openSettingsWindow: () => call<void>(COMMANDS.openSettingsWindow),
    broadcast: (channel, payload) =>
      guard(async () => {
        await emit(broadcastEventName(channel), { source: label(), payload });
      }),
    onBroadcast: (channel, callback) =>
      guard(async () => {
        const event = broadcastEventName(channel);
        const self = label();
        return subscribe<unknown>(event, (envelope) => {
          if (isEnvelope(envelope) && envelope.source !== self) callback(envelope.payload);
        });
      }),

    traySetEnabled: (enabled) => call<boolean>(COMMANDS.traySetEnabled, { enabled }),
    traySetPlaying: (playing) => call<void>(COMMANDS.traySetPlaying, { playing }),
    appSetKeepRunning: (keep) => call<void>(COMMANDS.appSetKeepRunning, { keep }),

    mediaSetEnabled: async (enabled) => {
      nativeMedia = (await call<boolean>(COMMANDS.mediaSetEnabled, { enabled })) === true;
      if (nativeMedia) {
        // Native handlers own the keys; make sure the web view's session doesn't answer too.
        webMedia.setEnabled(false);
        return true;
      }
      return webMedia.setEnabled(enabled);
    },
    mediaSetNowPlaying: async (info) =>
      nativeMedia ? call<boolean>(COMMANDS.mediaSetNowPlaying, { info }) : webMedia.setNowPlaying(info),
    onMediaCommand: async (callback) => {
      const offNative = await subscribeWindow<MediaCommandEvent>(EVENTS.mediaCommand, callback);
      const offWeb = webMedia.onCommand(callback);
      return () => {
        offNative();
        offWeb();
      };
    },

    takePendingOpenFiles: () => call<string[]>(COMMANDS.takePendingOpenFiles),
    onOpenFiles: (callback) => subscribeWindow<OpenFilesEvent>(EVENTS.openFiles, callback),

    notifyExportFinished: (notification) => call<boolean>(COMMANDS.notifyExportFinished, { notification }),

    soundCacheFetch: (url) => call<SoundCacheFetchResult>(COMMANDS.soundCacheFetch, { url }),
    soundCacheStatus: () => call<SoundCacheStatus>(COMMANDS.soundCacheStatus),
    soundCacheClear: () => call<void>(COMMANDS.soundCacheClear),
    soundCachePrefetch: (urls) => call<SoundCacheProgress>(COMMANDS.soundCachePrefetch, { urls }),
    onSoundCacheProgress: (callback) => subscribe<SoundCacheProgress>(EVENTS.soundCacheProgress, callback),

    settingsStore: {
      load: () =>
        guard(async () => {
          const store = await settings();
          return (await store.get<unknown>(SETTINGS_KEY)) ?? null;
        }),
      save: (value) =>
        guard(async () => {
          const store = await settings();
          await store.set(SETTINGS_KEY, value);
          await store.save();
        }),
    },
  };
}
