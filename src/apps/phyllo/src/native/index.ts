import { isTauri } from '@tauri-apps/api/core';

import type { NativeApi } from './api';
import { createBrowserApi } from './browser';
import { createTauriApi } from './tauri';

/** The native layer for the current runtime: real Tauri commands in the desktop app, an in-memory stand-in in a browser. */
export const native: NativeApi = isTauri() ? createTauriApi() : createBrowserApi();

export type { NativeApi, SettingsStore } from './api';
export { BROADCAST_CHANNEL_NAME, createBrowserApi } from './browser';
export type { BroadcastChannelLike, BrowserApiOptions } from './browser';
export { broadcastEventName } from './broadcast';
export { NativeError, isNativeError, toNativeError } from './errors';
export { createMediaSessionBridge } from './mediaSession';
export type { MediaSessionBridge, MediaSessionLike } from './mediaSession';
export { SOUND_CACHE_HOSTS, createCachedUrlResolver, isCacheableSoundUrl } from './soundCache';
export type { CachedUrlResolverOptions, UrlResolver } from './soundCache';
export { createTauriApi } from './tauri';
export type { TauriApiOptions } from './tauri';
export { DEFAULT_CHUNK_SECONDS, formatExportNotification, interleave, streamAudioBuffer } from './export';
export type { AudioBufferLike, ExportProgress, StreamExportOptions } from './export';
export { assignPortIds, createWebMidiBridge, parseMidiMessage } from './webmidi';
export type { RequestMidiAccess, WebMidiBridge } from './webmidi';
export * from './types';
