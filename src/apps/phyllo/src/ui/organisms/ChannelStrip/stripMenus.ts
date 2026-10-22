import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";

/** Right-click menus of the Mixer strips, as pure builders (the strips wire the commands to the stores). */

/** Text fields (an insert's value, the master's device select) keep the browser's own menu. */
export const isTextField = (target: EventTarget): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

export interface TrackStripExtraCommands {
  /** The fader's double-click: back to 0 dB. */
  resetVolume(): void;
  /** Select the track and open the Arrange screen, where the Inspector lives. */
  showInInspector(): void;
}

/** Mixer-specific entries the shared track menu puts after Duplicate (`useTrackMenu`'s `extra`). */
export function trackStripExtra(gainLocked: boolean, commands: TrackStripExtraCommands): MenuEntryInput[] {
  return [
    MENU_SEPARATOR,
    {
      id: "resetVolume",
      label: "Reset volume",
      disabled: gainLocked,
      title: gainLocked ? "Volume follows a pattern" : undefined,
      onSelect: commands.resetVolume,
    },
    { id: "showInInspector", label: "Show in Inspector", onSelect: commands.showInInspector },
  ];
}

export interface ModifierInsertMenuCommands {
  setEnabled(enabled: boolean): void;
  showInInspector(): void;
  /** Deletes the modifier. */
  remove(): void;
}

/** An insert row that is an effect modifier (`.crush(4)`); only enabled modifiers are listed, so "Enabled" starts checked. */
export function modifierInsertMenuEntries(enabled: boolean, commands: ModifierInsertMenuCommands): MenuEntryInput[] {
  return [
    { id: "enabled", label: "Enabled", checked: enabled, onSelect: () => commands.setEnabled(!enabled) },
    { id: "showInInspector", label: "Show in Inspector", onSelect: commands.showInInspector },
    MENU_SEPARATOR,
    { id: "remove", label: "Remove modifier", destructive: true, onSelect: commands.remove },
  ];
}

export interface ParamInsertMenuState {
  /** A plain number the strip edits inline. */
  editable: boolean;
  /** The param is set on the track (not only driven by a modifier). */
  hasValue: boolean;
}

export interface ParamInsertMenuCommands {
  /** The insert's click: opens its inline value field. */
  editValue(): void;
  showInInspector(): void;
  /** Unsets the param (`setParam(p, null)`). */
  remove(): void;
}

/** An insert row that is a param (`lpf 3k`). */
export function paramInsertMenuEntries(state: ParamInsertMenuState, commands: ParamInsertMenuCommands): MenuEntryInput[] {
  return [
    {
      id: "editValue",
      label: "Edit value",
      disabled: !state.editable,
      title: state.editable ? undefined : "Driven by a pattern or modifier; edit it in the Inspector or the code",
      onSelect: commands.editValue,
    },
    { id: "showInInspector", label: "Show in Inspector", onSelect: commands.showInInspector },
    MENU_SEPARATOR,
    {
      id: "remove",
      label: "Remove",
      destructive: true,
      disabled: !state.hasValue,
      title: state.hasValue ? undefined : "Driven by a modifier; remove the modifier instead",
      onSelect: commands.remove,
    },
  ];
}

export interface BusMenuState {
  orbit: number;
  members: readonly { id: string; name: string }[];
  /** Every member is muted (and there is at least one). */
  allMuted: boolean;
  /** Exactly the members are soloed (and there is at least one). */
  soloed: boolean;
  /** At least one of roomsize / delaytime / delayfeedback is set on the bus. */
  hasEffects: boolean;
}

export interface BusMenuCommands {
  setMute(mute: boolean): void;
  /** Solo exactly the members, or clear every solo when they already are. One undo step. */
  setSolo(solo: boolean): void;
  selectTrack(trackId: string): void;
  resetEffects(): void;
}

/** One bus (orbit) strip. */
export function busMenuEntries(state: BusMenuState, commands: BusMenuCommands): MenuEntryInput[] {
  const empty = state.members.length === 0;
  return [
    { id: "mute", label: "Mute bus", checked: state.allMuted, disabled: empty, onSelect: () => commands.setMute(!state.allMuted) },
    { id: "solo", label: "Solo bus", checked: state.soloed, disabled: empty, onSelect: () => commands.setSolo(!state.soloed) },
    {
      type: "submenu",
      id: "selectTrack",
      label: "Select track",
      items: state.members.map((t) => ({ id: t.id, label: t.name, onSelect: () => commands.selectTrack(t.id) })),
    },
    MENU_SEPARATOR,
    {
      id: "resetEffects",
      label: "Reset bus effects",
      disabled: !state.hasEffects,
      title: state.hasEffects ? "Clears room size, delay time and feedback" : "Already at their defaults",
      onSelect: commands.resetEffects,
    },
  ];
}

export interface MasterMenuState {
  limiter: boolean;
  /** The output level is not at its default. */
  levelChanged: boolean;
}

export interface MasterMenuCommands {
  setLimiter(limiter: boolean): void;
  resetLevel(): void;
}

/** The master strip. */
export function masterMenuEntries(state: MasterMenuState, commands: MasterMenuCommands): MenuEntryInput[] {
  return [
    { id: "limiter", label: "Limiter", checked: state.limiter, onSelect: () => commands.setLimiter(!state.limiter) },
    { id: "resetLevel", label: "Reset output level", disabled: !state.levelChanged, onSelect: commands.resetLevel },
  ];
}
