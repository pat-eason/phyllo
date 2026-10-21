import type { Project, Section, TransportPosition } from "./types";

const EPS = 1e-9;

/**
 * Cycle (0-based float, one cycle = one bar) → `bar.beat.16th`, all 1-based; each beat has four sixteenths.
 * `positionFromCycle(12.25, 4)` → bar 13, beat 2, sixteenth 1 (`13.2.1`).
 */
export function positionFromCycle(cycle: number, beatsPerBar: number): TransportPosition {
  const c = Number.isFinite(cycle) && cycle > 0 ? cycle : 0;
  const beats = Math.max(1, Math.round(beatsPerBar));
  const whole = Math.floor(c + EPS);
  const frac = Math.max(0, c - whole);
  const sixteenths = Math.min(beats * 4 - 1, Math.floor(frac * beats * 4 + EPS));
  return {
    bar: whole + 1,
    beat: Math.floor(sixteenths / 4) + 1,
    sixteenth: (sixteenths % 4) + 1,
    cycle: c,
  };
}

/** `13.2.1` */
export function formatPosition(pos: Pick<TransportPosition, "bar" | "beat" | "sixteenth">): string {
  return `${pos.bar}.${pos.beat}.${pos.sixteenth}`;
}

/** Cycles (= bars) per minute: the argument of `setcpm`. 120 BPM in 4/4 → 30. */
export function cyclesPerMinute(bpm: number, beatsPerBar: number): number {
  return bpm / beatsPerBar;
}

/** Cycles (= bars) per second. 120 BPM in 4/4 → 0.5. */
export function cyclesPerSecond(bpm: number, beatsPerBar: number): number {
  return bpm / 60 / beatsPerBar;
}

export function barsToSeconds(bars: number, bpm: number, beatsPerBar: number): number {
  return bars / cyclesPerSecond(bpm, beatsPerBar);
}

/** `m:ss` (`1:04`), or `h:mm:ss` from an hour up. Rounds to the nearest second; invalid/negative → `0:00`. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The section containing 1-based `bar` (a fractional bar counts for its integer part), if any. */
export function sectionAtBar(project: Pick<Project, "sections">, bar: number): Section | undefined {
  const b = Math.floor(bar);
  return project.sections.find((s) => b >= s.startBar && b <= s.endBar);
}

/** Library "Recent": opened within the last `days` days (default 14, SPEC §6.7). `null`/invalid → false. */
export function isRecent(openedIso: string | null | undefined, now: Date | number | string, days = 14): boolean {
  if (!openedIso) return false;
  const opened = Date.parse(openedIso);
  const at = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (Number.isNaN(opened) || Number.isNaN(at)) return false;
  return at - opened <= days * 86_400_000;
}
