import { useEffect, useRef } from "react";
import { usePositionFeed } from "../../../hooks";

/**
 * Moves the playhead line (lanes) and its marker (ruler) with `transform` on every transport frame. Writes to
 * the DOM only: the Timeline never re-renders while playing (design-system §5). No CSS transition, so reduced
 * motion needs nothing extra.
 */
export function usePlayhead(barWidth: number) {
  const { subscribePosition } = usePositionFeed();
  const line = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribePosition((position) => {
        const transform = `translate3d(${(position.cycle * barWidth).toFixed(2)}px, 0, 0)`;
        if (line.current) line.current.style.transform = transform;
        if (marker.current) marker.current.style.transform = transform;
      }),
    [subscribePosition, barWidth],
  );

  return { line, marker };
}
