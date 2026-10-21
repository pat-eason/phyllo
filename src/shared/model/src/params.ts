import { PARAM_ORDER } from "./types";
import type { ParamName, ParamValue, UiMode } from "./types";

/**
 * Parameter specs: real Strudel ranges/defaults (docs/strudel-verification/REPORT.md, superdough 1.3.0),
 * the knob mapping used by the Inspector (SPEC §6.1) and the value text shown next to each knob.
 */
export interface ParamSpec {
  name: ParamName;
  /**
   * The value Strudel uses (or is equivalent to) when the call is absent. `null` = no Strudel default,
   * the call is simply not emitted (lpf, lpq, hpf, roomsize, delaytime). A param set to its default is
   * removed from the track so codegen omits it (SPEC §4.1).
   */
  default: number | null;
  /** Hard range of the real value (clamped by `track/setParam`). */
  min: number;
  max: number;
  /** `Hz`, `s` or empty. */
  unit: string;
  /** Knob position (0..1) shown while the param is unset. */
  knobWhenUnset: number;
  /** Decimals kept when a value comes from a knob / fader / `track/setParam`. */
  round: number;
  /** Real value → knob position 0..1 (clamped). `null`/`undefined` → `knobWhenUnset`. */
  toKnob(value: number | null | undefined): number;
  /** Knob position 0..1 → real value (clamped to min/max and rounded to `round`). */
  fromKnob(position: number): number;
  /** Value text for the knob / aria-valuetext. Guided differs from Pro only for pan ("Left 16"). */
  format(value: ParamValue | null | undefined, mode?: UiMode): string;
  /** Plain-language knob label for Guided mode ("Volume", "Brightness", …). */
  guidedLabel: string;
  /** Strudel call, e.g. `.gain()`. */
  code: string;
  description: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const clamp01 = (n: number): number => (Number.isFinite(n) ? clamp(n, 0, 1) : 0);

/** Code-style number: `.78`, `1`, `-.5`, `10`. */
export function formatNumber(value: number, decimals = 2): string {
  const s = String(roundTo(value, decimals));
  return s.replace(/^(-?)0\./, "$1.");
}

export function formatHz(hz: number): string {
  const f = Math.round(hz);
  return f >= 1000 ? `${(f / 1000).toFixed(1)}k Hz` : `${f} Hz`;
}

/** Pan 0..1 (0.5 = centre) → `C`, `L16`, `R30`; Guided spells it out. */
export function formatPan(pan: number, mode: UiMode = "pro"): string {
  const off = Math.round(Math.abs(pan - 0.5) * 200);
  if (Math.abs(pan - 0.5) < 0.01 || off === 0) return mode === "guided" ? "Center" : "C";
  const side = pan < 0.5 ? "L" : "R";
  if (mode === "guided") return `${side === "L" ? "Left" : "Right"} ${off}`;
  return `${side}${off}`;
}

interface SpecInput {
  name: ParamName;
  default: number | null;
  min: number;
  max: number;
  unit?: string;
  knobWhenUnset: number;
  round: number;
  toKnob(value: number): number;
  fromKnob(position: number): number;
  text(value: number, mode: UiMode): string;
  unsetText?: string;
  guidedLabel: string;
  description: string;
}

function defineSpec(input: SpecInput): ParamSpec {
  const { min, max } = input;
  return {
    name: input.name,
    default: input.default,
    min,
    max,
    unit: input.unit ?? "",
    knobWhenUnset: input.knobWhenUnset,
    round: input.round,
    toKnob: (value) =>
      value == null || !Number.isFinite(value) ? input.knobWhenUnset : clamp01(input.toKnob(clamp(value, min, max))),
    fromKnob: (position) => roundTo(clamp(input.fromKnob(clamp01(position)), min, max), input.round),
    format: (value, mode = "pro") => {
      if (typeof value === "string") return value.trim() === "" ? formatUnset(input) : "patterned";
      if (value == null || !Number.isFinite(value)) return formatUnset(input);
      return input.text(value, mode);
    },
    guidedLabel: input.guidedLabel,
    code: `.${input.name}()`,
    description: input.description,
  };
}

function formatUnset(input: SpecInput): string {
  if (input.default !== null) return input.text(input.default, "pro");
  return input.unsetText ?? "off";
}

const linear = { toKnob: (v: number) => v, fromKnob: (p: number) => p };

// ── specs ───────────────────────────────────────────────────────────────────

export const PARAM_SPECS: Record<ParamName, ParamSpec> = {
  gain: defineSpec({
    name: "gain",
    default: 0.8,
    min: 0,
    max: 2,
    knobWhenUnset: 0.8,
    round: 3,
    ...linear,
    text: (v) => formatNumber(v, 2),
    guidedLabel: "Volume",
    description: "Level of the track (linear gain; 1 = unity, mixer fader shows dB).",
  }),
  pan: defineSpec({
    name: "pan",
    default: 0.5,
    min: 0,
    max: 1,
    knobWhenUnset: 0.5,
    round: 2,
    ...linear,
    text: (v, mode) => formatPan(v, mode),
    guidedLabel: "Pan",
    description: "Stereo position: 0 hard left, 0.5 centre, 1 hard right.",
  }),
  lpf: defineSpec({
    name: "lpf",
    default: null,
    min: 20,
    max: 20000,
    unit: "Hz",
    knobWhenUnset: 1,
    round: 0,
    toKnob: (hz) => Math.sqrt(Math.max(0, hz - 200) / 7800),
    fromKnob: (p) => 200 + p * p * 7800,
    text: (v) => formatHz(v),
    unsetText: "off",
    guidedLabel: "Brightness",
    description: "Low-pass filter cutoff in Hz; lower is darker.",
  }),
  lpq: defineSpec({
    name: "lpq",
    default: null,
    min: 0,
    max: 50,
    knobWhenUnset: 0,
    round: 1,
    toKnob: (q) => q / 20,
    fromKnob: (p) => p * 20,
    text: (v) => formatNumber(v, 1),
    unsetText: "0",
    guidedLabel: "Resonance",
    description: "Low-pass filter resonance (Q); the knob covers 0–20.",
  }),
  hpf: defineSpec({
    name: "hpf",
    default: null,
    min: 20,
    max: 20000,
    unit: "Hz",
    knobWhenUnset: 0,
    round: 0,
    toKnob: (hz) => Math.log(Math.max(20, hz) / 20) / Math.log(400),
    fromKnob: (p) => 20 * 400 ** p,
    text: (v) => formatHz(v),
    unsetText: "off",
    guidedLabel: "Thinness",
    description: "High-pass filter cutoff in Hz (log knob, 20 Hz–8 kHz); higher removes more low end.",
  }),
  shape: defineSpec({
    name: "shape",
    default: 0,
    min: 0,
    max: 1,
    knobWhenUnset: 0,
    round: 2,
    ...linear,
    text: (v) => formatNumber(v, 2),
    guidedLabel: "Grit",
    description: "Waveshaping distortion amount.",
  }),
  room: defineSpec({
    name: "room",
    default: 0,
    min: 0,
    max: 1,
    knobWhenUnset: 0,
    round: 2,
    ...linear,
    text: (v) => formatNumber(v, 2),
    guidedLabel: "Space",
    description: "Reverb send level (the orbit's reverb is shared by every track on that orbit).",
  }),
  roomsize: defineSpec({
    name: "roomsize",
    default: null,
    min: 0,
    max: 10,
    knobWhenUnset: 0.2,
    round: 1,
    toKnob: (s) => s / 10,
    fromKnob: (p) => p * 10,
    text: (v) => v.toFixed(1),
    unsetText: "auto",
    guidedLabel: "Room size",
    description: "Reverb length in seconds (0–10); shared per orbit.",
  }),
  delay: defineSpec({
    name: "delay",
    default: 0,
    min: 0,
    max: 1,
    knobWhenUnset: 0,
    round: 2,
    ...linear,
    text: (v) => formatNumber(v, 2),
    guidedLabel: "Echo",
    description: "Delay send level (the orbit's delay is shared by every track on that orbit).",
  }),
  delaytime: defineSpec({
    name: "delaytime",
    default: null,
    min: 0,
    max: 1,
    unit: "s",
    knobWhenUnset: 0,
    // 4 decimals so 3/16 of a cycle (.1875) isn't shown/saved as .188
    round: 4,
    ...linear,
    text: (v) => `${formatNumber(v, 4)} s`,
    unsetText: "3/16 cycle",
    guidedLabel: "Echo time",
    description: "Delay time in seconds (Strudel's default is 3/16 of a cycle).",
  }),
  delayfeedback: defineSpec({
    name: "delayfeedback",
    default: 0.5,
    min: 0,
    max: 0.98,
    knobWhenUnset: 0.5 / 0.98,
    round: 2,
    toKnob: (v) => v / 0.98,
    fromKnob: (p) => p * 0.98,
    text: (v) => formatNumber(v, 2),
    guidedLabel: "Echo repeats",
    description: "Delay feedback, 0–0.98 (Strudel clamps at 0.98).",
  }),
};

/** Guided Inspector knobs (3 columns, in visual order). */
export const GUIDED_KNOBS: readonly ParamName[] = ["gain", "lpf", "room", "delay", "pan", "shape"];

/** Pro Inspector knobs (4 columns, in visual order). */
export const PRO_KNOBS: readonly ParamName[] = ["gain", "lpf", "lpq", "shape", "room", "roomsize", "delay", "pan"];

// ── aliases ─────────────────────────────────────────────────────────────────

/** Strudel aliases → canonical name. Canonical names map to themselves. `orbit`/`o` is not a ParamName (see `isOrbitName`). */
export const PARAM_ALIASES: Readonly<Record<string, ParamName>> = {
  ...(Object.fromEntries(PARAM_ORDER.map((p) => [p, p])) as Record<ParamName, ParamName>),
  cutoff: "lpf",
  ctf: "lpf",
  lp: "lpf",
  resonance: "lpq",
  hcutoff: "hpf",
  hp: "hpf",
  size: "roomsize",
  sz: "roomsize",
  rsize: "roomsize",
  delayfb: "delayfeedback",
  dfb: "delayfeedback",
  delayt: "delaytime",
  dt: "delaytime",
};

/** Canonical ParamName for a Strudel control name or alias; `null` if it isn't a modelled param. */
export function canonicalParam(name: string): ParamName | null {
  return Object.hasOwn(PARAM_ALIASES, name) ? (PARAM_ALIASES[name] ?? null) : null;
}

/** `orbit` and its alias `o` are a track field, not a ParamName. */
export function isOrbitName(name: string): boolean {
  return name === "orbit" || name === "o";
}

// ── defaults & coercion ─────────────────────────────────────────────────────

/** True when the param is unset or equal to its Strudel default (so codegen omits it). */
export function isDefault(param: ParamName, value: ParamValue | null | undefined): boolean {
  if (value == null) return true;
  if (typeof value === "string") return false;
  const d = PARAM_SPECS[param].default;
  return d !== null && Math.abs(value - d) < 1e-9;
}

/**
 * Normalise a value headed for `track.params`: numbers are clamped to the spec range and rounded;
 * `null`, `""` and values equal to the default → `null` (remove the key); mini-notation strings are
 * kept trimmed; anything unusable (NaN, ±Infinity) → `undefined` (reject).
 */
export function coerceParamValue(param: ParamName, value: ParamValue | null | undefined): ParamValue | null | undefined {
  if (value == null) return null;
  const spec = PARAM_SPECS[param];
  if (typeof value === "string") {
    const s = value.trim();
    return s === "" ? null : s;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const v = roundTo(clamp(value, spec.min, spec.max), spec.round);
  return isDefault(param, v) ? null : v;
}

// ── gain ↔ dB (mixer fader, SPEC §6.4) ──────────────────────────────────────

/** `dB = 20·log10(gain)`; gain ≤ 0 → −Infinity. */
export function gainToDb(gain: number): number {
  return gain > 0 ? 20 * Math.log10(gain) : Number.NEGATIVE_INFINITY;
}

/** Inverse of `gainToDb`; −Infinity (or NaN) → 0. */
export function dbToGain(db: number): number {
  if (Number.isNaN(db) || db === Number.NEGATIVE_INFINITY) return 0;
  return 10 ** (db / 20);
}

/** `+3.0 dB`, `−6.0 dB`, `−∞ dB`. */
export function formatDb(db: number): string {
  if (db === Number.NEGATIVE_INFINITY || Number.isNaN(db)) return "−∞ dB";
  const r = roundTo(db, 1);
  const sign = r > 0 ? "+" : r < 0 ? "−" : "";
  return `${sign}${Math.abs(r).toFixed(1)} dB`;
}
