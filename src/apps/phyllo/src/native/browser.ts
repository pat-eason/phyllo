import type { NativeApi } from './api';
import { broadcastEventName } from './broadcast';
import { NativeError } from './errors';
import {
  type MediaSessionBridge,
  createMediaSessionBridge,
  defaultMediaMetadata,
  defaultMediaSession,
} from './mediaSession';
import {
  BrowserExportSession,
  type Download,
  buildMidiFile,
  defaultDownload,
  downloadName,
  validateBegin,
} from './exportBrowser';
import { type RequestMidiAccess, createWebMidiBridge, defaultMidiAccess } from './webmidi';
import type {
  LibraryEntry,
  LibraryScan,
  LibrarySummary,
  PhylloPaths,
  SamplesChangedEvent,
  SnapshotInfo,
  Unsubscribe,
} from './types';

/**
 * In-memory implementation of `NativeApi` for plain-browser runs (Vite dev, Playwright, Storybook).
 * Projects, text files and "opened" times persist in `localStorage` when it is usable; history is memory only.
 * It starts with zero projects, dialogs resolve `null`, and `notify` logs. System integration: no menu, tray or
 * file associations (those no-op); Settings opens as a `#/settings` popup; `broadcast` uses `BroadcastChannel`;
 * media keys use `navigator.mediaSession`.
 */

export const BROWSER_ROOT = '/Phyllo';
export const STORAGE_KEY = 'phyllo.native.v1';
export const SETTINGS_KEY = 'phyllo.settings.v1';
const FORMAT = 'phyllo/1';
const KEEP_SNAPSHOTS = 50;

interface StoredFile {
  content: string;
  modifiedMs: number;
}

interface Persisted {
  files: Record<string, StoredFile>;
  opened: Record<string, string>;
}

export interface BrowserApiOptions {
  /** Defaults to `globalThis.localStorage` when accessible; pass `null` to run purely in memory. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => Date;
  log?: (...args: unknown[]) => void;
  /**
   * Web MIDI entry point. Defaults to `navigator.requestMIDIAccess` when it exists (Chromium); `null` means no
   * MIDI ports at all.
   */
  requestMidiAccess?: RequestMidiAccess | null;
  /** How exports reach the user; defaults to a Blob + `a[download]` click. Tests inject a recorder. */
  download?: Download;
  /** Media keys via `navigator.mediaSession`; defaults to the real one when the browser has it. */
  mediaSession?: MediaSessionBridge;
  /** Opens the Settings popup; defaults to `window.open`. Returning `null` (blocked) falls back to `navigateTo`. */
  openWindow?: (url: string, target: string, features: string) => unknown;
  /** Defaults to setting `location.hash`. */
  navigateTo?: (hash: string) => void;
  /**
   * Cross-tab transport for `broadcast`; defaults to a `BroadcastChannel` when available, `null` for none.
   * Messages a channel posts never come back to the same channel object.
   */
  broadcastChannel?: BroadcastChannelLike | null;
}

export type BroadcastChannelLike = Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'removeEventListener'>;

export const BROADCAST_CHANNEL_NAME = 'phyllo.native.broadcast';
export const SETTINGS_HASH = '#/settings';

function defaultBroadcastChannel(): BroadcastChannelLike | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(BROADCAST_CHANNEL_NAME) : null;
  } catch {
    return null;
  }
}

function defaultOpenWindow(url: string, target: string, features: string): unknown {
  try {
    return globalThis.window?.open(url, target, features) ?? null;
  } catch {
    return null;
  }
}

