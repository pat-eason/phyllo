import { useEffect, useState } from "react";
import { useNative } from "../../../hooks";
import type { PhylloPaths } from "../../../native/types";

/** Project root and exports folder from the native layer; `null` until they resolve (or if the lookup fails). */
export function usePhylloPaths(): PhylloPaths | null {
  const native = useNative();
  const [paths, setPaths] = useState<PhylloPaths | null>(null);
  useEffect(() => {
    let current = true;
    native
      .getPaths()
      .then((next) => {
        if (current) setPaths(next);
      })
      .catch(() => {
        // Without paths the folder rows keep their placeholder.
      });
    return () => {
      current = false;
    };
  }, [native]);
  return paths;
}

/** Writes `/Users/me/Music` as `~/Music` when the home folder is known (derived from `~/Music/Phyllo`). */
export function tildify(path: string, paths: PhylloPaths | null): string {
  const home = paths?.root.replace(/\/Music\/Phyllo$/, "");
  if (!home || home === paths?.root || home.startsWith("~")) return path;
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}
