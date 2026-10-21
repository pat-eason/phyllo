import { isTauri } from '@tauri-apps/api/core';

import type { NativeApi } from './api';
import { createBrowserApi } from './browser';
import { createTauriApi } from './tauri';

/** The native layer for the current runtime: real Tauri commands in the desktop app, an in-memory stand-in in a browser. */
export const native: NativeApi = isTauri() ? createTauriApi() : createBrowserApi();

export type { NativeApi, SettingsStore } from './api';
export { createBrowserApi } from './browser';
export type { BrowserApiOptions } from './browser';
export { NativeError, isNativeError, toNativeError } from './errors';
export { createTauriApi } from './tauri';
export { assignPortIds, createWebMidiBridge, parseMidiMessage } from './webmidi';
export type { RequestMidiAccess, WebMidiBridge } from './webmidi';
export * from './types';
