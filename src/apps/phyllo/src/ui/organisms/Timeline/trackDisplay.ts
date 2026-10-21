import { clipViz, quote } from "@phyllo/engine";
import { PARAM_SPECS } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import type { ClipViz } from "@phyllo/ui";

/** Distinct sound words of a mini-notation pattern (`"bd*4, ~ cp:3"` → `["bd", "cp"]`). */
export function patternSounds(pattern: string): string[] {
  const words = pattern.match(/[A-Za-z_][\w]*(?::\d+)?/g) ?? [];
  return [...new Set(words.map((w) => w.split(":")[0] ?? w))];
}

/** Enabled modifiers appended to the TrackHeader's sound line; the header truncates whatever doesn't fit. */
const SOUND_LINE_MODIFIERS = 2;

/** `.lpf(sine…)` drives a knob (shown there as modulated), so it isn't part of the sound line (mockup 01 Bass). */
function drivesParam(code: string): boolean {
  const name = /^\s*\.(\w+)\(/.exec(code)?.[1];
  return name !== undefined && Object.hasOwn(PARAM_SPECS, name);
}

/**
 * The sound in code form for the TrackHeader (SPEC §6.1 "sound code (mono)"): the source call plus the track's
 * first enabled modifiers, e.g. `s("bd").bank("RolandTR909")`, `s("sawtooth")`, `s("vox").chop(8)` (mockup 01).
 * Drum tracks list the pattern's sounds; code tracks show the first line of code.
 */
export function trackSoundCode(track: Track): string {
  if (track.kind === "code") return sourceCode(track);
  const modifiers = track.modifiers
    .filter((m) => m.enabled && !drivesParam(m.code))
    .slice(0, SOUND_LINE_MODIFIERS)
    .map((m) => m.code.replace(/\s*\n\s*/g, "").trim())
    .join("");
  return sourceCode(track) + modifiers;
}

function sourceCode(track: Track): string {
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

/** Bar a compressed onset falls in (tolerates float error at bar starts). */
const barOf = (t: number, count: number) => Math.min(count - 1, Math.max(0, Math.floor(t * count + 1e-9)));

/**
 * `count` bars of a melodic/chord track with pitch heights normalised across all of them rather than per bar
 * (`<c2 eb2 g2 bb1>*2` shows four heights; different chords sit at different heights). `clipViz` normalises
 * within the one cycle it draws, so the pattern is compressed into one cycle (`[p]*count` queries the same time
 * span, randomness included) and the result is split back into bars. Null when nothing could be drawn.
 */
function sharedPitchViz(track: Pick<Track, "kind" | "pattern" | "source">, count: number): ClipViz[] | null {
  const whole = safeViz({ ...track, pattern: `[${track.pattern}]*${count}` }, 0);
  const local = (t: number, d: number, bar: number) => {
    const start = Math.max(0, t * count - bar);
    return { t: start, d: Math.max(0, Math.min(d * count, 1 - start)) };
  };
  if (whole.kind === "melodic" && whole.notes.length > 0) {
    const bars = Array.from({ length: count }, (): { t: number; d: number; pitch: number }[] => []);
    for (const n of whole.notes) {
      const bar = barOf(n.t, count);
      bars[bar]?.push({ ...local(n.t, n.d, bar), pitch: n.pitch });
    }
    return bars.map((notes): ClipViz => ({ kind: "melodic", notes }));
  }
  if (whole.kind === "chord" && whole.chords.length > 0) {
    const bars = Array.from({ length: count }, (): { t: number; d: number; pitches: number[] }[] => []);
    for (const c of whole.chords) {
      const bar = barOf(c.t, count);
      bars[bar]?.push({ ...local(c.t, c.d, bar), pitches: c.pitches });
    }
    return bars.map((chords): ClipViz => ({ kind: "chord", chords }));
  }
  return null;
}

/**
 * One preview per clip-local bar (`arrange` restarts the pattern at each clip, DECISIONS V5), shared by every
 * clip of the track: the Clip molecule reads entry `i` for its `i`-th bar. Patterns that look the same every bar
 * return a single entry. Melodic and chord heights share one pitch scale across all the bars.
 */
export function trackViz(track: Pick<Track, "kind" | "pattern" | "source">, maxBars: number): ClipViz | ClipViz[] {
  const first = safeViz(track, 0);
  if (track.kind === "code" || track.kind === "sample") return first;
  // Without alternation, slowdown or randomness every cycle is the same.
  if (!/[<>/?|]|\{|degrade|rand/.test(track.pattern)) return first;
  const count = Math.max(1, Math.min(MAX_VIZ_CYCLES, maxBars));
  if (track.kind === "melodic" || track.kind === "chord") {
    const shared = sharedPitchViz(track, count);
    if (shared) return shared;
  }
  const out: ClipViz[] = [first];
  for (let c = 1; c < count; c++) out.push(safeViz(track, c));
  return out;
}
