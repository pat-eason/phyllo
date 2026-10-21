import { useCallback, useEffect, useRef } from "react";

/** Pointer travel (px) below which a press counts as a click, not a drag. */
export const DRAG_THRESHOLD_PX = 3;

export interface DragCallbacks {
  /** Every pointer move: horizontal travel since the press (px) and the event. */
  onMove(dx: number, event: PointerEvent): void;
  /** Release. `moved` is false when the pointer stayed within the click threshold. */
  onEnd(dx: number, moved: boolean, event: PointerEvent): void;
  /** Escape, pointer cancel or unmount: drop the gesture without applying it. */
  onCancel(): void;
}

/**
 * One drag at a time per component: `start(event, callbacks)` from a pointer-down handler listens on `window`
 * until release (so the gesture survives leaving the element) and is torn down on unmount.
 */
export function usePointerDrag(): (event: { clientX: number; pointerId: number }, callbacks: DragCallbacks) => void {
  const active = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      active.current?.();
      active.current = null;
    },
    [],
  );

  return useCallback((origin: { clientX: number; pointerId: number }, callbacks: DragCallbacks) => {
    active.current?.();
    const x0 = origin.clientX;
    let moved = false;
    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      active.current = null;
    };
    const onMove = (event: PointerEvent) => {
      const dx = event.clientX - x0;
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      moved = true;
      callbacks.onMove(dx, event);
    };
    const onUp = (event: PointerEvent) => {
      finish();
      callbacks.onEnd(event.clientX - x0, moved, event);
    };
    const onCancel = () => {
      finish();
      callbacks.onCancel();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    active.current = onCancel;
  }, []);
}
