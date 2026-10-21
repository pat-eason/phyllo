import { clipViz, quote } from "@phyllo/engine";
import type { Track } from "@phyllo/model";
import type { ClipViz } from "@phyllo/ui";

/** Distinct sound words of a mini-notation pattern (`"bd*4, ~ cp:3"` → `["bd", "cp"]`). */
export function patternSounds(pattern: string): string[] {
  const words = pattern.match(/[A-Za-z_][\w]*(?::\d+)?/g) ?? [];
  return [...new Set(words.map((w) => w.split(":")[0] ?? w))];
}

/**
 * The sound in code form for the TrackHeader (SPEC §6.1 "sound code (mono)"), e.g. `s("bd").bank("RolandTR909")`,
 * `s("sawtooth")`, `s("vox")`. Drum tracks list the pattern's sounds; code tracks show the first line of code.
 */
export function trackSoundCode(track: Track): string {
  const { source } = track;
  switch (track.kind) {
    case "drum": {
      const sounds = patternSounds(track.pattern).join(" ");
      return `s(${quote(sounds || "~")})${source.bank ? `.bank(${quote(source.bank)})` : ""}`;
    }
    case "sample":
      return `s(${quote(source.sound ?? (patternSounds(track.pattern)[0] || "~"))})`;
    case "code":
      return (track.rawCode ?? "").split("\n")[0]?.trim() || "code";
    case "melodic":
    case "chord":
      if (source.sound) return `s(${quote(source.sound)})`;
      return `s(${quote(patternSounds(track.pattern)[0] ?? "~")})`;
    default: {
      const never: never = track.kind;
      return String(never);
    }
  }
}

/** Bars drawn per clip preview before the Clip molecule repeats the list. */
const MAX_VIZ_CYCLES = 64;

function safeViz(track: Pick<Track, "kind" | "pattern" | "source">, cycle: number): ClipViz {
  try {
    return clipViz(track, cycle);
  } catch {
    // An unparsable pattern draws an empty preview; the engine reports the error on the track.
    return track.kind === "code" ? { kind: "code" } : track.kind === "drum" ? { kind: "drum", ticks: [] } : { kind: "sample" };
  }
}

/**
 * One preview per clip-local bar (`arrange` restarts the pattern at each clip, DECISIONS V5), shared by every
 * clip of the track: the Clip molecule reads entry `i` for its `i`-th bar. Patterns that look the same every bar
 * return a single entry.
 */
export function trackViz(track: Pick<Track, "kind" | "pattern" | "source">, maxBars: number): ClipViz | ClipViz[] {
  const first = safeViz(track, 0);
  if (track.kind === "code" || track.kind === "sample") return first;
  // Without alternation, slowdown or randomness every cycle is the same.
  if (!/[<>/?|]|\{|degrade|rand/.test(track.pattern)) return first;
  const count = Math.max(1, Math.min(MAX_VIZ_CYCLES, maxBars));
  const out: ClipViz[] = [first];
  for (let c = 1; c < count; c++) out.push(safeViz(track, c));
  return out;
}
