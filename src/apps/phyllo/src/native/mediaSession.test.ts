import { describe, expect, it, vi } from 'vitest';

import { type MediaSessionLike, createMediaSessionBridge } from './mediaSession';

/** In-memory `navigator.mediaSession`: records the handlers the bridge installs. */
function fakeSession(unsupported: MediaSessionAction[] = []) {
  const handlers = new Map<MediaSessionAction, MediaSessionActionHandler>();
  const session: MediaSessionLike & { handlers: typeof handlers } = {
    metadata: null,
    playbackState: 'none',
    handlers,
    setActionHandler(action, handler) {
      if (unsupported.includes(action)) throw new TypeError(`unsupported action ${action}`);
      if (handler) handlers.set(action, handler);
      else handlers.delete(action);
    },
  };
  return session;
}

class FakeMetadata {
  title: string;
  artist: string;
  constructor(init: MediaMetadataInit) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
  }
}

const Metadata = FakeMetadata as unknown as new (init: MediaMetadataInit) => MediaMetadata;
const trigger = (session: ReturnType<typeof fakeSession>, action: MediaSessionAction) =>
  session.handlers.get(action)?.({ action });

describe('createMediaSessionBridge', () => {
  it('should translate media-session actions into media commands while enabled', () => {
    // Arrange
    const session = fakeSession();
    const bridge = createMediaSessionBridge(session, Metadata);
    const cb = vi.fn();
    bridge.onCommand(cb);

    // Act
    const enabled = bridge.setEnabled(true);
    for (const action of ['play', 'pause', 'stop', 'nexttrack', 'previoustrack'] as const) trigger(session, action);

    // Assert
    expect(enabled).toBe(true);
    expect(cb.mock.calls.map((c) => c[0])).toEqual([
      { command: 'play' },
      { command: 'pause' },
      { command: 'stop' },
      { command: 'next' },
      { command: 'previous' },
    ]);
  });

  it('should clear handlers, metadata and state when disabled', () => {
    // Arrange
    const session = fakeSession();
    const bridge = createMediaSessionBridge(session, Metadata);
    bridge.setEnabled(true);
    bridge.setNowPlaying({ title: 'Groove', playing: true });

    // Act
    const enabled = bridge.setEnabled(false);

    // Assert
    expect(enabled).toBe(false);
    expect(session.handlers.size).toBe(0);
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('should publish the project title and play state only while enabled', () => {
    // Arrange
    const session = fakeSession();
    const bridge = createMediaSessionBridge(session, Metadata);

    // Act
    const beforeEnable = bridge.setNowPlaying({ title: 'Ignored', playing: true });
    bridge.setEnabled(true);
    const afterEnable = bridge.setNowPlaying({ title: 'Groove', playing: false });

    // Assert
    expect(beforeEnable).toBe(false);
    expect(afterEnable).toBe(true);
    expect(session.metadata).toEqual({ title: 'Groove', artist: 'Phyllo' });
    expect(session.playbackState).toBe('paused');
  });

  it('should skip actions the browser does not support instead of failing', () => {
    // Arrange
    const session = fakeSession(['stop']);
    const bridge = createMediaSessionBridge(session, Metadata);

    // Act
    const enabled = bridge.setEnabled(true);

    // Assert
    expect(enabled).toBe(true);
    expect([...session.handlers.keys()].sort()).toEqual(['nexttrack', 'pause', 'play', 'previoustrack']);
  });

  it('should report false everywhere when there is no media session', () => {
    // Arrange
    const bridge = createMediaSessionBridge(null, null);

    // Act
    const enabled = bridge.setEnabled(true);
    const published = bridge.setNowPlaying({ title: 'Groove', playing: true });

    // Assert
    expect(enabled).toBe(false);
    expect(published).toBe(false);
  });

  it('should stop calling a listener after it unsubscribes', () => {
    // Arrange
    const session = fakeSession();
    const bridge = createMediaSessionBridge(session, Metadata);
    const cb = vi.fn();
    const off = bridge.onCommand(cb);
    bridge.setEnabled(true);

    // Act
    off();
    trigger(session, 'play');

    // Assert
    expect(cb).not.toHaveBeenCalled();
  });
});
