import { forwardRef, useRef, type ComponentPropsWithoutRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { assignRefs, useVerticalDrag, useWheelSteps } from "../Knob/useVerticalDrag";
import styles from "./Fader.module.css";
import { dbToFaderPos, faderPosToDb, FADER_MAX_DB, FADER_MIN_DB, FADER_SCALE, formatDb } from "./faderScale";

export interface FaderProps extends Omit<ComponentPropsWithoutRef<"div">, "onChange" | "role" | "children"> {
  /** Level in dB, −60 (−∞) … +6. The parent converts to gain (`10^(dB/20)`). */
  db: number;
  /** Called with the new dB value, rounded to 0.1 dB (at most once per frame while dragging). */
  onChange: (db: number) => void;
  /** Accessible name, e.g. "Kick volume". */
  label: string;
  /** Throw (track) height in px. Default 230. The cap overhangs 7 px above and below. */
  height?: number;
  /** Scale marks top to bottom, drawn as labels and spaced evenly. Default `[6, 0, -6, -12, -24, -48]`. */
  scale?: readonly number[];
  /** Double-click resets to this. Default 0 dB. */
  defaultDb?: number;
  disabled?: boolean;
  /** A pointer drag started / ended (undo grouping). */
  onChangeStart?: () => void;
  onChangeEnd?: () => void;
}

const round1 = (db: number) => Math.round(db * 10) / 10;
const clampDb = (db: number) => round1(Math.min(FADER_MAX_DB, Math.max(FADER_MIN_DB, db)));
const markLabel = (db: number) => (db > 0 ? `+${db}` : db < 0 ? `−${-db}` : "0");

const FINE = 0.2;

/**
 * Vertical dB fader, `role="slider"`. Position is piecewise linear between the scale marks
 * (`dbToFaderPos`); dragging to the very bottom reads −∞ (−60).
 *
 * Drag (Shift ×0.2), wheel ±0.5 dB (Shift ±0.1), arrows ±0.5 dB (Shift ±3), PageUp/PageDown ±3,
 * Home +6, End −∞, double-click → `defaultDb`.
 */
export const Fader = forwardRef<HTMLDivElement, FaderProps>(function Fader(
  {
    db,
    onChange,
    label,
    height = 230,
    scale = FADER_SCALE,
    defaultDb = 0,
    disabled = false,
    onChangeStart,
    onChangeEnd,
    className,
    style,
    onKeyDown,
    onDoubleClick,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    ...rest
  },
  forwardedRef,
) {
  const node = useRef<HTMLDivElement | null>(null);
  const value = Number.isFinite(db) ? clampDb(db) : FADER_MIN_DB;
  const pos = dbToFaderPos(value, scale);

  const commit = (next: number) => {
    const clamped = clampDb(next);
    if (clamped !== value) onChange(clamped);
  };

  const drag = useVerticalDrag({
    getValue: () => pos,
    unitsPerPx: -1 / height,
    fineFactor: FINE,
    min: 0,
    max: 1,
    onDrag: (p) => onChange(p >= 1 ? FADER_MIN_DB : clampDb(faderPosToDb(p, scale))),
    onStart: onChangeStart,
    onEnd: onChangeEnd,
    disabled,
  });

  useWheelSteps(node, (notches, fine) => commit(value + notches * (fine ? 0.1 : 0.5)), disabled);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented || disabled) return;
    const step = event.shiftKey ? 3 : 0.5;
    let next: number;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = value + step;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = value - step;
        break;
      case "PageUp":
        next = value + 3;
        break;
      case "PageDown":
        next = value - 3;
        break;
      case "Home":
        next = FADER_MAX_DB;
        break;
      case "End":
        next = FADER_MIN_DB;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    onDoubleClick?.(event);
    if (event.defaultPrevented || disabled) return;
    commit(defaultDb);
  }

  const classes = [styles["fader"], className].filter(Boolean).join(" ");
  const rootStyle = { ...style, "--fader-h": `${height}px`, "--fader-pos": pos.toFixed(4) } as CSSProperties;

  return (
    <div
      ref={(el) => assignRefs(el, node, forwardedRef)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={FADER_MIN_DB}
      aria-valuemax={FADER_MAX_DB}
      aria-valuenow={value}
      aria-valuetext={formatDb(value)}
      aria-orientation="vertical"
      aria-disabled={disabled || undefined}
      className={classes}
      style={rootStyle}
      data-disabled={disabled ? "" : undefined}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
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
      <div className={styles["scale"]} aria-hidden="true">
        {scale.map((mark, i) => (
          <span key={mark} className={styles["mark"]} style={{ "--mark-pos": scale.length > 1 ? i / (scale.length - 1) : 0 } as CSSProperties}>
            {markLabel(mark)}
          </span>
        ))}
      </div>
      <div className={styles["slot"]}>
        <div className={styles["track"]} />
        <div className={styles["cap"]} data-part="cap" />
      </div>
    </div>
  );
});
