import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** A lane is `--ph-lane-h` (56) plus its 1 px bottom border. */
export const LANE_ROW_PX = 57;
/** More tracks than this and only the visible lanes (plus overscan) are rendered. */
export const VIRTUALIZE_AFTER = 40;
/** Extra lanes rendered above and below the viewport so a scroll doesn't flash blank rows. */
export const LANE_OVERSCAN = 6;
/** Viewport height assumed until the scroller reports its size (first render, jsdom). */
const FALLBACK_VIEWPORT_PX = 800;

/** Half-open range `[start, end)` of lane indexes to render. */
export interface LaneRange {
  start: number;
  end: number;
}

/** Rows (unclamped, no overscan) the viewport touches. */
interface ViewportRows {
  first: number;
  last: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Rows intersecting the viewport (`scrollTop` .. `scrollTop + viewportPx`) when the lanes start `lanesTop` px down
 * the scroller, below the ruler.
 */
export function viewportRows(scrollTop: number, viewportPx: number, lanesTop: number): ViewportRows {
  return {
    first: Math.floor((scrollTop - lanesTop) / LANE_ROW_PX),
    last: Math.ceil((scrollTop + viewportPx - lanesTop) / LANE_ROW_PX),
  };
}

/** The rows plus overscan, clamped to `[0, count]`. */
export function laneRangeOf({ first, last }: ViewportRows, count: number): LaneRange {
  return { start: clamp(first - LANE_OVERSCAN, 0, count), end: clamp(last + LANE_OVERSCAN, 0, count) };
}

/**
 * Indexes to render, ascending: the visible range plus `keep` (the lane that holds keyboard focus or is being
 * navigated to), so scrolling away never unmounts the focused header.
 */
export function renderedLaneIndexes(range: LaneRange, keep: number | null, count: number): number[] {
  const indexes: number[] = [];
  const hasKeep = keep !== null && keep >= 0 && keep < count && (keep < range.start || keep >= range.end);
  if (hasKeep && keep < range.start) indexes.push(keep);
  for (let i = range.start; i < Math.min(range.end, count); i++) indexes.push(i);
  if (hasKeep && keep >= range.end) indexes.push(keep);
  return indexes;
}

/**
 * The lane range to render while `enabled` (virtualized), kept in step with the scroller's scroll position and
 * height. State changes only when the viewport crosses a lane boundary, so scrolling inside a row costs nothing.
 * The first measurement arrives with the ResizeObserver's initial callback.
 */
export function useLaneRange(
  scroller: RefObject<HTMLElement | null>,
  lanes: RefObject<HTMLElement | null>,
  count: number,
  enabled: boolean,
): LaneRange {
  const [rows, setRows] = useState<ViewportRows>(() => viewportRows(0, FALLBACK_VIEWPORT_PX, 0));

  useEffect(() => {
    const el = scroller.current;
    if (!enabled || !el) return undefined;
    const measure = () => {
      const next = viewportRows(el.scrollTop, el.clientHeight || FALLBACK_VIEWPORT_PX, lanes.current?.offsetTop ?? 0);
      setRows((prev) => (prev.first === next.first && prev.last === next.last ? prev : next));
    };
    let frame = 0;
    const schedule = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    el.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(el);
    return () => {
      el.removeEventListener("scroll", schedule);
      observer?.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [enabled, scroller, lanes]);

  return laneRangeOf(rows, count);
}
