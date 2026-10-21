import { TRACK_COLORS } from "../types";

/**
 * Tag colors for the Library sidebar (SPEC §6.7). Tags use the track palette so they never clash with the UI accent.
 */

export interface TagDef {
  name: string;
  color: string;
}

/** Tags offered out of the box; the starters tag their projects with these. */
export const DEFAULT_TAGS: readonly TagDef[] = [
  { name: "house", color: TRACK_COLORS[0] },
  { name: "ambient", color: TRACK_COLORS[1] },
  { name: "euclid", color: TRACK_COLORS[2] },
  { name: "chiptune", color: TRACK_COLORS[3] },
  { name: "lo-fi", color: TRACK_COLORS[4] },
  { name: "breaks", color: TRACK_COLORS[5] },
  { name: "sketch", color: TRACK_COLORS[6] },
];

/** The colors a tag can take. */
export const TAG_PALETTE: readonly string[] = TRACK_COLORS;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

/** FNV-1a, 32-bit */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Deterministic tag color: default tags keep their color, any other name hashes into the palette.
 * Case and surrounding spaces don't matter (`House ` and `house` agree).
 */
export function tagColor(name: string): string {
  const key = normalize(name);
  const known = DEFAULT_TAGS.find((t) => t.name === key);
  if (known) return known.color;
  return TAG_PALETTE[hash(key) % TAG_PALETTE.length] ?? TRACK_COLORS[0];
}
