import { tagColor } from "@phyllo/model";
import type { GrooveSummary } from "@phyllo/model";
import type { GrooveCardData } from "@phyllo/ui";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Relative "edited" label: "Today, 12:41", "Yesterday", a weekday within the last week ("Mon"), then "Oct 12"
 * (with the year when it isn't this year). Unparseable dates give an empty label.
 */
export function formatEdited(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days === 0) {
    const hh = String(at.getHours()).padStart(2, "0");
    const mm = String(at.getMinutes()).padStart(2, "0");
    return `Today, ${hh}:${mm}`;
  }
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return WEEKDAYS[at.getDay()] ?? "";
  const date = `${MONTHS[at.getMonth()] ?? ""} ${at.getDate()}`;
  return at.getFullYear() === now.getFullYear() ? date : `${date}, ${at.getFullYear()}`;
}

/** `GrooveSummary` (state layer) to the card's display data. */
export function toCardData(groove: GrooveSummary, now: Date): GrooveCardData {
  return {
    name: groove.name,
    bpm: groove.bpm,
    key: groove.key,
    lengthBars: groove.lengthBars,
    trackCount: groove.trackCount,
    tags: groove.tags.map((tag) => ({ label: tag, color: tagColor(tag) })),
    favorite: groove.favorite,
    editedLabel: formatEdited(groove.modified, now),
    preview: groove.preview,
  };
}

export function grooveCount(count: number): string {
  return `${count} ${count === 1 ? "groove" : "grooves"}`;
}
