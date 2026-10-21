/**
 * The pattern editor's "Live code" bar: the track's source call (`s("…").bank("…")`, `note("…").s("…")`),
 * the same text codegen writes at the start of the track's line (engine/codegen `sourceHead`).
 */
import { quote, validatePattern } from "@phyllo/engine";
import type { Track, TrackSource } from "@phyllo/model";

/** Source call for drum and note-based melodic tracks; null for kinds the bar doesn't edit. */
export function sourceCall(track: Pick<Track, "kind" | "pattern" | "source">): string | null {
  const { source } = track;
  if (track.kind === "drum") return `s(${quote(track.pattern)})${source.bank ? `.bank(${quote(source.bank)})` : ""}`;
  if (track.kind === "melodic" && source.type !== "s") {
    return `${source.type === "n" ? "n" : "note"}(${quote(track.pattern)})${source.sound ? `.s(${quote(source.sound)})` : ""}`;
  }
  return null;
}

export type SourceCallParse =
  | { ok: true; pattern: string; source: Partial<TrackSource> }
  | { ok: false; error: string };

const STRING = String.raw`"((?:[^"\\]|\\.)*)"`;

function unquote(body: string): string {
  try {
    return JSON.parse(`"${body}"`) as string;
  } catch {
    return body;
  }
}

/**
 * Read an edited source call back. The call name must stay the track's (`s` for drums, `note`/`n` for melodic);
 * drums may set `.bank("…")`, melodic tracks `.s("…")`. The pattern must parse and evaluate (`validatePattern`).
 */
export function parseSourceCall(text: string, track: Pick<Track, "kind" | "source">): SourceCallParse {
  const head = track.kind === "drum" ? "s" : track.source.type === "n" ? "n" : "note";
  const tail = track.kind === "drum" ? "bank" : "s";
  const re = new RegExp(String.raw`^\s*${head}\(\s*${STRING}\s*\)(?:\s*\.${tail}\(\s*${STRING}\s*\))?\s*$`);
  const m = re.exec(text);
  if (!m) {
    const example = track.kind === "drum" ? `s("bd*4").bank("RolandTR909")` : `${head}("c3 e3 g3").s("sawtooth")`;
    return { ok: false, error: `Keep the form ${example}. Other calls belong in the code view.` };
  }
  const pattern = unquote(m[1] ?? "");
  const check = validatePattern(pattern, track.source.type);
  if (!check.ok) return { ok: false, error: check.column === undefined ? check.message : `Column ${check.column}: ${check.message}` };
  const value = m[2] === undefined ? null : unquote(m[2]);
  const source: Partial<TrackSource> = track.kind === "drum" ? { bank: value } : { sound: value };
  return { ok: true, pattern, source };
}
