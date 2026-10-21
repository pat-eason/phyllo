/** Scale marks, top to bottom (SPEC §6.4). They sit at equal spacing: +6 → 0, 0 → 0.2, … −48 → 1. */
export const FADER_SCALE: readonly number[] = [6, 0, -6, -12, -24, -48];
/** "−∞": the bottom of the throw and the lowest value a fader reports. */
export const FADER_MIN_DB = -60;
export const FADER_MAX_DB = 6;

/**
 * dB → cap position, 0 (top) … 1 (bottom), piecewise linear between equally spaced `scale` marks.
 * Above the first mark pins to 0; below the last mark (down to −∞) pins to 1.
 */
export function dbToFaderPos(db: number, scale: readonly number[] = FADER_SCALE): number {
  const last = scale.length - 1;
  if (last < 1) return 0;
  if (Number.isNaN(db)) return 1;
  if (db >= (scale[0] ?? 0)) return 0;
  for (let i = 0; i < last; i++) {
    const hi = scale[i] ?? 0;
    const lo = scale[i + 1] ?? 0;
    if (db <= hi && db >= lo) return (i + (hi - db) / (hi - lo)) / last;
  }
  return 1;
}

/** Inverse of `dbToFaderPos` for positions 0…1 (returns the last mark at 1; the Fader maps a full-bottom drag to −∞ itself). */
export function faderPosToDb(pos: number, scale: readonly number[] = FADER_SCALE): number {
  const last = scale.length - 1;
  if (last < 1) return scale[0] ?? 0;
  const p = Math.min(1, Math.max(0, pos)) * last;
  const i = Math.min(last - 1, Math.floor(p));
  const hi = scale[i] ?? 0;
  const lo = scale[i + 1] ?? 0;
  return hi - (p - i) * (hi - lo);
}

/** `−2.2 dB`, `+3.0 dB`, `0.0 dB`, `−∞ dB` (typographic minus). */
export function formatDb(db: number): string {
  if (db <= FADER_MIN_DB) return "−∞ dB";
  const rounded = Math.round(db * 10) / 10;
  if (rounded === 0) return "0.0 dB";
  return `${rounded < 0 ? "−" : "+"}${Math.abs(rounded).toFixed(1)} dB`;
}

/** Linear gain → dB (`20·log10`), floored at −∞ (−60). */
export function gainToDb(gain: number): number {
  return gain > 0 ? Math.max(FADER_MIN_DB, 20 * Math.log10(gain)) : FADER_MIN_DB;
}

/** dB → linear gain (`10^(dB/20)`); −∞ (−60 or below) → 0. */
export function dbToGain(db: number): number {
  return db <= FADER_MIN_DB ? 0 : 10 ** (db / 20);
}
