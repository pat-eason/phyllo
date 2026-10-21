import type { MediaCommand, MediaCommandEvent, NowPlaying, Unsubscribe } from './types';

/**
 * Media keys through the web platform's `navigator.mediaSession`. Used by the browser implementation and, in the
 * desktop app, wherever native media keys are unavailable (`media_set_enabled` resolves `false`: Windows/Linux).
 *
 * Caveat: browsers only route media keys to a page whose media session is active, and Chromium (WebView2) activates
 * it for audible `<audio>`/`<video>` playback; Web Audio alone may not be enough. Handlers are registered anyway;
 * where nothing arrives, the in-app transport still works.
 */

export interface MediaSessionLike {
  metadata: MediaMetadata | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
}

export type MediaMetadataConstructor = new (init: MediaMetadataInit) => MediaMetadata;

const ACTIONS: readonly (readonly [MediaSessionAction, MediaCommand])[] = [
  ['play', 'play'],
  ['pause', 'pause'],
  ['stop', 'stop'],
  ['nexttrack', 'next'],
  ['previoustrack', 'previous'],
];

export function defaultMediaSession(): MediaSessionLike | null {
  try {
    return (globalThis.navigator?.mediaSession as MediaSessionLike | undefined) ?? null;
  } catch {
    return null;
  }
}

export function defaultMediaMetadata(): MediaMetadataConstructor | null {
  return typeof globalThis.MediaMetadata === 'function' ? globalThis.MediaMetadata : null;
}

export interface MediaSessionBridge {
  /** Register or clear the action handlers. Resolves whether handlers are now registered. */
  setEnabled(enabled: boolean): boolean;
  /** Publish title and play state. `false` while disabled or without a media session. */
  setNowPlaying(info: NowPlaying): boolean;
  onCommand(callback: (event: MediaCommandEvent) => void): Unsubscribe;
}

export function createMediaSessionBridge(
  session: MediaSessionLike | null,
  Metadata: MediaMetadataConstructor | null,
): MediaSessionBridge {
  const listeners = new Set<(event: MediaCommandEvent) => void>();
  let enabled = false;
  const emit = (command: MediaCommand) => {
    for (const listener of [...listeners]) listener({ command });
  };

  return {
    setEnabled(on) {
      if (!session) return false;
      enabled = on;
      for (const [action, command] of ACTIONS) {
        try {
          session.setActionHandler(action, on ? () => emit(command) : null);
        } catch {
          /* this browser does not know the action (e.g. "stop" in older Safari) */
        }
      }
      if (!on) {
        session.metadata = null;
        session.playbackState = 'none';
      }
      return on;
    },
    setNowPlaying({ title, playing }) {
      if (!session || !enabled) return false;
      if (Metadata) session.metadata = new Metadata({ title, artist: 'Phyllo' });
      session.playbackState = playing ? 'playing' : 'paused';
      return true;
    },
    onCommand(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
}
