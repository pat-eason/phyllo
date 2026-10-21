import type { GrooveSummary, ThemeMode } from "@phyllo/model";
import type { MediaCommand, MenuItemState, RecentItem } from "../../native/types";
import type { RunAction } from "./actions";

/** Channel the Settings window uses to ask the main window for app-level dialogs (D94). */
export const SHELL_CHANNEL = "phyllo-shell";

export type ShellMessage = { type: "openHistory" };

export function isShellMessage(value: unknown): value is ShellMessage {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "openHistory";
}

/** File › Open Recent: opened grooves, newest first, ignoring those opened before the last "Clear Menu". */
export function recentItems(grooves: readonly GrooveSummary[], clearedAt: number, limit = 10): RecentItem[] {
  return grooves
    .filter((groove) => groove.opened !== null && Date.parse(groove.opened) > clearedAt)
    .sort((a, b) => Date.parse(b.opened ?? "") - Date.parse(a.opened ?? ""))
    .slice(0, limit)
    .map((groove) => ({ path: groove.path, name: groove.name }));
}

/** Menu items whose label / check mark mirror app state. */
export function menuStates(state: {
  playing: boolean;
  loop: boolean;
  recordArmed: boolean;
  uiMode: "guided" | "pro";
  themeMode: ThemeMode;
}): MenuItemState[] {
  return [
    { id: "transport.playPause", text: state.playing ? "Pause" : "Play" },
    { id: "transport.loop", checked: state.loop },
    { id: "transport.record", checked: state.recordArmed },
    // A plain item in menu.rs (no check mark), so the label names the mode it switches to.
    { id: "view.uiMode", text: state.uiMode === "guided" ? "Switch to Pro" : "Switch to Guided" },
    { id: "view.theme.dark", checked: state.themeMode === "dark" },
    { id: "view.theme.light", checked: state.themeMode === "light" },
    { id: "view.theme.system", checked: state.themeMode === "system" },
  ];
}

/** Media keys / Now Playing commands → transport actions. `next` has no meaning in a loop-based DAW. */
export function mediaAction(command: MediaCommand, playing: boolean): Parameters<RunAction>[0] | null {
  switch (command) {
    case "play":
      return playing ? null : "transport.playPause";
    case "pause":
      return playing ? "transport.playPause" : null;
    case "toggle":
      return "transport.playPause";
    case "stop":
      return "transport.stop";
    case "previous":
      return "transport.backToStart";
    case "next":
      return null;
    default:
      return null;
  }
}
