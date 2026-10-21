import { describe, expect, it, vi } from 'vitest';

import { NativeError } from './errors';
import { SOUND_CACHE_HOSTS, createCachedUrlResolver, isCacheableSoundUrl } from './soundCache';
import type { SoundCacheFetchResult } from './types';

describe('isCacheableSoundUrl', () => {
  it.each([
    'https://strudel.b-cdn.net/tidal-drum-machines.json',
    'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/bd/BT0A0A7.wav',
    'https://felixroos.github.io/webaudiofontdata/sound/0000_JCLive_sf2_file.js',
    'https://github.com/u/r/raw/main/x.wav',
    'https://STRUDEL.b-cdn.net:443/x.json',
  ])('accepts %s', (url) => {
    expect(isCacheableSoundUrl(url)).toBe(true);
  });

  it.each([
    'http://strudel.b-cdn.net/x.json',
    'https://evil.example/x.json',
    'https://strudel.b-cdn.net.evil.example/x.json',
    'https://user:pw@strudel.b-cdn.net/x.json',
    'https://strudel.b-cdn.net:8443/x.json',
    'asset://localhost/%2FUsers%2Fp%2Fa.wav',
    'blob:https://strudel.b-cdn.net/uuid',
    'not a url',
    '',
  ])('rejects %s', (url) => {
    expect(isCacheableSoundUrl(url)).toBe(false);
  });

  it('lists the same hosts as the Rust allowlist', () => {
    expect([...SOUND_CACHE_HOSTS].sort()).toEqual(
      ['felixroos.github.io', 'github.com', 'raw.githubusercontent.com', 'strudel.b-cdn.net'].sort(),
    );
  });
});

function fakeNative(kind: 'tauri' | 'browser', fetch: (url: string) => Promise<SoundCacheFetchResult>) {
  return {
    kind,
    soundCacheFetch: vi.fn(fetch),
    convertFileSrc: vi.fn((path: string) => `asset://localhost/${encodeURIComponent(path)}`),
  };
}

describe('createCachedUrlResolver', () => {
  const url = 'https://strudel.b-cdn.net/piano/A0v1.mp3';

  it('turns allowlisted URLs into asset URLs of the cached file', async () => {
    const native = fakeNative('tauri', async () => ({ path: '/m/Phyllo/.cache/sounds/x/A0v1.mp3' }));
    const resolve = createCachedUrlResolver(native);
    expect(await resolve(url)).toBe('asset://localhost/%2Fm%2FPhyllo%2F.cache%2Fsounds%2Fx%2FA0v1.mp3');
    expect(native.soundCacheFetch).toHaveBeenCalledWith(url);
  });

  it('leaves other URLs alone without calling Rust', async () => {
    const native = fakeNative('tauri', async () => ({ path: '/x' }));
    const resolve = createCachedUrlResolver(native);
    for (const other of ['https://example.com/a.wav', 'asset://localhost/a.wav', 'blob:null/1', 'ipc://localhost/cmd']) {
      expect(await resolve(other)).toBe(other);
    }
    expect(native.soundCacheFetch).not.toHaveBeenCalled();
  });

  it('falls back to the original URL when the native fetch fails, and reports it', async () => {
    const error = new NativeError('network', 'offline');
    const native = fakeNative('tauri', async () => {
      throw error;
    });
    const onFallback = vi.fn();
    const resolve = createCachedUrlResolver(native, { onFallback });
    expect(await resolve(url)).toBe(url);
    expect(onFallback).toHaveBeenCalledWith(url, error);
    // Not memoised: the next call tries again (e.g. back online).
    await resolve(url);
    expect(native.soundCacheFetch).toHaveBeenCalledTimes(2);
  });

  it('shares one native call between concurrent lookups of the same URL', async () => {
    let release: (r: SoundCacheFetchResult) => void = () => undefined;
    const native = fakeNative('tauri', () => new Promise((resolve) => (release = resolve)));
    const resolve = createCachedUrlResolver(native);
    const all = Promise.all([resolve(url), resolve(url), resolve(url)]);
    release({ path: '/c/a.mp3' });
    const results = await all;
    expect(new Set(results).size).toBe(1);
    expect(native.soundCacheFetch).toHaveBeenCalledTimes(1);
  });

  it('is the identity in the browser (the HTTP cache handles it)', async () => {
    const native = fakeNative('browser', async () => ({ path: '/never' }));
    const resolve = createCachedUrlResolver(native);
    expect(await resolve(url)).toBe(url);
    expect(native.soundCacheFetch).not.toHaveBeenCalled();
  });
});
