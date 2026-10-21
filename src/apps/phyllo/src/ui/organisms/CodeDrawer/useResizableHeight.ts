import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

export const MIN_CODE_HEIGHT = 84;
export const MAX_CODE_HEIGHT = 640;
const STEP = 16;
const BIG_STEP = 64;

const clamp = (h: number) => Math.round(Math.min(MAX_CODE_HEIGHT, Math.max(MIN_CODE_HEIGHT, h)));

/**
 * Height of the open code area plus props for its top-edge separator: drag up to grow, ↑/↓ (⇧ for bigger steps),
 * Home/End for min/max. Kept in component state for the session.
 */
export function useResizableHeight(initial: number) {
  const [height, setHeight] = useState(() => clamp(initial));
  const drag = useRef<{ y: number; height: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { y: event.clientY, height };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    setHeight(clamp(start.height + (start.y - event.clientY)));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    let next: number;
    switch (event.key) {
      case "ArrowUp":
        next = height + step;
        break;
      case "ArrowDown":
        next = height - step;
        break;
      case "Home":
        next = MIN_CODE_HEIGHT;
        break;
      case "End":
        next = MAX_CODE_HEIGHT;
        break;
      default:
        return;
    }
    event.preventDefault();
    setHeight(clamp(next));
  };

  return {
    height,
    handleProps: {
      role: "separator" as const,
      "aria-orientation": "horizontal" as const,
      "aria-valuemin": MIN_CODE_HEIGHT,
      "aria-valuemax": MAX_CODE_HEIGHT,
      "aria-valuenow": height,
      "aria-valuetext": `${height} pixels`,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
    },
  };
}
