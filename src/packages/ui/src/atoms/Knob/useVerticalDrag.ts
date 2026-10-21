import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

/** Internal: shared by Knob and Fader. Not exported from the package. */
export interface VerticalDragOptions {
  /** Current value in drag units (read when a drag starts or re-anchors). */
  getValue: () => number;
  /** Change per pixel of *upward* pointer movement (negative to invert). */
  unitsPerPx: number;
  /** Multiplier applied while Shift is held. */
  fineFactor: number;
  min: number;
  max: number;
  /** Rounds an emitted value (e.g. to 0.1 dB). Bounds are applied before rounding. */
  round?: (value: number) => number;
  /** Called at most once per animation frame while dragging, and once more on release if a frame is pending. */
  onDrag: (value: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  disabled?: boolean;
}

interface DragState {
  pointerId: number;
  anchorY: number;
  anchorValue: number;
  fine: boolean;
  current: number;
  emitted: number;
  moved: boolean;
}

/**
 * Vertical relative drag with pointer capture and rAF-throttled emits.
 *
 * Movement is measured from an anchor that resets when Shift toggles (so switching to fine mode
 * doesn't jump) and when the value hits a bound (so reversing direction responds immediately).
 */
export function useVerticalDrag(options: VerticalDragOptions) {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const drag = useRef<DragState | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  function emit() {
    frame.current = null;
    const state = drag.current;
    if (!state || !state.moved || state.current === state.emitted) return;
    state.emitted = state.current;
    optionsRef.current.onDrag(state.current);
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    emit();
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    optionsRef.current.onEnd?.();
  }

  return {
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      const opts = optionsRef.current;
      if (opts.disabled || event.button !== 0 || event.altKey || drag.current) return;
      // Stop text selection; that also stops the default focus, so focus by hand for keyboard follow-up.
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const value = opts.getValue();
      // `emitted` starts as NaN so the first real move always reports, even when it lands on the start position
      // (a fader at −48 dB already sits at the bottom, yet dragging down should still reach −∞).
      drag.current = { pointerId: event.pointerId, anchorY: event.clientY, anchorValue: value, fine: event.shiftKey, current: value, emitted: Number.NaN, moved: false };
      opts.onStart?.();
    },
    onPointerMove(event: ReactPointerEvent<HTMLElement>) {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const opts = optionsRef.current;
      if (event.clientY !== state.anchorY) state.moved = true;
      if (event.shiftKey !== state.fine) {
        state.fine = event.shiftKey;
        state.anchorY = event.clientY;
        state.anchorValue = state.current;
      }
      const raw = state.anchorValue + (state.anchorY - event.clientY) * opts.unitsPerPx * (state.fine ? opts.fineFactor : 1);
      const bounded = Math.min(opts.max, Math.max(opts.min, raw));
      if (bounded !== raw) {
        // Pinned at a bound: re-anchor so the overshoot doesn't have to be dragged back.
        state.anchorY = event.clientY;
        state.anchorValue = bounded;
      }
      state.current = opts.round ? opts.round(bounded) : bounded;
      if (frame.current === null) frame.current = requestAnimationFrame(emit);
    },
    onPointerUp: finish,
    onPointerCancel: finish,
  };
}

/**
 * Non-passive wheel listener (React's `onWheel` is passive, so it can't stop the page scrolling).
 * `handler` gets the number of notches moved upward (positive = up) and whether Shift is held.
 */
export function useWheelSteps(ref: RefObject<HTMLElement | null>, handler: (notches: number, fine: boolean) => void, disabled: boolean) {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node || disabled) return;
    function onWheel(event: WheelEvent) {
      // macOS turns Shift+wheel into horizontal scroll, so fall back to deltaX only while Shift is held.
      const delta = event.deltaY !== 0 ? event.deltaY : event.shiftKey ? event.deltaX : 0;
      if (delta === 0) return;
      event.preventDefault();
      const px = event.deltaMode === 1 ? delta * 33 : event.deltaMode === 2 ? delta * 100 : delta;
      // ~100 px per mouse notch; trackpads send many small deltas, so this stays proportional.
      handlerRef.current(Math.max(-4, Math.min(4, -px / 100)), event.shiftKey);
    }
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [ref, disabled]);
}

/** Assigns one node to an internal ref and a forwarded ref. */
export function assignRefs<T>(node: T | null, internal: { current: T | null }, forwarded: ((instance: T | null) => void) | { current: T | null } | null) {
  internal.current = node;
  if (typeof forwarded === "function") forwarded(node);
  else if (forwarded) forwarded.current = node;
}
