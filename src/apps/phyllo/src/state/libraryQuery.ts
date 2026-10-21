import { previewRows, soundTokens } from "@phyllo/engine";
import { isRecent, tagColor } from "@phyllo/model";
import type { GrooveSummary, LibraryCollection, LibrarySort, SourceType, TagInfo, TrackKind } from "@phyllo/model";
import type { LibraryEntry } from "../native/types";

/** SPEC §6.7 "Recent" window. */
export const RECENT_DAYS = 14;
const PREVIEW_ROWS = 3;

const KINDS: readonly TrackKind[] = ["drum", "melodic", "chord", "sample", "code"];
const SOURCE_TYPES: readonly SourceType[] = ["s", "note", "n", "chord"];

/**
 * Punchcard rows (3×16, track colours) for a library entry: one row per track first (so a busy drum track
 * doesn't push the bass out), then extra drum rows while there is room. Muted tracks still show.
 */
export function previewFor(entry: LibraryEntry): GrooveSummary["preview"] {
  const perTrack = entry.summary.tracks.map((t) => {
    const kind = (KINDS as readonly string[]).includes(t.kind) ? (t.kind as TrackKind) : "drum";
    const type = (SOURCE_TYPES as readonly string[]).includes(t.sourceType) ? (t.sourceType as SourceType) : "s";
    const rows = kind === "code" ? [] : previewRows({ kind, pattern: t.pattern, source: { type, sound: null, bank: null } }, PREVIEW_ROWS);
    return { color: t.color, rows };
  });
  const out: GrooveSummary["preview"] = [];
  for (const t of perTrack) {
    const first = t.rows[0];
    if (first && out.length < PREVIEW_ROWS) out.push({ color: t.color, steps: first });
  }
  for (const t of perTrack) {
    for (const steps of t.rows.slice(1)) if (out.length < PREVIEW_ROWS) out.push({ color: t.color, steps });
  }
  return out;
}

/** Sound-ish words of an entry for search: pattern tokens (`bd`, `hh`, `c2`) of the summarised tracks. */
export function soundWords(entry: LibraryEntry): string[] {
  return [...new Set(entry.summary.tracks.flatMap((t) => soundTokens(t.pattern)).map((w) => w.toLowerCase()))];
}

/** `preview` defaults to `previewFor(entry)` (pass a cached one; it only depends on `summary.tracks`). */
export function toGrooveSummary(entry: LibraryEntry, preview: GrooveSummary["preview"] = previewFor(entry)): GrooveSummary {
  const s = entry.summary;
  return {
    id: s.id,
    path: entry.path,
    name: s.name,
    tags: s.tags,
    favorite: s.favorite,
    bpm: s.bpm,
    key: s.key,
    lengthBars: s.lengthBars,
    trackCount: s.trackCount,
    created: s.created,
    modified: s.modified,
    opened: entry.opened,
    preview,
  };
}

/** Tag list with counts over all grooves, sorted by name. */
export function collectTags(grooves: readonly GrooveSummary[]): TagInfo[] {
  const counts = new Map<string, number>();
  for (const g of grooves) for (const tag of new Set(g.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, color: tagColor(name), count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface LibraryFilter {
  collection: LibraryCollection;
  /** AND filter */
  tags: readonly string[];
  text: string;
  sort: LibrarySort;
}

export interface SearchableGroove {
  groove: GrooveSummary;
  /** Lower-cased sound words (see `soundWords`). */
  sounds: readonly string[];
}

export function inCollection(groove: GrooveSummary, collection: LibraryCollection, nowMs: number): boolean {
  if (collection === "favorites") return groove.favorite;
  if (collection === "recent") return isRecent(groove.opened, nowMs, RECENT_DAYS);
  return true;
}

/** Lower-cased searchable fields of a groove: name, each tag, key, BPM (twice) and each sound name. */
function searchFields(item: SearchableGroove): { descriptive: string[]; sounds: string[] } {
  const g = item.groove;
  return {
    descriptive: [g.name, ...g.tags, g.key, String(g.bpm), `${g.bpm} bpm`].map((f) => f.toLowerCase()),
    sounds: item.sounds.map((f) => f.toLowerCase()),
  };
}

const wordsOf = (field: string): string[] => field.split(/[^\p{L}\p{N}#]+/u).filter(Boolean);

/**
 * Case-insensitive match over name, tags, key, BPM and sound names (SPEC §6.7). A groove matches when the whole
 * (trimmed) query is a substring of any single field ("c minor" matches key "C minor", "lo-fi" the tag); otherwise
 * every query word must match the **start of a word** in some field, so "c" doesn't match the "c" inside "sketch".
 * A one-letter word never matches sound names (it would match `cp`, `c2`, ... in nearly every groove).
 */
export function matchesText(item: SearchableGroove, text: string): boolean {
  const query = text.trim().toLowerCase();
  if (query === "") return true;
  const { descriptive, sounds } = searchFields(item);
  if ([...descriptive, ...sounds].some((f) => f.includes(query))) return true;
  const descriptiveStarts = descriptive.flatMap(wordsOf);
  const soundStarts = sounds.flatMap(wordsOf);
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => descriptiveStarts.some((s) => s.startsWith(w)) || (w.length > 1 && soundStarts.some((s) => s.startsWith(w))));
}

const byDateDesc = (a: string, b: string) => (Date.parse(b) || 0) - (Date.parse(a) || 0);

export function sortGrooves(grooves: GrooveSummary[], sort: LibrarySort): GrooveSummary[] {
  const byName = (a: GrooveSummary, b: GrooveSummary) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const sorted = [...grooves];
  switch (sort) {
    case "name":
      return sorted.sort(byName);
    case "created":
      return sorted.sort((a, b) => byDateDesc(a.created, b.created) || byName(a, b));
    case "bpm":
      return sorted.sort((a, b) => a.bpm - b.bpm || byName(a, b));
    case "edited":
    default:
      return sorted.sort((a, b) => byDateDesc(a.modified, b.modified) || byName(a, b));
  }
}

/** collection AND every selected tag AND search text, then sorted (SPEC §6.7). */
export function filterGrooves(items: readonly SearchableGroove[], filter: LibraryFilter, nowMs: number): GrooveSummary[] {
  const tags = filter.tags.map((t) => t.toLowerCase());
  const matched = items
    .filter(
      (item) =>
        inCollection(item.groove, filter.collection, nowMs) &&
        tags.every((t) => item.groove.tags.some((gt) => gt.toLowerCase() === t)) &&
        matchesText(item, filter.text),
    )
    .map((item) => item.groove);
  return sortGrooves(matched, filter.sort);
}
