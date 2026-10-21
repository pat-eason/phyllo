import { listBuiltInSoundUrls } from "@phyllo/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNative } from "../../../hooks";
import { createCachedUrlResolver } from "../../../native/soundCache";
import type { SoundCacheProgress, SoundCacheStatus } from "../../../native/types";

export type OfflineDownload =
  | { phase: "idle" }
  | { phase: "listing" }
  | { phase: "downloading"; progress: SoundCacheProgress }
  | { phase: "done"; progress: SoundCacheProgress }
  | { phase: "error"; message: string };

export interface SoundCacheControls {
  /** Files and bytes on disk; `null` until first read. */
  status: SoundCacheStatus | null;
  download: OfflineDownload;
  start(): Promise<void>;
  clear(): Promise<void>;
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

/**
 * Offline cache for the built-in sounds (D108): lists every URL, hands them to `soundCachePrefetch` and follows
 * `sound-cache://progress`. `listSoundUrls` defaults to the engine's list, read through the cache resolver so it
 * also works from the cache while offline.
 */
export function useSoundCache(listSoundUrls?: () => Promise<string[]>): SoundCacheControls {
  const native = useNative();
  const [status, setStatus] = useState<SoundCacheStatus | null>(null);
  const [download, setDownload] = useState<OfflineDownload>({ phase: "idle" });
  const busy = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await native.soundCacheStatus());
    } catch {
      // A failed read leaves the previous numbers on screen.
    }
  }, [native]);

  useEffect(() => {
    let current = true;
    native
      .soundCacheStatus()
      .then((next) => {
        if (current) setStatus(next);
      })
      .catch(() => {
        // The size line just stays empty.
      });
    return () => {
      current = false;
    };
  }, [native]);

  useEffect(() => {
    let off: (() => void) | undefined;
    let disposed = false;
    void native
      .onSoundCacheProgress((progress) => {
        setDownload((previous) => (previous.phase === "downloading" ? { phase: "downloading", progress } : previous));
      })
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else off = unsubscribe;
      })
      .catch(() => {
        // No progress events: the final counts still arrive when the download resolves.
      });
    return () => {
      disposed = true;
      off?.();
    };
  }, [native]);

  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setDownload({ phase: "listing" });
      const urls = await (listSoundUrls ? listSoundUrls() : listBuiltInSoundUrls({ resolveUrl: createCachedUrlResolver(native) }));
      setDownload({ phase: "downloading", progress: { done: 0, total: urls.length, failed: 0 } });
      const progress = await native.soundCachePrefetch(urls);
      setDownload({ phase: "done", progress });
      await refreshStatus();
    } catch (error) {
      setDownload({ phase: "error", message: messageOf(error) });
    } finally {
      busy.current = false;
    }
  }, [listSoundUrls, native, refreshStatus]);

  const clear = useCallback(async () => {
    try {
      await native.soundCacheClear();
      setDownload({ phase: "idle" });
    } catch (error) {
      setDownload({ phase: "error", message: messageOf(error) });
    }
    await refreshStatus();
  }, [native, refreshStatus]);

  return { status, download, start, clear };
}
