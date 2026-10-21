/**
 * Mini-notation cheat sheet shown in the Pattern editor tools panel (SPEC §6.3).
 */
export interface CheatSheetEntry {
  id: string;
  /** What to type, shown in monospace */
  token: string;
  /** Plain explanation */
  meaning: string;
  /** A small complete pattern that uses it, for "try this" buttons */
  example: string;
}

export const CHEAT_SHEET: readonly CheatSheetEntry[] = [
  { id: "rest", token: "~", meaning: "A rest: stay silent for one step.", example: "bd ~ sd ~" },
  { id: "repeat", token: "bd*4", meaning: "Repeat four times within the step.", example: "bd*4" },
  { id: "group", token: "[a b]", meaning: "Fit both sounds into a single step.", example: "bd [sd sd]" },
  { id: "alternate", token: "<a b>", meaning: "Take turns, playing one per cycle.", example: "<bd sd>" },
  { id: "layer", token: "a, b", meaning: "Play together, as layers.", example: "bd*4, hh*8" },
  { id: "maybe", token: "bd?", meaning: "A 50% chance to play.", example: "hh*8?" },
  { id: "euclid", token: "bd(3,8)", meaning: "Spread 3 hits evenly over 8 steps.", example: "bd(3,8)" },
  { id: "stretch", token: "a@3", meaning: "Stretch over three steps.", example: "bd@3 sd" },
];
