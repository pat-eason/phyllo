import { useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { useContextMenuTrigger } from "../../../hooks";
import { velocityMenuEntries } from "./stepMenus";
import styles from "./StepSequencer.module.css";

export interface VelocityLaneProps {
  /** Selected row label, e.g. "Open hat". */
  label: string;
  /** Row sound, e.g. `oh` (names the per-hit token form). */
  sound: string;
  color: string;
  steps: readonly boolean[];
  /** 0–1 per step; null when the track's `.gain()` can't be shown per step. */
  velocities: readonly number[] | null;
  /** Where the values go: `.gain()` or the hits' own `:gain`. */
  target: "param" | "tokens";
  /** Every change while dragging or on a key press (0–1 per step). */
  onChange: (velocities: number[]) => void;
  /** Some hit isn't at the default level, so "Reset velocities" would change something. */
  canReset: boolean;
  /** Menu "Reset velocities": every hit of the row back to the default level (one undo step). */
  onReset: () => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

const KEY_STEP = 0.05;
const PAGE_STEP = 0.2;
const BEATS = [0, 1, 2, 3];

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Math.round(v * 100) / 100));
}

/** Velocity bars for the selected row's hits: drag across them to draw, or focus one and use the arrow keys. */
export function VelocityLane({ label, sound, color, steps, velocities, target, onChange, canReset, onReset, onGestureStart, onGestureEnd }: VelocityLaneProps) {
  const menu = useContextMenuTrigger(() => ({
    label: `${label} velocity`,
    entries: velocityMenuEntries(label, canReset && velocities !== null, { reset: onReset }),
  }));
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const drawing = useRef(false);

  const [name, n = "0"] = sound.split(":");
  const hint = target === "param" ? ".gain()" : `${name}:${n}:gain`;

  function valueAt(clientX: number, clientY: number): { step: number; value: number } | null {
    for (let i = 0; i < slots.current.length; i++) {
      const el = slots.current[i];
      if (!el || !steps[i]) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && r.height > 0) {
        return { step: i, value: clamp01(1 - (clientY - r.top) / r.height) };
      }
    }
    return null;
  }

  function apply(step: number, value: number) {
    if (!velocities) return;
    if (Math.abs((velocities[step] ?? 0) - value) < 0.005) return;
    const next = velocities.slice();
    next[step] = value;
    onChange(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !velocities) return;
    const hit = valueAt(event.clientX, event.clientY);
    if (!hit) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawing.current = true;
    onGestureStart();
    apply(hit.step, hit.value);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drawing.current) return;
    const hit = valueAt(event.clientX, event.clientY);
    if (hit) apply(hit.step, hit.value);
  }

  function finish() {
    if (!drawing.current) return;
    drawing.current = false;
    onGestureEnd();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, step: number) {
    menu.onKeyDown(event);
    if (event.defaultPrevented) return;
    const v = velocities?.[step] ?? 0;
    let next: number;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        next = v + KEY_STEP;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        next = v - KEY_STEP;
        break;
      case "PageUp":
        next = v + PAGE_STEP;
        break;
      case "PageDown":
        next = v - PAGE_STEP;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    apply(step, clamp01(next));
  }

  return (
    // The bars are the focusable sliders; they open the menu from the keyboard (Shift+F10).
    <div className={styles["velocity"]} onContextMenu={menu.onContextMenu}>
      <div className={styles["velocityLabel"]}>
        <span className={styles["velocityTitle"]}>Velocity</span>
        <span className={styles["velocityHint"]}>
          {label} → <span className={styles["mono"]}>{hint}</span>
        </span>
      </div>
      {velocities ? (
        <div
          className={styles["velocityBars"]}
          style={{ "--row-color": color } as CSSProperties}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        >
          {BEATS.map((beat) => (
            <div key={beat} className={styles["velocityBeat"]}>
              {BEATS.map((s) => {
                const i = beat * 4 + s;
                const on = steps[i] ?? false;
                const v = velocities[i] ?? 0;
                return (
                  <div
                    key={i}
                    ref={(el) => {
                      slots.current[i] = el;
                    }}
                    className={styles["velocitySlot"]}
                  >
                    {on ? (
                      <div
                        role="slider"
                        tabIndex={0}
                        aria-label={`${label} step ${i + 1} velocity`}
                        aria-valuemin={0}
                        aria-valuemax={1}
                        aria-valuenow={Math.min(1, v)}
                        aria-valuetext={`${Math.round(Math.min(1, v) * 100)}%`}
                        aria-orientation="vertical"
                        className={styles["velocityBar"]}
                        style={{ height: `${Math.round(Math.min(1, v) * 100)}%` }}
                        onKeyDown={(e) => handleKeyDown(e, i)}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <p className={styles["velocityNote"]}>
          This track&apos;s <span className={styles["mono"]}>.gain()</span> pattern can&apos;t be drawn per step. Edit it in the Code tab.
        </p>
      )}
      <div className={styles["velocitySpacer"]} aria-hidden="true" />
    </div>
  );
}
