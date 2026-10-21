import { useCallback, useEffect, useRef, useState } from "react";
import { useNative, useSettings } from "../../../hooks";
import type { SampleFile } from "../../../native/types";

export type FolderScan =
  | { status: "loading"; files: readonly SampleFile[] }
  | { status: "ready"; files: readonly SampleFile[] }
  | { status: "error"; files: readonly SampleFile[]; message: string };

export interface LinkedFolder {
  path: string;
  scan: FolderScan;
}

export interface SampleFolders {
  folders: LinkedFolder[];
  /** Opens the native folder picker and adds the choice to `settings.sampleFolders`. */
  link(): Promise<void>;
  unlink(path: string): void;
}

const LOADING: FolderScan = { status: "loading", files: [] };

/**
 * The linked sample folders from settings with their scan results (cached in component state, rescanned when the
 * native watcher reports a change). Registering the samples with the engine is done elsewhere.
 */
export function useSampleFolders(): SampleFolders {
  const native = useNative();
  const { settings, set } = useSettings();
  const paths = settings.sampleFolders;
  const [scans, setScans] = useState<Readonly<Record<string, FolderScan>>>({});
  const requested = useRef(new Set<string>());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const scan = useCallback(
    (path: string) => {
      native.sampleFolderScan(path).then(
        (result) => {
          if (alive.current) setScans((prev) => ({ ...prev, [path]: { status: "ready", files: result.files } }));
        },
        (error: unknown) => {
          if (!alive.current) return;
          const message = error instanceof Error ? error.message : String(error);
          setScans((prev) => ({ ...prev, [path]: { status: "error", files: prev[path]?.files ?? [], message } }));
        },
      );
    },
    [native],
  );

  // Scan each folder once; a folder that is unlinked and linked again is scanned again.
  useEffect(() => {
    for (const path of requested.current) if (!paths.includes(path)) requested.current.delete(path);
    for (const path of paths) {
      if (requested.current.has(path)) continue;
      requested.current.add(path);
      scan(path);
    }
  }, [paths, scan]);

  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    native
      .onSamplesChanged((event) => {
        if (requested.current.has(event.folder)) scan(event.folder);
      })
      .then(
        (unsubscribe) => {
          if (cancelled) unsubscribe();
          else off = unsubscribe;
        },
        () => {},
      );
    return () => {
      cancelled = true;
      off?.();
    };
  }, [native, scan]);

  const link = useCallback(async () => {
    const chosen = await native.openDialog({ directory: true, title: "Link a sample folder" }).catch(() => null);
    if (chosen === null) return;
    const picked = (Array.isArray(chosen) ? chosen : [chosen]).filter((p) => p !== "");
    const next = [...paths];
    for (const path of picked) if (!next.includes(path)) next.push(path);
    if (next.length !== paths.length) set("sampleFolders", next);
  }, [native, paths, set]);

  const unlink = useCallback(
    (path: string) => {
      set(
        "sampleFolders",
        paths.filter((p) => p !== path),
      );
    },
    [paths, set],
  );

  return {
    folders: paths.map((path) => ({ path, scan: scans[path] ?? LOADING })),
    link,
    unlink,
  };
}
