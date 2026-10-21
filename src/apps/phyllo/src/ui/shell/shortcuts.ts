import type { UiMode } from "@phyllo/model";
import { MENU_ACTIONS } from "../../native/types";
import type { MenuItemId } from "../../native/types";
import { PROJECT_SCREENS } from "./router";
import type { ScreenName } from "./router";

/**
 * Every app-level command. Keyboard shortcuts (below) and native menu items (`menu://action`, ids from
 * `src-tauri/src/menu.rs` / `MENU_ACTIONS`) both resolve to these ids and run through one action table
 * (`useShellActions`), so a key and its menu item can never drift apart.
 */
export type ShellActionId =
  | "transport.playPause"
  | "transport.stop"
  | "transport.backToStart"
  | "transport.loop"
  | "transport.record"
  | "track.mute"
  | "track.solo"
  | "tool.select"
  | "tool.draw"
  | "tool.split"
  | "library.search"
  | "edit.undo"
  | "edit.redo"
  | "app.settings"
  | "file.new"
  | "file.open"
  | "file.save"
  | "file.saveAs"
  | "file.history"
  | "file.import"
  | "file.export"
  | "file.recent.clear"
  | "view.arrange"
  | "view.pattern"
  | "view.mixer"
  | "view.library"
  | "view.codeDrawer"
  | "view.uiMode"
  | "view.theme.dark"
  | "view.theme.light"
  | "view.theme.system"
  | "help.shortcuts"
  | "help.strudel";

export interface ShortcutContext {
  /** Screen on view; null while the startup flow decides. */
  screen: ScreenName | null;
  uiMode: UiMode;
  /** The desktop menu bar is active and owns its accelerators (they arrive as `menu://action`). */
  nativeMenu: boolean;
  /** ⌘ is the command modifier (macOS); Ctrl elsewhere. */
  isMac: boolean;
  /** A modal dialog is open: global shortcuts stay quiet. */
  modalOpen: boolean;
}

/** What the focused element is, as far as shortcuts care. */
export interface TargetInfo {
  /** input/select: only `inFields` shortcuts fire. */
  field: boolean;
  /** textarea or contenteditable (code editors): nothing fires. */
  editor: boolean;
  /** Space/Enter activate it natively (buttons, switches, links, options…). */
  activates: boolean;
  /** Inside the header's Transport group (Enter = stop & return). */
  inTransport: boolean;
}

export interface ShortcutDef {
  action: ShellActionId;
  /** `KeyboardEvent.key`, compared case-insensitively. */
  key: string;
  /** ⌘ on macOS, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  /** The native menu item that carries the same accelerator; skipped while `nativeMenu` is on. */
  menu?: MenuItemId;
  /** Also fires while an input/select is focused (⌘ commands that don't edit text). */
  inFields?: boolean;
  /** Fires while the key auto-repeats. */
  repeat?: boolean;
  /** Only while focus is inside the Transport group. */
  inTransport?: boolean;
  when?: (ctx: ShortcutContext) => boolean;
  /** For the shortcuts list. */
  label: string;
  /** Display keys for `Kbd`, e.g. `["⇧", "⌘", "L"]`. */
  keys: readonly string[];
}

const onProject = (ctx: ShortcutContext) => ctx.screen !== null && PROJECT_SCREENS.has(ctx.screen);
const onProjectOrLibrary = (ctx: ShortcutContext) => onProject(ctx) || ctx.screen === "library";
const proArrange = (ctx: ShortcutContext) => ctx.screen === "arrange" && ctx.uiMode === "pro";

/**
 * SPEC §7. Order matters: the first match wins, so `S` is the Split tool in Pro on Arrange (mockup V/B/S tools)
 * and Solo everywhere else. Delete is the Timeline's own key.
 */
