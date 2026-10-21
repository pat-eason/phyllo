import { describe, expect, it, vi } from 'vitest';

import { type BroadcastChannelLike, createBrowserApi } from './browser';
import { isNativeError } from './errors';
import type { MediaSessionBridge } from './mediaSession';

type Listener = (message: MessageEvent) => void;

/** Two in-memory BroadcastChannel ends: what one posts, only the other receives (like the real API). */
function channelPair(): [BroadcastChannelLike, BroadcastChannelLike] {
  const listeners = [new Set<Listener>(), new Set<Listener>()];
  const end = (self: number): BroadcastChannelLike =>
    ({
      postMessage: (data: unknown) => {
        for (const l of listeners[1 - self]!) l({ data } as MessageEvent);
      },
      addEventListener: (_type: string, l: Listener) => listeners[self]!.add(l),
      removeEventListener: (_type: string, l: Listener) => listeners[self]!.delete(l),
    }) as unknown as BroadcastChannelLike;
  return [end(0), end(1)];
}

const browserApi = (options: Parameters<typeof createBrowserApi>[0] = {}) =>
  createBrowserApi({ storage: null, log: () => undefined, broadcastChannel: null, ...options });

describe('browser native: system integration', () => {
  it('should carry broadcasts to the other tab on the same channel only', async () => {
    // Arrange
    const [a, b] = channelPair();
    const main = browserApi({ broadcastChannel: a });
    const settings = browserApi({ broadcastChannel: b });
    const onSettings = vi.fn();
    const onOther = vi.fn();
    const onSelf = vi.fn();
    await settings.onBroadcast('settings', onSettings);
    await settings.onBroadcast('other', onOther);
    await main.onBroadcast('settings', onSelf);

    // Act
    await main.broadcast('settings', { accent: 'moss' });

    // Assert
    expect(onSettings).toHaveBeenCalledWith({ accent: 'moss' });
    expect(onOther).not.toHaveBeenCalled();
    expect(onSelf).not.toHaveBeenCalled();
  });

  it('should stop delivering broadcasts after unsubscribe', async () => {
    // Arrange
    const [a, b] = channelPair();
    const cb = vi.fn();
    const off = await browserApi({ broadcastChannel: b }).onBroadcast('settings', cb);

    // Act
    off();
    await browserApi({ broadcastChannel: a }).broadcast('settings', 1);

    // Assert
    expect(cb).not.toHaveBeenCalled();
  });

  it('should reject invalid broadcast channel names', async () => {
    // Arrange
    const api = browserApi();

    // Act
    const err = await api.broadcast('no spaces', 1).catch((e: unknown) => e);

    // Assert
    expect(isNativeError(err, 'invalid_argument')).toBe(true);
  });

  it('should report that tray, file associations and native notifications are unavailable', async () => {
    // Arrange
    const api = browserApi();

    // Act
    const tray = await api.traySetEnabled(true);
    const pending = await api.takePendingOpenFiles();
    const notified = await api.notifyExportFinished({ title: 'Export finished', body: 'mix.wav', path: 'mix.wav' });

    // Assert
    expect(tray).toBe(false);
    expect(pending).toEqual([]);
    expect(notified).toBe(false);
    await expect(api.menuSetState({ id: 'file.save', enabled: false })).resolves.toBeUndefined();
    await expect(api.menuSetRecent([{ path: '/Phyllo/a.phyllo', name: 'A' }])).resolves.toBeUndefined();
    await expect(api.appSetKeepRunning(true)).resolves.toBeUndefined();
  });

  it('should drive media keys through the media-session bridge', async () => {
    // Arrange
    const offCommand = vi.fn();
    const media = {
      setEnabled: vi.fn((on: boolean) => on),
      setNowPlaying: vi.fn(() => true),
      onCommand: vi.fn(() => offCommand),
    } satisfies MediaSessionBridge;
    const api = browserApi({ mediaSession: media });
    const cb = vi.fn();

    // Act
    const enabled = await api.mediaSetEnabled(true);
    const published = await api.mediaSetNowPlaying({ title: 'Groove', playing: true });
    const off = await api.onMediaCommand(cb);
    off();

    // Assert
    expect(enabled).toBe(true);
    expect(published).toBe(true);
    expect(media.setNowPlaying).toHaveBeenCalledWith({ title: 'Groove', playing: true });
    expect(media.onCommand).toHaveBeenCalledWith(cb);
    expect(offCommand).toHaveBeenCalled();
  });
});
