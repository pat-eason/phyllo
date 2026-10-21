/**
 * What ParamKnob needs to know about a Strudel control. Structurally a subset of `@phyllo/model`'s
 * `ParamSpec` (which `@phyllo/ui` can't import), so organisms pass `PARAM_SPECS.lpf` straight in.
 */
export interface ParamKnobSpec {
  /** Guided legend, e.g. "Brightness". */
  guidedLabel: string;
  /** Real value → knob position 0–1; `null` / `undefined` (unset) → the unset position. */
  toKnob(value: number | null | undefined): number;
  /** Knob position 0–1 → real value (clamped and rounded by the spec). */
  fromKnob(position: number): number;
  /** Value text: Pro caption and `aria-valuetext`. */
  format(value: number | string | null | undefined, mode?: "guided" | "pro"): string;
  /** Strudel's default; `null` when the call is simply omitted. Double-click returns here. */
  default: number | null;
  /** Knob position while unset (and the double-click target when `default` is `null`). */
  knobWhenUnset: number;
}
