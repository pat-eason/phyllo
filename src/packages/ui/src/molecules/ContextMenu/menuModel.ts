/**
 * A context menu as plain data, shared by the DOM menu (`ContextMenu`) and the desktop app's native popup, which
 * builds the same entries as an OS menu. Keep builders pure so they can be unit-tested without rendering.
 */

export interface MenuItemEntry {
  type?: "item";
  /** Unique within its menu level. */
  id: string;
  label: string;
  onSelect: () => void;
  /**
   * Shortcut hint in accelerator syntax (`CmdOrCtrl+D`, `Shift+Alt+ArrowUp`, `Delete`, `F2`). Display only: the
   * key itself must already be handled elsewhere.
   */
  accelerator?: string;
  disabled?: boolean;
  /** Red text (Delete, Move to Trash). The native menu has no red text and ignores it. */
  destructive?: boolean;
  /** Set (true or false) to render a check item. */
  checked?: boolean;
  /** A colour dot before the label, e.g. a track colour. */
  swatch?: string;
  /** Tooltip, e.g. why an item is disabled. DOM menu only. */
  title?: string;
}

export interface MenuSeparatorEntry {
  type: "separator";
}

export interface MenuSubmenuEntry {
  type: "submenu";
  id: string;
  label: string;
  items: MenuEntry[];
  disabled?: boolean;
}

export type MenuEntry = MenuItemEntry | MenuSeparatorEntry | MenuSubmenuEntry;

/** A submenu as builders write it: its items may contain falsy entries too. */
export interface MenuSubmenuInput extends Omit<MenuSubmenuEntry, "items"> {
  items: MenuEntryInput[];
}

/** What a builder may return: `false`/`null`/`undefined` drop out, so `cond && item` works inline. */
export type MenuEntryInput = MenuItemEntry | MenuSeparatorEntry | MenuSubmenuInput | false | null | undefined;

export const MENU_SEPARATOR: MenuSeparatorEntry = Object.freeze({ type: "separator" });

/**
 * Drop falsy entries and empty submenus, then tidy separators (none at the start or end, never two in a row).
 * Recurses into submenus.
 */
export function compactMenu(entries: readonly MenuEntryInput[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.type === "separator") {
      if (out.length > 0 && out[out.length - 1]?.type !== "separator") out.push(entry);
      continue;
    }
    if (entry.type === "submenu") {
      const items = compactMenu(entry.items);
      if (items.length > 0) out.push({ ...entry, items });
      continue;
    }
    out.push(entry);
  }
  while (out[out.length - 1]?.type === "separator") out.pop();
  return out;
}

const MAC_GLYPHS: Readonly<Record<string, string>> = {
  cmdorctrl: "⌘",
  cmdorcontrol: "⌘",
  commandorctrl: "⌘",
  commandorcontrol: "⌘",
  cmd: "⌘",
  command: "⌘",
  super: "⌘",
  shift: "⇧",
  alt: "⌥",
  option: "⌥",
  ctrl: "⌃",
  control: "⌃",
};

const OTHER_NAMES: Readonly<Record<string, string>> = {
  cmdorctrl: "Ctrl",
  cmdorcontrol: "Ctrl",
  commandorctrl: "Ctrl",
  commandorcontrol: "Ctrl",
  cmd: "Win",
  command: "Win",
  super: "Win",
  shift: "Shift",
  alt: "Alt",
  option: "Alt",
  ctrl: "Ctrl",
  control: "Ctrl",
};

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  delete: "⌫",
  backspace: "⌫",
  enter: "↩",
  escape: "⎋",
  esc: "⎋",
  tab: "⇥",
  arrowup: "↑",
  up: "↑",
  arrowdown: "↓",
  down: "↓",
  arrowleft: "←",
  left: "←",
  arrowright: "→",
  right: "→",
  space: "Space",
};

/** macOS order: ⌃ ⌥ ⇧ ⌘. */
const MAC_ORDER = ["⌃", "⌥", "⇧", "⌘"];

/** `CmdOrCtrl+Shift+D` → `⇧⌘D` on macOS, `Ctrl+Shift+D` elsewhere. */
export function formatAccelerator(accelerator: string, isMac: boolean): string {
  const tokens = accelerator.split("+").map((token) => token.trim()).filter(Boolean);
  const key = tokens.pop() ?? "";
  const keyLower = key.toLowerCase();
  const keyLabel = KEY_GLYPHS[keyLower] ?? (key.length === 1 ? key.toUpperCase() : key.replace(/^Key|^Digit/, ""));
  if (isMac) {
    const mods = tokens.map((token) => MAC_GLYPHS[token.toLowerCase()] ?? token);
    mods.sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b));
    return mods.join("") + keyLabel;
  }
  const mods = tokens.map((token) => OTHER_NAMES[token.toLowerCase()] ?? token);
  const plainKey = keyLower === "delete" || keyLower === "backspace" ? "Del" : keyLabel;
  return [...mods, plainKey].join("+");
}

/** Best guess at the platform when the caller doesn't pass one. */
export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}
