import { useEffect, useState } from "react";
import { formatEvaluatedAgo } from "../../../state/format";

const TICK_MS = 1000;

/** "evaluated 3.4 s ago". Owns a 1 s clock so only this span re-renders; the rest of the bar stays put. */
export function EvaluatedAgo({ evaluatedAt }: { evaluatedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return <span>{formatEvaluatedAgo(evaluatedAt, now)}</span>;
}
