import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { acceleratorFor } from "../../shell/shortcuts";

export const TEMPO_PRESETS = [90, 100, 110, 120, 128, 140] as const;
export const DEFAULT_BPM = 120;
export const BEATS_PER_BAR_CHOICES = [3, 4, 5, 6, 7] as const;
/** Root spellings offered in the Key menu, chromatic from C. */
export const KEY_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const KEY_MODES = ["major", "minor"] as const;
type KeyMode = (typeof KEY_MODES)[number];

const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class (0–11) of a root such as "F#", "Bb" or "B♭", or null when it isn't a note name. */
function pitchClass(root: string): number | null {
  const base = SEMITONES[root.charAt(0).toUpperCase()];
  if (base === undefined) return null;
  let shift = 0;
  for (const accidental of root.slice(1)) {
    if (accidental === "#" || accidental === "♯") shift += 1;
    else if (accidental === "b" || accidental === "♭") shift -= 1;
    else return null;
  }
  return (((base + shift) % 12) + 12) % 12;
}

/** Pitch class and lower-cased mode of a key such as "C minor" or "B♭ major", or null when it isn't "<note> <mode>". */
function parseKey(key: string): { pitchClass: number; mode: string } | null {
  const [root, mode, ...rest] = key.trim().split(/\s+/);
  if (!root || !mode || rest.length > 0) return null;
  const pc = pitchClass(root);
  return pc === null ? null : { pitchClass: pc, mode: mode.toLowerCase() };
}

export interface BpmMenuCommands {
  tapTempo(): void;
  setBpm(bpm: number): void;
}

/** Right-click menu of the BPM cell. */
export function bpmMenuEntries(bpm: number, commands: BpmMenuCommands): MenuEntryInput[] {
  return [
    { id: "tap", label: "Tap tempo", onSelect: commands.tapTempo },
    {
      type: "submenu",
      id: "tempo",
      label: "Tempo",
      items: TEMPO_PRESETS.map((preset) => ({
        id: `bpm-${preset}`,
        label: `${preset} BPM`,
        checked: preset === bpm,
        onSelect: () => commands.setBpm(preset),
      })),
    },
    MENU_SEPARATOR,
    { id: "reset", label: `Reset to ${DEFAULT_BPM}`, disabled: bpm === DEFAULT_BPM, onSelect: () => commands.setBpm(DEFAULT_BPM) },
  ];
}

export interface KeyMenuCommands {
  setKey(key: string): void;
  setBeatsPerBar(beatsPerBar: number): void;
}

/** Right-click menu of the key / time signature cell ("KEY · 4/4"). */
export function keyMenuEntries(key: string, beatsPerBar: number, commands: KeyMenuCommands): MenuEntryInput[] {
  const current = parseKey(key);
  const modeSubmenu = (mode: KeyMode): MenuEntryInput => ({
    type: "submenu",
    id: mode,
    label: mode === "major" ? "Major" : "Minor",
    items: KEY_ROOTS.map((root) => ({
      id: `${root}-${mode}`,
      label: `${root} ${mode}`,
      checked: current !== null && current.mode === mode && current.pitchClass === pitchClass(root),
      onSelect: () => commands.setKey(`${root} ${mode}`),
    })),
  });
  return [
    { type: "submenu", id: "key", label: "Key", items: KEY_MODES.map(modeSubmenu) },
    {
      type: "submenu",
      id: "beats",
      label: "Beats per bar",
      items: BEATS_PER_BAR_CHOICES.map((beats) => ({
        id: `beats-${beats}`,
        label: String(beats),
        checked: beats === beatsPerBar,
        onSelect: () => commands.setBeatsPerBar(beats),
      })),
    },
  ];
}

export interface PositionMenuCommands {
  toStart(): void;
  toggleLoop(): void;
}

/** Right-click menu of the position cell. */
export function positionMenuEntries(loopEnabled: boolean, commands: PositionMenuCommands): MenuEntryInput[] {
  return [
    { id: "toStart", label: "Go to start", accelerator: acceleratorFor("transport.backToStart"), onSelect: commands.toStart },
    { id: "loop", label: "Loop", checked: loopEnabled, accelerator: acceleratorFor("transport.loop"), onSelect: commands.toggleLoop },
  ];
}
