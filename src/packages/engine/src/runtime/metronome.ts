import { sequence } from "@strudel/core";
import type { Pattern } from "@strudel/core";

/**
 * Superdough orbit reserved for the metronome: its own output bus, so it never shows up as a mixer bus or shares a
 * track's reverb and delay (the song uses 1 and up, previews -1).
 */
export const METRONOME_ORBIT = -2;

export interface MetronomeSettings {
  on: boolean;
  /** Clicks per bar; one bar is one cycle. */
  beatsPerBar: number;
}

/** Short sine blip; the downbeat is an octave higher and a little louder. */
function click(downbeat: boolean): Record<string, number | string> {
  return {
    s: "sine",
    note: downbeat ? 96 : 84,
    gain: downbeat ? 0.5 : 0.35,
    attack: 0.001,
    decay: 0.04,
    sustain: 0,
    release: 0.01,
    orbit: METRONOME_ORBIT,
  };
}

/** One click per beat for a bar of `beatsPerBar` beats (clamped to 1–16), as one cycle. */
export function clickPattern(beatsPerBar: number): Pattern {
  const beats = Math.min(16, Math.max(1, Math.round(beatsPerBar) || 4));
  return sequence(...Array.from({ length: beats }, (_, i) => click(i === 0)));
}
