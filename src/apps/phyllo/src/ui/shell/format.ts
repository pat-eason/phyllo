/** "Oct 21, 12:41:00 PM" (locale format) for a snapshot's ISO time; the raw string when it isn't a date. */
export function formatSnapshotTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
