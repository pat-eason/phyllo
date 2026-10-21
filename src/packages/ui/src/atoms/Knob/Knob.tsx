import {
  forwardRef,
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import styles from "./Knob.module.css";
import { assignRefs, useVerticalDrag, useWheelSteps } from "./useVerticalDrag";

export type KnobSize = 34 | 56;

export interface KnobProps
  extends Omit<ComponentPropsWithoutRef<"div">, "onChange" | "defaultValue" | "role" | "children" | "color"> {
  /** Normalized 0–1. Mapping to real units lives in the parent. */
  value: number;
  /** Called with the new normalized value (continuously while dragging, at most once per frame). */
  onChange: (value: number) => void;
  /** Double-click resets to this. Without it, double-click does nothing. */
  defaultValue?: number;
  /** Accessible name, e.g. "Brightness". The visible legend is drawn by the parent (ParamKnob). */
  label: string;
  /** Spoken value, e.g. "1.6k Hz" → `aria-valuetext`. */
  valueText: string;
  /** 56 inspector (skirt + cap + pointer), 34 mixer sends (flat ring only). Default 56. */
  size?: KnobSize;
  /** A modifier drives this parameter: ring turns amber. Input still works; the parent decides what a drag means. */
  modulated?: boolean;
  /** Ring grows from 12 o'clock (pan). */
  bipolar?: boolean;
  disabled?: boolean;
  /** Ring color override (mixer sends use the track color). Defaults to the accent. */
  color?: string;
  /** ⌥-click or Enter: the parent should open a typed-value entry (it owns the units). */
  onRequestEdit?: () => void;
  /** A pointer drag started / ended (undo grouping, the modulated "replace?" confirm). */
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
}

/** 270° of arc per circle radius: r 21 → 98.96, r 12 → 56.55. */
const arc = (r: number) => 2 * Math.PI * r * 0.75;
const GEOMETRY = {
  56: { c: 28, r: 21, len: arc(21) },
  34: { c: 17, r: 12, len: arc(12) },
} as const;

/** 11 ticks from −135° to +135°, longer at min / center / max. */
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const a = ((-135 + i * 27) * Math.PI) / 180;
  const r2 = i % 5 === 0 ? 27.5 : 26.4;
  const p = (r: number) => `${(28 + r * Math.sin(a)).toFixed(2)} ${(28 - r * Math.cos(a)).toFixed(2)}`;
  return `M${p(24)}L${p(r2)}`;
}).join("");

const round4 = (v: number) => Math.round(v * 10000) / 10000;
const clamp01 = (v: number) => round4(Math.min(1, Math.max(0, v)));

/** Full range per 200 px of vertical drag. */
const PX_PER_RANGE = 200;
const FINE = 0.2;

/**
 * Moog-style rotary control. `role="slider"` over a decorative SVG.
 *
 * Drag vertically (200 px = full range, Shift ×0.2), wheel ±1% (Shift ±0.2%), arrows ±1% (Shift ±10%),
 * PageUp/PageDown ±10%, Home/End, double-click → `defaultValue`, ⌥-click / Enter → `onRequestEdit`.
 */
export const Knob = forwardRef<HTMLDivElement, KnobProps>(function Knob(
  {
    value,
    onChange,
    defaultValue,
    label,
    valueText,
    size = 56,
    modulated = false,
    bipolar = false,
    disabled = false,
    color,
    onRequestEdit,
    onChangeStart,
    onChangeEnd,
    className,
    style,
    onKeyDown,
    onDoubleClick,
    onClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    ...rest
  },
  forwardedRef,
) {
  const node = useRef<HTMLDivElement | null>(null);
  const gradientId = useId();
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

  const commit = (next: number) => {
    const clamped = clamp01(next);
    if (clamped !== v) onChange(clamped);
  };

  const drag = useVerticalDrag({
    getValue: () => v,
    unitsPerPx: 1 / PX_PER_RANGE,
    fineFactor: FINE,
    min: 0,
    max: 1,
    round: round4,
    onDrag: onChange,
    onStart: onChangeStart,
    onEnd: onChangeEnd,
    disabled,
  });

  useWheelSteps(node, (notches, fine) => commit(v + notches * (fine ? 0.002 : 0.01)), disabled);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    const step = event.shiftKey ? 0.1 : 0.01;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = v + step;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = v - step;
        break;
      case "PageUp":
        next = v + 0.1;
        break;
      case "PageDown":
        next = v - 0.1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      case "Enter":
        if (onRequestEdit) {
          event.preventDefault();
          onRequestEdit();
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    onDoubleClick?.(event);
    if (event.defaultPrevented || disabled || defaultValue === undefined) return;
    commit(defaultValue);
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
    if (event.defaultPrevented || disabled || !event.altKey || !onRequestEdit) return;
    event.preventDefault();
    onRequestEdit();
  }

  const g = GEOMETRY[size];
  const ringStart = bipolar ? Math.min(v, 0.5) * g.len : 0;
  const ringLen = bipolar ? Math.abs(v - 0.5) * g.len : v * g.len;
  const classes = [styles["knob"], className].filter(Boolean).join(" ");
  const rootStyle = color ? ({ ...style, "--knob-color": color } as CSSProperties) : style;

  return (
    <div
      ref={(el) => assignRefs(el, node, forwardedRef)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      aria-orientation="vertical"
      className={classes}
      style={rootStyle}
      data-size={size}
      data-modulated={modulated ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        if (!e.defaultPrevented) drag.onPointerDown(e);
      }}
      onPointerMove={(e) => {
        onPointerMove?.(e);
        drag.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        drag.onPointerUp(e);
      }}
      onPointerCancel={(e) => {
        onPointerCancel?.(e);
        drag.onPointerCancel(e);
      }}
      {...rest}
    >
      <svg className={styles["svg"]} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        {size === 56 ? (
          <defs>
            <radialGradient id={`${gradientId}-skirt`} cx="50%" cy="32%" r="70%">
              <stop offset="0%" className={styles["skirtA"]} />
              <stop offset="100%" className={styles["skirtB"]} />
            </radialGradient>
            <linearGradient id={`${gradientId}-cap`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className={styles["capA"]} />
              <stop offset="100%" className={styles["capB"]} />
            </linearGradient>
          </defs>
        ) : null}
        {size === 56 ? <path className={styles["ticks"]} d={TICKS} /> : null}
        <circle
          className={styles["track"]}
          cx={g.c}
          cy={g.c}
          r={g.r}
          strokeDasharray={`${g.len.toFixed(2)} 400`}
          transform={`rotate(135 ${g.c} ${g.c})`}
        />
        <circle
          className={styles["ring"]}
          data-part="ring"
          cx={g.c}
          cy={g.c}
          r={g.r}
          strokeDasharray={`${ringLen.toFixed(2)} 400`}
          strokeDashoffset={(-ringStart).toFixed(2)}
          transform={`rotate(135 ${g.c} ${g.c})`}
        />
        {size === 56 ? (
          <>
            <circle className={styles["drop"]} cx="28" cy="30" r="16" />
            <circle cx="28" cy="28" r="16" fill={`url(#${gradientId}-skirt)`} />
            <circle className={styles["cap"]} cx="28" cy="28" r="11" fill={`url(#${gradientId}-cap)`} />
            <g data-part="pointer" transform={`rotate(${(-135 + v * 270).toFixed(1)} 28 28)`}>
              <line className={styles["pointer"]} x1="28" y1="13.5" x2="28" y2="21" />
            </g>
          </>
        ) : null}
      </svg>
    </div>
  );
});
