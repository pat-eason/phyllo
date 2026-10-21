/** Display helpers for status text (code drawer header, status bar). Pure; pass the clock in. */

/** Seconds since `evaluatedAt`, or null before the first evaluation. */
export function evaluatedAgoSeconds(evaluatedAt: number | null, nowMs: number): number | null {
  if (evaluatedAt === null) return null;
  return Math.max(0, (nowMs - evaluatedAt) / 1000);
}

/** "evaluated 0.4 s ago" (one decimal under 10 s, whole seconds to a minute, then minutes); "not evaluated yet". */
export function formatEvaluatedAgo(evaluatedAt: number | null, nowMs: number): string {
  const s = evaluatedAgoSeconds(evaluatedAt, nowMs);
  if (s === null) return "not evaluated yet";
  if (s < 10) return `evaluated ${s.toFixed(1)} s ago`;
  if (s < 60) return `evaluated ${Math.floor(s)} s ago`;
  return `evaluated ${Math.floor(s / 60)} min ago`;
}

/** Local wall-clock `12:41` for an epoch-ms timestamp. */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Status bar "Autosaved 12:41", or null when nothing was autosaved this session. */
export function formatAutosaved(autosavedAt: number | null): string | null {
  return autosavedAt === null ? null : `Autosaved ${formatClock(autosavedAt)}`;
}
