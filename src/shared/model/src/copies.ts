import { newId } from "./ids";
import type { Clip, Modifier, Track } from "./types";

/** `Bass` → `Bass copy`, then `Bass copy 2`, `Bass copy 3`… — the first not in `existing`. Copies of copies stay flat. */
export function copyName(name: string, existing: readonly string[]): string {
  const base = `${name.replace(/ copy(?: \d+)?$/, "")} copy`;
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Same length, fresh id; starts at `startBar` (default: where the original starts). */
export function cloneClip(clip: Clip, startBar: number = clip.startBar): Clip {
  return { id: newId("clip_"), startBar, endBar: startBar + (clip.endBar - clip.startBar) };
}

export function cloneModifier(modifier: Modifier): Modifier {
  return { ...structuredClone(modifier), id: newId("mod_") };
}

export interface CloneTrackOptions {
  /** Tracks already in the project, for a unique `… copy` name. */
  existing?: readonly Pick<Track, "name">[];
  /** Use this name instead of `… copy`. */
  name?: string;
}

/** A deep copy with fresh track, clip and modifier ids (Duplicate / Paste track). */
export function cloneTrack(track: Track, opts: CloneTrackOptions = {}): Track {
  const copy = structuredClone(track);
  return {
    ...copy,
    id: newId("trk_"),
    name: opts.name ?? copyName(track.name, (opts.existing ?? []).map((t) => t.name)),
    clips: copy.clips.map((clip) => cloneClip(clip)),
    modifiers: copy.modifiers.map(cloneModifier),
  };
}
