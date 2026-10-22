import type { Modifier } from "@phyllo/model";
import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";

/** Right-click menus of the Inspector, as pure builders (the components wire the commands to the stores). */

export interface KnobMenuState {
  /** The param is set on the track (a number or a pattern): Reset has something to clear. */
  hasValue: boolean;
  /** Enabled modifiers whose code sets this param (they win over the knob). */
  drivers: readonly Modifier[];
}

export interface KnobMenuCommands {
  /** Back to unset (codegen omits the call): the knob's double-click. */
  reset(): void;
  /** Opens the typed-value entry: the knob's ⌥-click / Enter. */
  typeValue(): void;
  /** Switches the driving modifiers off: one undo step. */
  removeModulation(drivers: readonly Modifier[]): void;
}

/**
 * One parameter knob. "Reset to default" is also what clearing the value means here (`setParam(p, null)`), so there is
 * no separate "Clear value". "Remove modulation" switches the driving modifiers off rather than deleting them or asking
 * for a replacement value, so one undo step brings the modulation back.
 */
export function knobMenuEntries(state: KnobMenuState, commands: KnobMenuCommands): MenuEntryInput[] {
  const modulated = state.drivers.length > 0;
  return [
    {
      id: "reset",
      label: "Reset to default",
      disabled: !state.hasValue,
      title: state.hasValue ? undefined : "Already at its default",
      onSelect: commands.reset,
    },
    { id: "typeValue", label: "Type value…", accelerator: "Enter", onSelect: commands.typeValue },
    modulated && MENU_SEPARATOR,
    modulated && {
      id: "removeModulation",
      label: "Remove modulation",
      title: "Switches off the modifiers that drive this knob",
      onSelect: () => commands.removeModulation(state.drivers),
    },
  ];
}

export interface ModifierMenuState {
  modifier: Modifier;
  index: number;
  count: number;
  /** The modifier on the app clipboard, if any. */
  pasted: Modifier | null;
  /** Other tracks that take modifiers (code tracks play verbatim code, so they are left out). */
  otherTracks: readonly { id: string; name: string }[];
}

export interface ModifierMenuCommands {
  setEnabled(enabled: boolean): void;
  edit(): void;
  move(delta: number): void;
  duplicate(): void;
  copy(): void;
  /** Paste below this modifier. */
  paste(): void;
  copyToTrack(trackId: string): void;
  remove(): void;
}

/** One row of the Pro modifier chain. */
export function modifierMenuEntries(state: ModifierMenuState, commands: ModifierMenuCommands): MenuEntryInput[] {
  const { modifier, index, count, pasted, otherTracks } = state;
  return [
    { id: "enabled", label: "Enabled", checked: modifier.enabled, onSelect: () => commands.setEnabled(!modifier.enabled) },
    { id: "edit", label: "Edit code", accelerator: "Enter", onSelect: commands.edit },
    MENU_SEPARATOR,
    { id: "moveUp", label: "Move up", accelerator: "Alt+ArrowUp", disabled: index <= 0, onSelect: () => commands.move(-1) },
    { id: "moveDown", label: "Move down", accelerator: "Alt+ArrowDown", disabled: index >= count - 1, onSelect: () => commands.move(1) },
    { id: "duplicate", label: "Duplicate", onSelect: commands.duplicate },
    MENU_SEPARATOR,
    { id: "copy", label: "Copy modifier", onSelect: commands.copy },
    { id: "paste", label: "Paste modifier below", disabled: !pasted, onSelect: commands.paste },
    {
      type: "submenu",
      id: "copyToTrack",
      label: "Copy to track",
      items: otherTracks.map((track) => ({ id: track.id, label: track.name, onSelect: () => commands.copyToTrack(track.id) })),
    },
    MENU_SEPARATOR,
    { id: "remove", label: "Remove", accelerator: "Delete", destructive: true, onSelect: commands.remove },
  ];
}

export interface ModifierSectionMenuCommands {
  /** Paste at the end of the chain. */
  paste(): void;
  /** Opens the "+" search. */
  add(): void;
}

/** The modifier section's header and empty area. */
export function modifierSectionMenuEntries(pasted: Modifier | null, commands: ModifierSectionMenuCommands): MenuEntryInput[] {
  return [
    { id: "add", label: "Add modifier…", onSelect: commands.add },
    { id: "paste", label: "Paste modifier", disabled: !pasted, onSelect: commands.paste },
  ];
}
