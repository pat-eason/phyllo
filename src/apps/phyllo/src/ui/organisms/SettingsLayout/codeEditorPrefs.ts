import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Code editor preferences. `Settings` has no fields for them, so they are a per-viewer convenience kept in
 * `localStorage` (shared by the main and Settings windows, which are one origin). The code drawer reads them
 * with `useCodeEditorPrefs()`.
 */
export interface CodeEditorPrefs {
  /** px, 12–16 */
  fontSize: number;
  lineNumbers: boolean;
}

export const CODE_EDITOR_PREFS_KEY = "phyllo.codeEditor";
export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 16;
export const DEFAULT_CODE_EDITOR_PREFS: Readonly<CodeEditorPrefs> = Object.freeze({ fontSize: 12, lineNumbers: true });

const CHANGE_EVENT = "phyllo:code-editor-prefs";

/** Validates a stored blob; wrong types fall back to the defaults, the size is clamped. Never throws. */
export function parseCodeEditorPrefs(raw: string | null): CodeEditorPrefs {
  if (raw === null) return { ...DEFAULT_CODE_EDITOR_PREFS };
  try {
    const value: unknown = JSON.parse(raw);
    const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
    const size = record["fontSize"];
    const lines = record["lineNumbers"];
    return {
      fontSize:
        typeof size === "number" && Number.isFinite(size)
          ? Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(size)))
          : DEFAULT_CODE_EDITOR_PREFS.fontSize,
      lineNumbers: typeof lines === "boolean" ? lines : DEFAULT_CODE_EDITOR_PREFS.lineNumbers,
    };
  } catch {
    return { ...DEFAULT_CODE_EDITOR_PREFS };
  }
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CODE_EDITOR_PREFS_KEY);
  } catch {
    // Storage blocked (private window, site data cleared): defaults apply.
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === CODE_EDITOR_PREFS_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export interface UseCodeEditorPrefs extends CodeEditorPrefs {
  update(patch: Partial<CodeEditorPrefs>): void;
}

/** Current prefs plus `update(patch)`. Changes reach other windows through the `storage` event. */
export function useCodeEditorPrefs(): UseCodeEditorPrefs {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const prefs = useMemo(() => parseCodeEditorPrefs(raw), [raw]);

  const update = useCallback((patch: Partial<CodeEditorPrefs>) => {
    const next = parseCodeEditorPrefs(JSON.stringify({ ...parseCodeEditorPrefs(readRaw()), ...patch }));
    try {
      window.localStorage.setItem(CODE_EDITOR_PREFS_KEY, JSON.stringify(next));
    } catch {
      // Storage is unavailable, so the change can't be kept; the preferences stay at what was last stored.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { ...prefs, update };
}
