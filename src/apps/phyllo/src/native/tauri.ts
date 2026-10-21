import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { load } from '@tauri-apps/plugin-store';

import type { NativeApi } from './api';
import { toNativeError } from './errors';
import { COMMANDS, EVENTS } from './types';
import type { LibraryScan, PhylloPaths, SampleScan, SamplesChangedEvent, SnapshotInfo } from './types';

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

async function subscribe<T>(event: string, callback: (payload: T) => void) {
  try {
    return await listen<T>(event, (e) => callback(e.payload));
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

export function createTauriApi(): NativeApi {
  const settings = () => load(SETTINGS_FILE, { autoSave: false });

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