export const SHORTCUTS: readonly ShortcutDef[] = [
  { action: "transport.playPause", key: " ", when: onProject, label: "Play / pause", keys: ["Space"] },
  { action: "transport.stop", key: "Enter", inTransport: true, when: onProject, label: "Stop and return", keys: ["⏎"] },
  { action: "transport.loop", key: "l", when: onProject, label: "Loop on / off", keys: ["L"] },
  { action: "transport.record", key: "r", when: onProject, label: "Arm recording", keys: ["R"] },
  { action: "track.mute", key: "m", when: onProject, label: "Mute selected track", keys: ["M"] },
  { action: "tool.select", key: "v", when: proArrange, label: "Select tool (Pro)", keys: ["V"] },
  { action: "tool.draw", key: "b", when: proArrange, label: "Draw tool (Pro)", keys: ["B"] },
  { action: "tool.split", key: "s", when: proArrange, label: "Split tool (Pro, Arrange)", keys: ["S"] },
  { action: "track.solo", key: "s", when: onProject, label: "Solo selected track", keys: ["S"] },
  { action: "library.search", key: "k", mod: true, when: onProject, label: "Search sounds (quick add)", keys: ["⌘", "K"] },
  { action: "edit.undo", key: "z", mod: true, repeat: true, when: onProject, label: "Undo", keys: ["⌘", "Z"] },
  { action: "edit.redo", key: "z", mod: true, shift: true, repeat: true, when: onProject, label: "Redo", keys: ["⇧", "⌘", "Z"] },
  { action: "file.export", key: "e", mod: true, menu: "file.export", inFields: true, when: onProjectOrLibrary, label: "Export", keys: ["⌘", "E"] },
  { action: "app.settings", key: ",", mod: true, menu: "app.settings", inFields: true, label: "Settings", keys: ["⌘", ","] },
  { action: "view.arrange", key: "1", mod: true, menu: "view.arrange", inFields: true, label: "Arrange", keys: ["⌘", "1"] },
  { action: "view.pattern", key: "2", mod: true, menu: "view.pattern", inFields: true, label: "Pattern editor", keys: ["⌘", "2"] },
  { action: "view.mixer", key: "3", mod: true, menu: "view.mixer", inFields: true, label: "Mixer", keys: ["⌘", "3"] },
  { action: "view.library", key: "l", mod: true, shift: true, menu: "view.library", inFields: true, label: "Groove library", keys: ["⇧", "⌘", "L"] },
  { action: "view.codeDrawer", key: "/", mod: true, menu: "view.codeDrawer", label: "Show or hide the code drawer", keys: ["⌘", "/"] },
  { action: "view.uiMode", key: "g", mod: true, shift: true, menu: "view.uiMode", inFields: true, label: "Switch Guided / Pro", keys: ["⇧", "⌘", "G"] },
  { action: "file.save", key: "s", mod: true, menu: "file.save", inFields: true, when: onProject, label: "Save", keys: ["⌘", "S"] },
  { action: "file.saveAs", key: "s", mod: true, shift: true, menu: "file.saveAs", inFields: true, when: onProject, label: "Save as", keys: ["⇧", "⌘", "S"] },
  { action: "file.new", key: "n", mod: true, menu: "file.new", inFields: true, label: "New groove", keys: ["⌘", "N"] },
  { action: "file.open", key: "o", mod: true, menu: "file.open", inFields: true, label: "Open…", keys: ["⌘", "O"] },
];

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

/** The shortcut `event` triggers in `ctx`, or null. Pure; the listener does the DOM lookups. */
export function matchShortcut(
  event: KeyLike,
  ctx: ShortcutContext,
  target: TargetInfo,
  table: readonly ShortcutDef[] = SHORTCUTS,
): ShortcutDef | null {
  if (event.defaultPrevented || ctx.modalOpen || target.editor || event.altKey) return null;
  // The other platform's modifier (Ctrl on macOS, ⌘ elsewhere) never maps to a command here.
  if (ctx.isMac ? event.ctrlKey : event.metaKey) return null;
  const mod = ctx.isMac ? event.metaKey : event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  for (const def of table) {
    if (def.key !== key || Boolean(def.mod) !== mod || Boolean(def.shift) !== event.shiftKey) continue;
    if (event.repeat && !def.repeat) continue;
    if (target.field && !def.inFields) continue;
    if (def.inTransport && !target.inTransport) continue;
    // Space on a focused button activates that button (SPEC §8: real buttons stay keyboard-operable).
    if (def.key === " " && target.activates) continue;
    if (ctx.nativeMenu && def.menu !== undefined && MENU_ACTIONS[def.menu].accelerator !== null) continue;
    if (def.when && !def.when(ctx)) continue;
    return def;
  }
  return null;
}

const FIELD_INPUT_TYPES = new Set([
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

const ACTIVATING_ROLES = new Set(["button", "switch", "checkbox", "radio", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "link"]);

/** Classifies the focused element (`event.target`). */
export function describeTarget(target: EventTarget | null): TargetInfo {
  const none: TargetInfo = { field: false, editor: false, activates: false, inTransport: false };
  if (!(target instanceof Element)) return none;
  const inTransport = target.closest('[role="group"][aria-label="Transport"]') !== null;
  const tag = target.tagName;
  if (tag === "TEXTAREA" || (target instanceof HTMLElement && target.isContentEditable)) {
    return { ...none, editor: true, inTransport };
  }
  if (tag === "SELECT") return { ...none, field: true, inTransport };
  if (tag === "INPUT") {
    const type = (target as HTMLInputElement).type;
    if (FIELD_INPUT_TYPES.has(type)) return { ...none, field: true, inTransport };
    return { ...none, activates: type !== "range", inTransport };
  }
  const role = target.getAttribute("role");
  const activates =
    tag === "BUTTON" || tag === "SUMMARY" || (tag === "A" && target.hasAttribute("href")) || (role !== null && ACTIVATING_ROLES.has(role));
  return { ...none, activates, inTransport };
}

/** macOS (and iPadOS) use ⌘; everything else Ctrl. */
export function detectMac(nav: Pick<Navigator, "userAgent" | "platform"> | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad/i.test(nav.platform || nav.userAgent);
}
