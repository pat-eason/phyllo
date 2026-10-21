import type { NativeApi } from './api';

/**
 * Offline cache for Strudel's built-in sounds (DECISIONS V15, T6.6).
 *
 * Desktop: Rust downloads an allowlisted URL once into `~/Music/Phyllo/.cache/sounds/` and the web view loads the
 * file through the asset protocol. Browser: the HTTP cache already does this job, so URLs pass through untouched.
 */

/** Hosts Rust will download from; mirrors `ALLOWED_HOSTS` in `src-tauri/src/sound_cache.rs`. */
export const SOUND_CACHE_HOSTS: readonly string[] = [
  'strudel.b-cdn.net',
  'raw.githubusercontent.com',
  'felixroos.github.io',
  'github.com',
];

/** True for `https://` URLs on an allowlisted host (what `sound_cache_fetch` accepts). */
export function isCacheableSoundUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    (parsed.port === '' || parsed.port === '443') &&
    parsed.username === '' &&
    parsed.password === '' &&
    SOUND_CACHE_HOSTS.includes(parsed.hostname.toLowerCase())
  );
}

export type UrlResolver = (url: string) => Promise<string>;

export interface CachedUrlResolverOptions {
  /** Called when the native cache could not provide a URL and the original is used instead. */
  onFallback?: (url: string, error: unknown) => void;
}

/**
 * Resolver for `EngineOptions.resolveUrl`: allowlisted sound URLs become `convertFileSrc(<cached file>)`, fetched
 * through Rust the first time and served from disk afterwards. Anything else, and any failure (offline with an
 * empty cache, a download error), resolves to the original URL so online use keeps working. Concurrent lookups of
 * one URL share a single IPC call; nothing is memoised, so clearing the cache never leaves stale file URLs behind.
 */
export function createCachedUrlResolver(
  native: Pick<NativeApi, 'kind' | 'soundCacheFetch' | 'convertFileSrc'>,
  options: CachedUrlResolverOptions = {},
): UrlResolver {
  if (native.kind !== 'tauri') return async (url) => url;
  const pending = new Map<string, Promise<string>>();
  return (url) => {
    if (!isCacheableSoundUrl(url)) return Promise.resolve(url);
    let job = pending.get(url);
    if (job === undefined) {
      job = native
        .soundCacheFetch(url)
        .then(({ path }) => native.convertFileSrc(path))
        .catch((error: unknown) => {
          options.onFallback?.(url, error);
          return url;
        })
        .finally(() => {
          pending.delete(url);
        });
      pending.set(url, job);
    }
    return job;
  };
}
