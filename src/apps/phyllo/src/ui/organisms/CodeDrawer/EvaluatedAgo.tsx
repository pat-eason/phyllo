import { useEffect, useState } from "react";
import { formatEvaluatedAgo } from "../../../state/format";

const TICK_MS = 1000;

/** "evaluated 0.4 s ago", refreshed once a second inside this span only (the drawer doesn't re-render). */
export function EvaluatedAgo({ evaluatedAt }: { evaluatedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // A fresh evaluation can be newer than the last tick; never show a negative age.
  const clock = evaluatedAt !== null ? Math.max(now, evaluatedAt) : now;
  return <span>{formatEvaluatedAgo(evaluatedAt, clock)}</span>;
}
