import { useEffect, useState } from "react";
import { useNative } from "../../../hooks";

export type FolderScan = { status: "scanning" } | { status: "ready"; files: number } | { status: "missing" };

/**
 * File counts for the linked sample folders (`sampleFolderScan`), refreshed when the watcher reports a change.
 * A folder that can't be scanned (moved, unplugged drive) reports `missing`.
 */
export function useFolderScans(folders: readonly string[]): Record<string, FolderScan> {
  const native = useNative();
  const [scans, setScans] = useState<Record<string, FolderScan>>({});

  useEffect(() => {
    let current = true;
    const scan = (folder: string) => {
      native
        .sampleFolderScan(folder)
        .then(({ files }) => {
          if (current) setScans((previous) => ({ ...previous, [folder]: { status: "ready", files: files.length } }));
        })
        .catch(() => {
          if (current) setScans((previous) => ({ ...previous, [folder]: { status: "missing" } }));
        });
    };
    for (const folder of folders) scan(folder);

    let off: (() => void) | undefined;
    native
      .onSamplesChanged((event) => {
        if (folders.includes(event.folder)) scan(event.folder);
      })
      .then((unsubscribe) => {
        if (current) off = unsubscribe;
        else unsubscribe();
      })
      .catch(() => {
        // Without change events the counts refresh the next time the section mounts.
      });
    return () => {
      current = false;
      off?.();
    };
  }, [native, folders]);

  return scans;
}
