import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

const STEP = 16;
const BIG_STEP = 64;

interface Options {
  initial: number;
  min: number;
  max: number;
  /** `1` when dragging right grows the panel (left side panel), `-1` when dragging left grows it (right side panel). */
  direction: 1 | -1;
  /** localStorage key; the width survives restarts. Storage may be unavailable, so it is best effort. */
  storageKey: string;
}

function read(key: string, fallback: number) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Width of a side panel plus props for its separator: drag to resize, ←/→ (⇧ for bigger steps), Home/End for
 * min/max, double-click to reset.
 */
export function useResizableWidth({ initial, min, max, direction, storageKey }: Options) {
  const clamp = (w: number) => Math.round(Math.min(max, Math.max(min, w)));
  const [width, setWidthState] = useState(() => clamp(read(storageKey, initial)));
  const drag = useRef<{ x: number; width: number } | null>(null);

  const setWidth = (next: number) => {
    const value = clamp(next);
    setWidthState(value);
    try {
      window.localStorage.setItem(storageKey, String(value));
    } catch {
      /* not persisted */
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { x: event.clientX, width };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setWidth(start.width + direction * (event.clientX - start.x));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    switch (event.key) {
      case "ArrowRight":
        setWidth(width + direction * step);
        break;
      case "ArrowLeft":
        setWidth(width - direction * step);
        break;
      case "Home":
        setWidth(min);
        break;
      case "End":
        setWidth(max);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return {
    width,
    handleProps: {
      role: "separator" as const,
      "aria-orientation": "vertical" as const,
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": width,
      "aria-valuetext": `${width} pixels`,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
      onDoubleClick: () => setWidth(initial),
    },
  };
}
