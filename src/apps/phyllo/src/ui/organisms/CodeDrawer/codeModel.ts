import { resolveSection } from "@phyllo/engine";
import { isAudible } from "@phyllo/model";
import type { CodeScope, EngineError, LineMap, Project, Track } from "@phyllo/model";
import { tokenize } from "./tokenize";
import type { Token } from "./tokenize";

/** One rendered line of the drawer. */
export interface CodeLine {
  /** 1-based */
  number: number;
  text: string;
  tokens: Token[];
  /** Track whose block contains this line. */
  trackId: string | null;
  /** The block is `_$:` (muted, or silenced by another track's solo). */
  muted: boolean;
}

/** The string literal of a track's source call (`s("bd*4")` → `"bd*4"`), editable in place. */
export interface PatternLiteral {
  trackId: string;
  /** 1-based line */
  line: number;
  /** 0-based offset of the opening quote in the line. */
  start: number;
  /** The literal as written, quotes included. */
  text: string;
}

const SOURCE_CALLS = new Set(["s", "note", "n", "chord"]);

/** Tokenized lines with their track and muted state. */
export function describeLines(code: string, lineMap: LineMap): CodeLine[] {
  const texts = code.split("\n");
  const tokens = tokenize(code);
  const owner: (string | null)[] = texts.map(() => null);
  const muted: boolean[] = texts.map(() => false);
  for (const [trackId, range] of Object.entries(lineMap)) {
    const isMuted = (texts[range.start - 1] ?? "").trimStart().startsWith("_$:");
    for (let n = range.start; n <= range.end && n <= texts.length; n += 1) {
      owner[n - 1] = trackId;
      muted[n - 1] = isMuted;
    }
  }
  return texts.map((text, i) => ({
    number: i + 1,
    text,
    tokens: tokens[i] ?? [],
    trackId: owner[i] ?? null,
    muted: muted[i] ?? false,
  }));
}

function parseLiteral(text: string): string | null {
  if (!text.startsWith('"') || !text.endsWith('"') || text.length < 2) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Source-call literals per line, keyed `"<line>:<start>"`. A literal counts when it is the first argument of a
 * source head (`s(`, `note(`, `n(`, `chord(` not preceded by `.`) inside the track's block and equals the
 * track's pattern; `arrange()` blocks repeat the head, so one track can have several. Code tracks have none.
 */
export function findPatternLiterals(lines: readonly CodeLine[], tracks: readonly Track[]): Map<string, PatternLiteral> {
  const byId = new Map(tracks.map((t) => [t.id, t]));
  const found = new Map<string, PatternLiteral>();
  for (const line of lines) {
    const track = line.trackId ? byId.get(line.trackId) : undefined;
    if (!track || track.kind === "code" || track.pattern === "") continue;
    const toks = line.tokens;
    for (let i = 0; i + 2 < toks.length; i += 1) {
      const head = toks[i] as Token;
      const open = toks[i + 1] as Token;
      const literal = toks[i + 2] as Token;
      if (head.type !== "fn" || !SOURCE_CALLS.has(head.text)) continue;
      if (open.type !== "punct" || open.text !== "(" || literal.type !== "string") continue;
      const before = toks[i - 1];
      if (before && before.type === "punct" && before.text.endsWith(".")) continue;
      if (parseLiteral(literal.text) !== track.pattern) continue;
      found.set(`${line.number}:${literal.start}`, {
        trackId: track.id,
        line: line.number,
        start: literal.start,
        text: literal.text,
      });
    }
  }
  return found;
}

/** Tracks that sound somewhere in the song (have a clip, not muted, not silenced by a solo). */
export function audibleTrackCount(tracks: readonly Track[]): number {
  return tracks.filter((t) => t.clips.length > 0 && isAudible(t, tracks)).length;
}

/** Guided summary: "Phyllo writes Strudel as you work — 5 patterns playing". */
export function guidedSummary(tracks: readonly Track[]): string {
  const n = audibleTrackCount(tracks);
  return `Phyllo writes Strudel as you work — ${n} ${n === 1 ? "pattern" : "patterns"} playing`;
}

/** Name of the section the "This section" scope renders, or null when no section contains the bar. */
export function sectionName(project: Project, sectionBar: number): string | null {
  return resolveSection(project, sectionBar).section?.name ?? null;
}

/** "Groove · bars 9–16" (section scope) or "Whole song · bars 1–32". */
export function scopeSummary(project: Project, scope: CodeScope, sectionBar: number): string {
  if (scope === "section") {
    const range = resolveSection(project, sectionBar);
    return `${range.section?.name ?? "Whole song"} · bars ${range.startBar}–${range.endBar}`;
  }
  return `Whole song · bars 1–${project.lengthBars}`;
}

/** Status tail: "no errors", "error on line 5", or "error in Bass". */
export function errorSummary(error: EngineError | undefined, tracks: readonly Track[], location: ErrorLocation | null): string {
  if (!error) return "no errors";
  if (location) return `error on line ${location.line}`;
  const track = error.trackId ? tracks.find((t) => t.id === error.trackId) : undefined;
  return track ? `error in ${track.name}` : "1 error";
}

/** Where an engine error shows in the displayed code. */
export interface ErrorLocation {
  /** 1-based line in the displayed code. */
  line: number;
  /** 1-based column, only when the displayed line is the evaluated one. */
  column?: number;
}

/**
 * Maps an engine error (line/column in the evaluated whole-song program, which has the display code's line
 * layout — DECISIONS V9) onto the displayed code. In section scope the track's block can differ, so the line is
 * moved into the track's block and the column is kept only when the text of that line is identical.
 */
export function locateError(
  error: EngineError | undefined,
  display: { lines: readonly string[]; map: LineMap },
  song: { lines: readonly string[]; map: LineMap },
): ErrorLocation | null {
  if (!error) return null;
  const shown = error.trackId ? display.map[error.trackId] : undefined;
  if (error.line === undefined) return shown ? { line: shown.start } : null;
  const evaluated = song.lines[error.line - 1];
  let line = error.line;
  const songBlock = error.trackId ? song.map[error.trackId] : undefined;
  if (shown && songBlock) {
    line = Math.min(shown.end, shown.start + Math.max(0, error.line - songBlock.start));
  } else if (error.trackId && !shown) {
    return null;
  }
  if (line < 1 || line > display.lines.length) return null;
  const sameText = evaluated !== undefined && display.lines[line - 1] === evaluated;
  return sameText && error.column !== undefined ? { line, column: error.column } : { line };
}

/** Mini-notation parser messages list every expected token; keep the part a person can act on. */
export function friendlyMiniError(message: string): string {
  const found = /but (.+?) found\.?$/.exec(message);
  return found ? `Unexpected ${found[1]} in the pattern` : message;
}

/**
 * The message under the drawer header: "Line 18: …" while the code is visible; with the code hidden a line number
 * means nothing, so it names the track ("Broken: …") and falls back to the line.
 */
export function errorBannerText(
  error: EngineError,
  tracks: readonly Track[],
  location: ErrorLocation | null,
  codeVisible: boolean,
): string {
  const lineLabel = location ? `Line ${location.line}` : null;
  const trackName = error.trackId ? tracks.find((t) => t.id === error.trackId)?.name : undefined;
  const prefix = codeVisible ? (lineLabel ?? trackName) : (trackName ?? lineLabel);
  return prefix ? `${prefix}: ${error.message}` : error.message;
}
