import type { GrooveSummary } from "@phyllo/model";

export const MAX_RECENT = 5;

/** `/Users/ada/Music/Phyllo/a.phyllo` → `~/Music/Phyllo/a.phyllo` (macOS, Linux and Windows home folders). */
export function abbreviateHome(path: string): string {
  return path.replace(/^(?:\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)(?=[\\/]|$)/, "~");
}

function lastTouched(groove: GrooveSummary): number {
  const ms = Date.parse(groove.opened ?? groove.modified);
  return Number.isNaN(ms) ? 0 : ms;
}

/** When a project was last opened (or saved, if never opened). */
export function lastTouchedMs(groove: GrooveSummary): number {
  return lastTouched(groove);
}

/** Newest opened-or-modified first, at most five. */
export function recentGrooves(grooves: readonly GrooveSummary[]): GrooveSummary[] {
  return [...grooves].sort((a, b) => lastTouched(b) - lastTouched(a)).slice(0, MAX_RECENT);
}

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** "Today", "Yesterday", a weekday within the last week ("Mon"), else "Oct 12" (with the year when it differs). */
export function formatWhen(ms: number, nowMs: number): string {
  const days = Math.round((startOfDay(nowMs) - startOfDay(ms)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const date = new Date(ms);
  if (days < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
