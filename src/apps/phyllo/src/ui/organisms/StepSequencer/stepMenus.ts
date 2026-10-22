import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { clipboardOf } from "../../../hooks/useClipboard";
import type { ClipboardItem } from "../../../state/clipboardStore";
import { STEPS } from "./drumGrid";

/** Right-click menus of the Pattern editor: pure builders, wired to the editor by `StepsView`, `PianoRoll` and `VelocityLane`. */

/** Steps on at every `every`-th position from the first: 2 → 1 0 1 0 …, 4 → 1 0 0 0 …. */
function everyNth(every: number): boolean[] {
  return Array.from({ length: STEPS }, (_, i) => i % every === 0);
}

export interface StepRowMenuInput {
  /** Friendly name of the row, for labels ("Kick"). */
  label: string;
  steps: readonly boolean[];
  /** The step right-clicked (0-based), or null on the row label. */
  step: number | null;
  clipboard: ClipboardItem | null;
  /** Kit rows always show; only other sounds can leave the grid. */
  removable: boolean;
  /** The Pattern tools panel is open, so "Euclid…" has somewhere to go. */
  euclidAvailable: boolean;
}

export interface StepRowMenuCommands {
  preview(): void;
  /** Turn one step on or off (the click). */
  setStep(step: number, on: boolean): void;
  /** Replace the row's steps (fill, clear, paste). */
  setSteps(steps: boolean[]): void;
  /** Rotate the row: -1 = one step earlier, +1 = one step later. */
  shift(by: number): void;
  euclid(): void;
  copy(steps: boolean[]): void;
  remove(): void;
}

/** A drum row (the label, or one of its steps when `step` is set): edit the whole row in one undo step. */
export function stepRowMenuEntries(input: StepRowMenuInput, commands: StepRowMenuCommands): MenuEntryInput[] {
  const { steps, step } = input;
  const empty = !steps.some(Boolean);
  const pasted = clipboardOf(input.clipboard, "steps");
  const fills = [
    { id: "fillAll", label: "Every step", steps: everyNth(1) },
    { id: "fillHalf", label: "Every 2nd step", steps: everyNth(2) },
    { id: "fillQuarter", label: "Every 4th step", steps: everyNth(4) },
  ];
  const on = step === null ? false : (steps[step] ?? false);

  return [
    step !== null && {
      id: "toggleStep",
      label: on ? "Turn step off" : "Turn step on",
      onSelect: () => commands.setStep(step, !on),
    },
    step !== null && MENU_SEPARATOR,
    { id: "preview", label: "Preview sound", onSelect: commands.preview },
    MENU_SEPARATOR,
    {
      type: "submenu",
      id: "fill",
      label: "Fill",
      items: fills.map((fill) => ({ id: fill.id, label: fill.label, onSelect: () => commands.setSteps(fill.steps) })),
    },
    { id: "clear", label: "Clear row", disabled: empty, onSelect: () => commands.setSteps(new Array<boolean>(STEPS).fill(false)) },
    { id: "shiftLeft", label: "Shift left", disabled: empty, onSelect: () => commands.shift(-1) },
    { id: "shiftRight", label: "Shift right", disabled: empty, onSelect: () => commands.shift(1) },
    {
      id: "euclid",
      label: "Euclid…",
      disabled: !input.euclidAvailable,
      title: input.euclidAvailable ? undefined : "Open the Pattern tools to spread hits evenly",
      onSelect: commands.euclid,
    },
    MENU_SEPARATOR,
    { id: "copy", label: "Copy row", onSelect: () => commands.copy(steps.slice()) },
    {
      id: "paste",
      label: "Paste row",
      disabled: !pasted,
      title: pasted ? undefined : "Copy a row first",
      onSelect: () => {
        if (pasted) commands.setSteps(pasted.steps.slice(0, STEPS));
      },
    },
    input.removable && MENU_SEPARATOR,
    input.removable && { id: "remove", label: "Remove row", destructive: true, onSelect: commands.remove },
  ];
}

export interface VelocityMenuCommands {
  reset(): void;
}

/** The velocity lane: put every hit of the selected row back at the default level. */
export function velocityMenuEntries(label: string, canReset: boolean, commands: VelocityMenuCommands): MenuEntryInput[] {
  return [
    {
      id: "resetVelocities",
      label: "Reset velocities",
      disabled: !canReset,
      title: canReset ? `Set every ${label} hit to the default level` : "Every hit is already at the default level",
      onSelect: commands.reset,
    },
  ];
}

export interface PianoCellMenuInput {
  /** Note name of the row ("C4"). */
  noteLabel: string;
  /** The cell holds this note. */
  on: boolean;
  /** Any note on the roll. */
  anyNotes: boolean;
}

export interface PianoCellMenuCommands {
  toggle(): void;
  clearAll(): void;
}

/** A piano-roll cell: place or remove its note (the click), or empty the roll. */
export function pianoCellMenuEntries(input: PianoCellMenuInput, commands: PianoCellMenuCommands): MenuEntryInput[] {
  return [
    { id: "toggleNote", label: input.on ? `Remove note ${input.noteLabel}` : `Add note ${input.noteLabel}`, onSelect: commands.toggle },
    MENU_SEPARATOR,
    { id: "clearAll", label: "Clear all notes", destructive: true, disabled: !input.anyNotes, onSelect: commands.clearAll },
  ];
}
