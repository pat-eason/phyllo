import { useStore } from "zustand";
import type { ClipboardItem, ClipboardKind } from "../state/clipboardStore";
import { useAppStores } from "../state/context";

export interface UseClipboard {
  /** What was last copied, or null. */
  item: ClipboardItem | null;
  /** Put a copy of `item` on the app clipboard (replacing what was there). */
  copy(item: ClipboardItem): void;
}

/** App clipboard for context-menu Copy/Paste of tracks, clips, modifiers and step rows. */
export function useClipboard(): UseClipboard {
  const { clipboard } = useAppStores();
  const item = useStore(clipboard, (s) => s.item);
  const copy = useStore(clipboard, (s) => s.copy);
  return { item, copy };
}

/** The clipboard item when it is of `kind`, else null: `clipboardOf(item, "clip")?.clip`. */
export function clipboardOf<K extends ClipboardKind>(item: ClipboardItem | null, kind: K): Extract<ClipboardItem, { kind: K }> | null {
  return item && isKind(item, kind) ? item : null;
}

function isKind<K extends ClipboardKind>(item: ClipboardItem, kind: K): item is Extract<ClipboardItem, { kind: K }> {
  return item.kind === kind;
}
