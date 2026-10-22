import type { Clip, Modifier, Track } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";

/**
 * What Copy put on the app clipboard. These are model objects, not text: the system clipboard (⌘C in fields) is
 * untouched. Pasting always clones with fresh ids (`cloneTrack`, `cloneClip`, `cloneModifier` in `@phyllo/model`).
 */
export type ClipboardItem =
  | { kind: "track"; track: Track }
  /** Paste keeps the clip's length and moves its start to the paste position. */
  | { kind: "clip"; clip: Clip }
  | { kind: "modifier"; modifier: Modifier }
  /** One step-sequencer row: 16 on/off steps. */
  | { kind: "steps"; steps: boolean[] };

export type ClipboardKind = ClipboardItem["kind"];

export interface ClipboardStoreState {
  item: ClipboardItem | null;
  copy(item: ClipboardItem): void;
  clear(): void;
}

/** In-memory, per window, not persisted; it lives as long as the app stores. */
export function createClipboardStore(): StoreApi<ClipboardStoreState> {
  return createStore<ClipboardStoreState>()((set) => ({
    item: null,
    copy: (item) => set({ item: structuredClone(item) }),
    clear: () => set({ item: null }),
  }));
}
