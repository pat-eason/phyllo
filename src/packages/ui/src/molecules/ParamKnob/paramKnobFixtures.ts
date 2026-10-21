/**
 * Story / test stand-ins for `@phyllo/model`'s `PARAM_SPECS` (same mappings and value text, SPEC §6.1).
 * Not exported from the package: the app passes the real model specs.
 */
import type { ParamKnobSpec } from "./paramSpecs";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
const num = (v: number, d = 2) => String(roundTo(v, d)).replace(/^(-?)0\./, "$1.");
const hz = (v: number) => (Math.round(v) >= 1000 ? `${(Math.round(v) / 1000).toFixed(1)}k Hz` : `${Math.round(v)} Hz`);

function pan(v: number, mode: "guided" | "pro" = "pro") {
  const off = Math.round(Math.abs(v - 0.5) * 200);
  if (off === 0) return mode === "guided" ? "Center" : "C";
  const left = v < 0.5;
  return mode === "guided" ? `${left ? "Left" : "Right"} ${off}` : `${left ? "L" : "R"}${off}`;
}

interface Input {
  guidedLabel: string;
  default: number | null;
  min: number;
  max: number;
  knobWhenUnset: number;
  round: number;
  toKnob: (v: number) => number;
  fromKnob: (p: number) => number;
  text: (v: number, mode: "guided" | "pro") => string;
  unsetText?: string;
}

function spec(i: Input): ParamKnobSpec {
  return {
    guidedLabel: i.guidedLabel,
    default: i.default,
    knobWhenUnset: i.knobWhenUnset,
    toKnob: (v) => (v == null || !Number.isFinite(v) ? i.knobWhenUnset : clamp(i.toKnob(clamp(v, i.min, i.max)), 0, 1)),
    fromKnob: (p) => roundTo(clamp(i.fromKnob(clamp(p, 0, 1)), i.min, i.max), i.round),
    format: (v, mode = "pro") => {
      if (typeof v === "string") return "patterned";
      if (v == null) return i.default === null ? (i.unsetText ?? "off") : i.text(i.default, mode);
      return i.text(v, mode);
    },
  };
}

const lin = { toKnob: (v: number) => v, fromKnob: (p: number) => p };

export const FIXTURE_SPECS = {
  gain: spec({ guidedLabel: "Volume", default: 0.8, min: 0, max: 2, knobWhenUnset: 0.8, round: 3, ...lin, text: (v) => v.toFixed(2) }),
  lpf: spec({
    guidedLabel: "Brightness",
    default: null,
    min: 20,
    max: 20000,
    knobWhenUnset: 1,
    round: 0,
    toKnob: (v) => Math.sqrt(Math.max(0, v - 200) / 7800),
    fromKnob: (p) => 200 + p * p * 7800,
    text: hz,
  }),
  lpq: spec({ guidedLabel: "Resonance", default: null, min: 0, max: 50, knobWhenUnset: 0, round: 1, toKnob: (v) => v / 20, fromKnob: (p) => p * 20, text: (v) => num(v, 1), unsetText: "0" }),
  shape: spec({ guidedLabel: "Grit", default: 0, min: 0, max: 1, knobWhenUnset: 0, round: 2, ...lin, text: (v) => v.toFixed(2) }),
  room: spec({ guidedLabel: "Space", default: 0, min: 0, max: 1, knobWhenUnset: 0, round: 2, ...lin, text: (v) => v.toFixed(2) }),
  roomsize: spec({ guidedLabel: "Room size", default: null, min: 0, max: 10, knobWhenUnset: 0.2, round: 1, toKnob: (v) => v / 10, fromKnob: (p) => p * 10, text: (v) => v.toFixed(1), unsetText: "auto" }),
  delay: spec({ guidedLabel: "Echo", default: 0, min: 0, max: 1, knobWhenUnset: 0, round: 2, ...lin, text: (v) => v.toFixed(2) }),
  pan: spec({ guidedLabel: "Pan", default: 0.5, min: 0, max: 1, knobWhenUnset: 0.5, round: 2, ...lin, text: pan }),
} satisfies Record<string, ParamKnobSpec>;

export type FixtureParam = keyof typeof FIXTURE_SPECS;
