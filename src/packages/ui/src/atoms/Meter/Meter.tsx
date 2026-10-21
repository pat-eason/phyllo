import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
} from "react";
import styles from "./Meter.module.css";
import { createMeterEngine, type MeterConfig } from "./meterEngine";

/** Imperative handle: drive the meter at 30–60 Hz without re-rendering React. */
export interface MeterHandle {
  /** Push a peak level, 0–1 linear (`right` defaults to `left`). Rises instantly, falls at `release` dB/s. */
  set(left: number, right?: number): void;
  /** Drop to 0 immediately (transport stopped). */
  reset(): void;
}

/** Subscription contract (e.g. from `useMeter(trackId)`): call `write` per update, return an unsubscribe. */
export type MeterSubscribe = (write: (left: number, right?: number) => void) => () => void;

export interface MeterProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /**
   * Declarative level, 0–1 linear peak (or `[L, R]`). Fine for static or slow use; for live audio use the
   * ref handle or `subscribe` so React doesn't re-render at meter rate.
   */
  level?: number | readonly [number, number];
  /** Two bars 3 px apart. Defaults to true when `level` is a pair. */
  stereo?: boolean;
  /** Only vertical exists today. */
  orientation?: "vertical";
  /** Bar length in px, or `"fill"` to stretch to the height of its flex-row parent. Default 30. */
  length?: number | "fill";
  /** Bar width in px. Default 5 mono / 6 stereo. */
  thickness?: number;
  /** Peak-hold tick: holds the highest level for 1 s, then falls (proposed in the doc). */
  hold?: boolean;
  /** Fall rate in dB/s. Default 20. `0` disables ballistics (each level shows as-is). */
  release?: number;
  /** Transport stopped: reads 0 and ignores incoming levels. */
  stopped?: boolean;
  /** Alternative to the ref: the meter subscribes on mount and writes each level straight to the DOM. */
  subscribe?: MeterSubscribe;
}

/**
 * Level meter. Decorative (`aria-hidden`).
 *
 * Three ways to drive it, all ending in a direct style write (`--meter-level` on each bar), never a
 * React render: the `level` prop (applied in a layout effect), the ref handle (`ref.current.set(l, r)`),
 * or a `subscribe` prop. Ballistics run on `requestAnimationFrame` only while a bar is falling.
 * The ref is the handle, not the DOM node.
 */
export const Meter = forwardRef<MeterHandle, MeterProps>(function Meter(
  {
    level,
    stereo,
    orientation = "vertical",
    length = 30,
    thickness,
    hold = false,
    release = 20,
    stopped = false,
    subscribe,
    className,
    style,
    ...rest
  },
  ref,
) {
  const isStereo = stereo ?? typeof level === "object";
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  const config = useRef<MeterConfig>({ hold, release, stopped });
  const [engine] = useState(() => createMeterEngine(bars, config));

  useLayoutEffect(() => {
    config.current = { hold, release, stopped };
  });

  useImperativeHandle(ref, () => ({ set: engine.write, reset: engine.reset }), [engine]);

  const left = typeof level === "number" ? level : level?.[0];
  const right = typeof level === "number" ? level : level?.[1];
  useLayoutEffect(() => {
    if (left !== undefined) engine.write(left, right);
  }, [engine, left, right]);

  useLayoutEffect(() => {
    if (stopped) engine.reset();
  }, [engine, stopped]);

  useEffect(() => subscribe?.(engine.write), [engine, subscribe]);

  useEffect(() => engine.dispose, [engine]);

  const classes = [styles["meter"], className].filter(Boolean).join(" ");
  const rootStyle = {
    ...style,
    "--meter-thickness": `${thickness ?? (isStereo ? 6 : 5)}px`,
    "--meter-length": length === "fill" ? undefined : `${length}px`,
  } as CSSProperties;

  return (
    <div aria-hidden="true" className={classes} style={rootStyle} data-orientation={orientation} data-fill={length === "fill" ? "" : undefined} {...rest}>
      {(isStereo ? [0, 1] : [0]).map((i) => (
        <div
          key={i}
          className={styles["bar"]}
          data-part="bar"
          ref={(el) => {
            bars.current[i] = el;
          }}
        >
          <div className={styles["fill"]} />
          {hold ? <div className={styles["peak"]} /> : null}
        </div>
      ))}
    </div>
  );
});
