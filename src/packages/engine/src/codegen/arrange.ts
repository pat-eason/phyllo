import type { Clip, Project, Section } from "@phyllo/model";

/** One `[bars, silence|pat]` entry of an `arrange()` call. */
export interface ArrangeEntry {
  bars: number;
  play: boolean;
}

/**
 * How a track's clips render in the Whole-song scope (DECISIONS V5):
 * - `none`: no clips inside the song;
 * - `full`: one clip spanning bars 1..lengthBars → the plain pattern;
 * - otherwise the `arrange()` entries: gaps as `silence`, each clip as its own entry (clip time is
 *   clip-local, so adjacent clips stay separate), padded with trailing silence to exactly `lengthBars`.
 *
 * Clips are sorted, clamped to the song and de-overlapped (a later clip starts after the earlier one ends).
 */
export function arrangeEntries(clips: readonly Clip[], lengthBars: number): "none" | "full" | ArrangeEntry[] {
  const length = Math.max(0, Math.floor(lengthBars));
  const spans = [...clips]
    .map((c) => ({ start: Math.max(1, Math.round(c.startBar)), end: Math.min(length, Math.round(c.endBar)) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const entries: ArrangeEntry[] = [];
  let cursor = 1;
  let played = 0;
  for (const span of spans) {
    const start = Math.max(span.start, cursor);
    if (span.end < start) continue;
    if (start > cursor) entries.push({ bars: start - cursor, play: false });
    entries.push({ bars: span.end - start + 1, play: true });
    played++;
    cursor = span.end + 1;
  }
  if (played === 0) return "none";
  if (played === 1 && entries.length === 1 && cursor === length + 1) return "full";
  if (cursor <= length) entries.push({ bars: length - cursor + 1, play: false });
  return entries;
}

/** The bar range rendered by the code drawer's "This section" scope. */
export interface SectionRange {
  startBar: number;
  endBar: number;
  /** null when no section contains the bar; the range is then the whole song. */
  section: Section | null;
}

/**
 * Section containing `atBar` (default: loop start when the loop is on, else bar 1). When no section
 * contains it, falls back to the whole song so the drawer still shows every playing track.
 */
export function resolveSection(project: Project, atBar?: number): SectionRange {
  const bar = atBar ?? (project.loop.enabled ? project.loop.startBar : 1);
  const section = project.sections.find((s) => s.startBar <= bar && bar <= s.endBar) ?? null;
  if (section) return { startBar: section.startBar, endBar: section.endBar, section };
  return { startBar: 1, endBar: project.lengthBars, section: null };
}

export function clipsOverlap(clips: readonly Clip[], startBar: number, endBar: number): boolean {
  return clips.some((c) => c.startBar <= endBar && c.endBar >= startBar);
}
