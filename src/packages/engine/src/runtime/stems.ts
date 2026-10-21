/**
 * Stem rendering code rewrite: solo a set of tracks by toggling the `_` mute prefix on each track's
 * `$:` label line (found through the LineMap). Same line count, so the LineMap stays valid. Pure.
 */
import type { GeneratedProgram } from "@phyllo/model";

/** indent, `_` prefix, label (`$`, `S$`, `name`), `_` suffix (Strudel mutes either way), colon. */
const LABEL = /^(\s*)(_?)((?:S?\$)|[A-Za-z](?:\w*[A-Za-z0-9])?)(_?)(\s*:)(?!:)/;

/** Rewrites one label line; returns it unchanged if it has no label. */
export function setLabelMuted(line: string, muted: boolean): string {
  const m = LABEL.exec(line);
  if (!m) return line;
  const [whole, indent = "", , name = "", , colon = ""] = m;
  const label = muted ? `_${name}` : name;
  return `${indent}${label}${colon}${line.slice(whole.length)}`;
}

/** Keeps `keepIds` audible (unmuting them if needed) and mutes every other track in the LineMap. */
export function soloTracks(program: GeneratedProgram, keepIds: readonly string[]): GeneratedProgram {
  const keep = new Set(keepIds);
  const lines = program.code.split("\n");
  for (const [id, range] of Object.entries(program.lines)) {
    for (let ln = range.start; ln <= range.end; ln++) {
      const text = lines[ln - 1];
      if (text === undefined || !LABEL.test(text)) continue;
      lines[ln - 1] = setLabelMuted(text, !keep.has(id));
      break; // one label per track
    }
  }
  return { ...program, code: lines.join("\n") };
}
