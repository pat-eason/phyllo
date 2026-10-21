import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Knob } from "../../atoms/Knob";
import styles from "./ParamKnob.module.css";
import type { ParamKnobSpec } from "./paramSpecs";

export interface ParamKnobProps extends Omit<ComponentPropsWithoutRef<"div">, "onChange" | "children"> {
  /** Strudel control name, e.g. `lpf`: the Pro legend and the Guided `.lpf()` caption. */
  param: string;
  /** Mapping and value text, e.g. `PARAM_SPECS.lpf` from `@phyllo/model`. */
  spec: ParamKnobSpec;
  /**
   * Real units (Hz, 0–1, …); `null` / `undefined` = unset (the knob sits at the spec's unset position).
   * A string is a patterned value (`"[.45 .7]*4"`): shown as modulated, with the pattern text as its value.
   */
  value: number | string | null | undefined;
  /** Receives the new value in real units (clamped and rounded by the spec). */
  onChange: (value: number) => void;
  /** Guided: friendly legend, `.code()` caption. Pro: code legend (mono), value caption. */
  mode: "guided" | "pro";
  /** A modifier drives this control: amber ring, value text becomes `modulationText`. */
  modulated?: boolean;
  /**
   * While modulated: keyboard, wheel and double-click changes call this (direction, new value in real units) instead of
   * `onChange`, so the organism can show its "replace the modifier?" confirm. Drags still go through `onChange`.
   * A key press is reported even when it cannot move the knob (at a bound, or onto the value it already has).
   */
  onBlockedChange?: (direction: 1 | -1, value: number) => void;
  /** Shown as the value while modulated, e.g. `~400–1.4k`. */
  modulationText?: string;
  /**
   * Overrides the value text (`aria-valuetext`, and the Pro caption) whatever the spec would format, e.g. `"2 bars"`
   * or an organism's own unit formatting. Wins over `modulationText`.
   */
  valueText?: string;
  /** Overrides the knob's accessible name (default: the legend). Use it to disambiguate ("Kick filter cutoff"). */
  "aria-label"?: string;
  /**
   * Replaces the caption line under the legend (Guided default `.lpf()`, Pro default the value text). Content given here
   * is read by screen readers; the defaults are not, so they never repeat the value.
   */
  caption?: ReactNode;
  /** Ring grows from 12 o'clock. Default: true for `pan`. */
  bipolar?: boolean;
  disabled?: boolean;
  /** ⌥-click / Enter on the knob: the parent opens a typed-value entry. */
  onRequestEdit?: () => void;
  /** Drag started / ended: undo grouping and the "replace the modifier?" confirm for modulated knobs. */
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
}

/**
 * Knob + uppercase cream legend + mono caption for one sound parameter, converting between real units and the
 * knob's 0–1 through `spec`. The ref goes to the focusable knob (`role="slider"`); `className` and other native
 * props go to the column.
 */
export const ParamKnob = forwardRef<HTMLDivElement, ParamKnobProps>(function ParamKnob(
  {
    param,
    spec,
    value,
    onChange,
    mode,
    modulated = false,
    onBlockedChange,
    modulationText,
    valueText: valueTextOverride,
    "aria-label": ariaLabel,
    caption: captionSlot,
    bipolar,
    disabled = false,
    onRequestEdit,
    onChangeStart,
    onChangeEnd,
    className,
    ...rest
  },
  ref,
) {
  const guided = mode === "guided";
  const patterned = typeof value === "string";
  const isModulated = modulated || patterned;
  const numeric = typeof value === "number" ? value : null;

  let valueText: string;
  if (valueTextOverride !== undefined) valueText = valueTextOverride;
  else if (patterned) valueText = value;
  else if (modulated && modulationText) valueText = modulationText;
  else valueText = spec.format(numeric, mode);

  const legend = guided ? spec.guidedLabel : param;
  const caption = captionSlot ?? (guided ? `.${param}()` : valueText);
  const classes = [styles["paramKnob"], className].filter(Boolean).join(" ");

  return (
    <div className={classes} data-mode={mode} data-modulated={isModulated ? "" : undefined} {...rest}>
      <Knob
        ref={ref}
        value={spec.toKnob(numeric)}
        defaultValue={spec.default === null ? spec.knobWhenUnset : spec.toKnob(spec.default)}
        onChange={(position) => {
          const next = spec.fromKnob(position);
          if (next !== numeric) onChange(next);
        }}
        label={ariaLabel ?? legend}
        valueText={valueText}
        modulated={isModulated}
        onBlockedChange={
          onBlockedChange
            ? (direction, position) => onBlockedChange(direction, spec.fromKnob(position))
            : undefined
        }
        bipolar={bipolar ?? param === "pan"}
        disabled={disabled}
        onRequestEdit={onRequestEdit}
        onChangeStart={onChangeStart}
        onChangeEnd={onChangeEnd}
      />
      <span className={styles["legend"]} aria-hidden="true">
        {legend}
      </span>
      {/* Pro's caption repeats aria-valuetext; Guided's `.code()` is extra information worth reading. */}
      <span className={styles["caption"]} aria-hidden={guided || captionSlot !== undefined ? undefined : true}>
        {caption}
      </span>
    </div>
  );
});
