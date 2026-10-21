import { useEffect, useRef, useState } from "react";

/** Fader throw when the strip has no room to measure (SPEC §6.4: min 230). */
export const MIN_THROW = 230;
const MAX_THROW = 520;
/** Fader cap overhang (7 px above and below) plus the area's top padding. */
const CHROME = 18;

/**
 * Height for a fader/meter that fills its flex area, so every strip's throw reaches down to the dB readout
 * whatever the window height. Resizes only re-render the one strip.
 */
export function useFillHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(MIN_THROW);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const available = Math.floor((entry?.contentRect.height ?? 0) - CHROME);
      setHeight(Math.max(MIN_THROW, Math.min(MAX_THROW, available)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}