function defaultNavigateTo(hash: string): void {
  try {
    globalThis.location.hash = hash;
  } catch {
    /* no location (tests, workers) */
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function sanitizeFileStem(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  const trimmed = Array.from(cleaned).slice(0, 100).join('').replace(/^[.\s]+|[.\s]+$/g, '');
  return trimmed === '' ? 'Untitled Groove' : trimmed;
}

function validateProject(json: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    throw new NativeError('json', `invalid JSON: ${(err as Error).message}`);
  }
  const format = (value as { format?: unknown } | null)?.format;
  if (format !== FORMAT) {
    throw new NativeError(
      'invalid_format',
      typeof format === 'string'
        ? `unsupported project format "${format}" (expected "${FORMAT}")`
        : `missing "format" field (expected "${FORMAT}")`,
    );
  }
  return value as Record<string, unknown>;
}

const asString = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

function summarize(value: Record<string, unknown>, stem: string, modifiedMs: number): LibrarySummary {
  const tempo = asRecord(value.tempo);
  const tracks = Array.isArray(value.tracks) ? value.tracks : [];
  const modified = asString(value.modified) ?? new Date(modifiedMs).toISOString();
  return {
    id: asString(value.id) ?? stem,
    name: asString(value.name) ?? stem,
    tags: Array.isArray(value.tags) ? value.tags.filter((t): t is string => typeof t === 'string') : [],
    favorite: value.favorite === true,
    bpm: typeof tempo.bpm === 'number' ? tempo.bpm : 120,
    beatsPerBar: typeof tempo.beatsPerBar === 'number' ? tempo.beatsPerBar : 4,
    key: asString(value.key) ?? '',
    lengthBars: typeof value.lengthBars === 'number' ? value.lengthBars : 0,
    trackCount: tracks.length,
    created: asString(value.created) ?? modified,
    modified,
    tracks: tracks.slice(0, 3).map((t) => {
      const track = asRecord(t);
      return {
        kind: asString(track.kind) ?? '',
        color: asString(track.color) ?? '',
        pattern: asString(track.pattern) ?? '',
        sourceType: asString(asRecord(track.source).type) ?? '',
        mute: track.mute === true,
      };
    }),
  };
}

function isRootProject(path: string): boolean {
  return path.startsWith(`${BROWSER_ROOT}/`) && !path.slice(BROWSER_ROOT.length + 1).includes('/') && path.endsWith('.phyllo');
}

export function createBrowserApi(options: BrowserApiOptions = {}): NativeApi {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((...args: unknown[]) => console.info('[native:browser]', ...args));

  // ── persistence ──
  const state: Persisted = { files: {}, opened: {} };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Persisted>;
      state.files = parsed.files ?? {};
      state.opened = parsed.opened ?? {};
    }
  } catch {
    /* unusable storage: start empty */
  }
  const persist = () => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* quota or private mode: keep working in memory */
    }
  };

  // ── events ──
  const libraryListeners = new Set<() => void>();
  const sampleListeners = new Set<(event: SamplesChangedEvent) => void>();
  const emitLibraryChanged = () => {
    queueMicrotask(() => {
      for (const listener of [...libraryListeners]) listener();
    });
  };

  const midi = createWebMidiBridge(
    options.requestMidiAccess === undefined ? defaultMidiAccess() : options.requestMidiAccess,
  );

  const history = new Map<string, { info: SnapshotInfo; json: string }[]>();

  const readFile = (path: string): string => {
    const file = state.files[path];
    if (!file) throw new NativeError('not_found', `not found: ${path}`);
    return file.content;
  };
  const writeFile = (path: string, content: string) => {
    state.files[path] = { content, modifiedMs: now().getTime() };
    persist();
    if (isRootProject(path)) emitLibraryChanged();
  };

  const settingsMemory: { value: unknown } = { value: null };

  const download = options.download ?? defaultDownload;
  const exportSessions = new Map<string, BrowserExportSession>();
  let exportCounter = 0;

  const media = options.mediaSession ?? createMediaSessionBridge(defaultMediaSession(), defaultMediaMetadata());
  const openWindow = options.openWindow ?? defaultOpenWindow;
  const navigateTo = options.navigateTo ?? defaultNavigateTo;
  let channel: BroadcastChannelLike | null | undefined = options.broadcastChannel;
  // Created on first use so merely loading the module opens no channel.
  const broadcastChannel = () => {
    if (channel === undefined) channel = defaultBroadcastChannel();
    return channel;
  };

  return {
    kind: 'browser',

    getPaths: async (): Promise<PhylloPaths> => ({ root: BROWSER_ROOT, exports: `${BROWSER_ROOT}/Exports` }),

    projectRead: async (path) => readFile(path),
    projectWrite: async (path, json) => {
      validateProject(json);
      writeFile(path, json);
    },
    projectNewPath: async (name) => {
      const stem = sanitizeFileStem(name);
      let candidate = `${BROWSER_ROOT}/${stem}.phyllo`;
      for (let n = 2; candidate in state.files; n += 1) candidate = `${BROWSER_ROOT}/${stem} ${n}.phyllo`;
      return candidate;
    },
    strudelRead: async (path) => readFile(path),
    strudelWrite: async (path, code) => {
      writeFile(path, code);
    },

    libraryScan: async (): Promise<LibraryScan> => {
      const scan: LibraryScan = { entries: [], errors: [] };
      for (const path of Object.keys(state.files).filter(isRootProject).sort()) {
        const file = state.files[path]!;
        try {
          const value = validateProject(file.content);
          const stem = path.slice(BROWSER_ROOT.length + 1, -'.phyllo'.length);
          const entry: LibraryEntry = {
            path,
            fileModifiedMs: file.modifiedMs,
            summary: summarize(value, stem, file.modifiedMs),
            opened: state.opened[path] ?? null,
          };
          scan.entries.push(entry);
        } catch (err) {
          scan.errors.push({ path, message: (err as Error).message });
        }
      }
      return scan;
    },
    libraryMarkOpened: async (path) => {
      state.opened[path] = now().toISOString();
      persist();
    },
    libraryWatch: async () => {
      /* writes through this API already notify listeners */
    },
    onLibraryChanged: async (callback): Promise<Unsubscribe> => {
      libraryListeners.add(callback);
      return () => {
        libraryListeners.delete(callback);
      };
    },

    historySnapshot: async (projectId, json) => {
      validateProject(json);
      const list = history.get(projectId) ?? [];
      // Must sort strictly after the newest snapshot, or a full history would prune the new one at once.
      let at = now().getTime();
      const newest = list[0];
      if (newest !== undefined && at <= Date.parse(newest.info.takenAt)) at = Date.parse(newest.info.takenAt) + 1;
      const id = new Date(at).toISOString().replace(/[-:.]/g, '');
      const info: SnapshotInfo = {
        id,
        takenAt: new Date(at).toISOString(),
        sizeBytes: new TextEncoder().encode(json).length,
      };
      list.push({ info, json });
      list.sort((a, b) => (a.info.id < b.info.id ? 1 : -1));
      history.set(projectId, list.slice(0, KEEP_SNAPSHOTS));
      return info;
    },
    historyList: async (projectId) => (history.get(projectId) ?? []).map((s) => s.info),
    historyRead: async (projectId, snapshotId) => {
      const found = (history.get(projectId) ?? []).find((s) => s.info.id === snapshotId);
      if (!found) throw new NativeError('not_found', `not found: snapshot ${snapshotId} of ${projectId}`);
      return found.json;
    },

    moveToTrash: async (path) => {
      if (!(path in state.files)) throw new NativeError('not_found', `not found: ${path}`);
      delete state.files[path];
      delete state.opened[path];
      persist();
      if (isRootProject(path)) emitLibraryChanged();
    },

    sampleFolderScan: async (path) => ({ path, files: [] }),
    sampleFoldersWatch: async () => {
      /* no sample folders in the browser */
    },
    onSamplesChanged: async (callback): Promise<Unsubscribe> => {
      sampleListeners.add(callback);
      return () => {
        sampleListeners.delete(callback);
      };
    },

    midiListPorts: () => midi.listPorts(),
    midiRescan: () => midi.rescan(),
    midiOpenInput: (id) => midi.openInput(id),
    midiCloseInput: (id) => midi.closeInput(id),
    midiOpenOutput: (id) => midi.openOutput(id),
    midiCloseOutput: (id) => midi.closeOutput(id),
    midiSend: (id, messages) => midi.send(id, messages),
    midiPanic: (id) => midi.panic(id),
    onMidiMessage: async (callback) => midi.onMessage(callback),
    onMidiPortsChanged: async (callback) => midi.onPortsChanged(callback),

    // OSC needs a UDP socket, which a web page cannot open.
    oscConfigure: async () => {},
    oscSend: async () => {},

    // Export: WAV only (encoded in JS, delivered as a download); FLAC/MP3 need the desktop app.
    exportBegin: async (exportOptions) => {
      validateBegin(exportOptions);
      exportCounter += 1;
      const sessionId = `browser-export-${exportCounter}`;
      exportSessions.set(sessionId, new BrowserExportSession(exportOptions));
      return { sessionId };
    },
    exportChunk: async (sessionId, frames) => {
      const session = exportSessions.get(sessionId);
      if (!session) throw new NativeError('not_found', `unknown export session: ${sessionId}`);
      session.push(frames);
    },
    exportFinish: async (sessionId) => {
      const session = exportSessions.get(sessionId);
      if (!session) throw new NativeError('not_found', `unknown export session: ${sessionId}`);
      exportSessions.delete(sessionId);
      return session.finish(download);
    },
    exportCancel: async (sessionId) => {
      exportSessions.delete(sessionId);
    },
    midiFileWrite: async (path, spec) => {
      const name = downloadName(path, 'mid');
      const bytes = buildMidiFile(spec);
      download(name, new Blob([bytes as BlobPart], { type: 'audio/midi' }));
      return { path: name, bytes: bytes.length };
    },

    openDialog: async () => null,
    saveDialog: async () => null,
    revealInFinder: async (path) => {
      log('reveal', path);
    },
    notify: async (notification) => {
      log('notify', notification);
      return false;
    },
    convertFileSrc: (path) => path,

    // No native menu in a browser; a keyboard layer may map MENU_ACTIONS accelerators itself.
    onMenuAction: async (): Promise<Unsubscribe> => () => undefined,
    menuSetState: async () => {},
    menuSetRecent: async () => {},

    openSettingsWindow: async () => {
      const popup = openWindow(SETTINGS_HASH, 'phyllo-settings', 'popup,width=1100,height=800');
      if (popup === null || popup === undefined) navigateTo(SETTINGS_HASH);
    },
    broadcast: async (name, payload) => {
      const event = broadcastEventName(name);
      broadcastChannel()?.postMessage({ event, payload });
    },
    onBroadcast: async (name, callback): Promise<Unsubscribe> => {
      const event = broadcastEventName(name);
      const ch = broadcastChannel();
      if (!ch) return () => undefined;
      const handler = (message: MessageEvent) => {
        const data = message.data as { event?: unknown; payload?: unknown } | null;
        if (data?.event === event) callback(data.payload);
      };
      ch.addEventListener('message', handler);
      return () => ch.removeEventListener('message', handler);
    },

    // There is no tray and closing the tab ends playback.
    traySetEnabled: async () => false,
    traySetPlaying: async () => {},
    appSetKeepRunning: async () => {},

    mediaSetEnabled: async (enabled) => media.setEnabled(enabled),
    mediaSetNowPlaying: async (info) => media.setNowPlaying(info),
    onMediaCommand: async (callback) => media.onCommand(callback),

    takePendingOpenFiles: async () => [],
    onOpenFiles: async (): Promise<Unsubscribe> => () => undefined,

    notifyExportFinished: async (notification) => {
      log('notify', notification);
      return false;
    },

    settingsStore: {
      load: async () => {
        try {
          const raw = storage?.getItem(SETTINGS_KEY);
          if (raw) return JSON.parse(raw) as unknown;
        } catch {
          /* fall through to memory */
        }
        return settingsMemory.value;
      },
      save: async (value) => {
        settingsMemory.value = value;
        try {
          storage?.setItem(SETTINGS_KEY, JSON.stringify(value));
        } catch {
          /* memory copy stays valid */
        }
      },
    },
  };
}
