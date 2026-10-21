import { parseExpressionAt } from "acorn";
import type { Bus, GenerateOptions, GeneratedProgram, LineMap, ParamName, Project, Track } from "@phyllo/model";
import { PARAM_ORDER, isAudible } from "@phyllo/model";
import { arrangeEntries, clipsOverlap, resolveSection } from "./arrange";
import type { ArrangeEntry } from "./arrange";
import { formatNumber, formatParamValue, quote } from "./format";
import { isDefaultParam, modulatedControls } from "./params";

/** A block whose one-line form is longer than this breaks before chained calls. */
export const LINE_WIDTH = 88;
/** Continuation lines are indented 5 spaces (mockup `Main.dc.html` code drawer). */
export const CONTINUATION_INDENT = "     ";
/** Extra indent for continuation lines of a pattern inside a wrapped `arrange()` entry. */
const ENTRY_INDENT = `${CONTINUATION_INDENT}    `;

/** A track's pattern expression split at its chained calls, for line wrapping. */
interface Chain {
  /** Source call (`note("…").s("…")`, or a code track's verbatim expression). */
  head: string;
  /** Each modifier / param / bus / orbit call, including its leading dot. */
  calls: string[];
}

const CHAIN_SAFE = new Set(["CallExpression", "MemberExpression", "Identifier", "Literal", "TemplateLiteral", "TaggedTemplateExpression", "ArrayExpression"]);

/** Top-level expression type of a code track's raw code, or null when it doesn't parse on its own. */
function expressionType(code: string): string | null {
  try {
    const node = parseExpressionAt(code, 0, { ecmaVersion: "latest" });
    return code.slice(node.end).trim() === "" ? node.type : null;
  } catch {
    return null;
  }
}

function normalizeModifierCode(code: string): string {
  const c = code.trim();
  return c.startsWith(".") || c.startsWith("?.") ? c : `.${c}`;
}

function sourceHead(track: Track): string {
  const { source } = track;
  const sound = source.sound ? `.s(${quote(source.sound)})` : "";
  switch (track.kind) {
    case "drum":
      return `s(${quote(track.pattern)})${source.bank ? `.bank(${quote(source.bank)})` : ""}`;
    case "chord":
      return `chord(${quote(track.pattern)}).voicing()${sound}`;
    case "sample":
      return `s(${quote(track.pattern || source.sound || "")})`;
    case "melodic":
    default:
      if (source.type === "s") return `s(${quote(track.pattern || source.sound || "")})`;
      return `${source.type === "n" ? "n" : "note"}(${quote(track.pattern)})${sound}`;
  }
}

function busFor(project: Project, orbit: number): Bus | undefined {
  return project.buses.find((b) => b.orbit === orbit);
}

/** True when the track sends to its orbit's reverb (room > 0, static or modulated). */
function usesSend(track: Track, send: "room" | "delay", modulated: ReadonlySet<string>): boolean {
  if (modulated.has(send)) return true;
  const v = track.params[send];
  return v !== undefined && !isDefaultParam(send, v);
}

/**
 * Orbit-shared FX: superdough configures an orbit's reverb/delay from the voices that send to it, so a bus
 * setting is written onto every track of that orbit that uses the send (room/delay > 0, or modulated),
 * unless the track sets the value itself. It takes the param's canonical slot, so the code reads the same
 * whether a value came from the bus or the track.
 */
function busValue(project: Project, track: Track, param: ParamName, modulated: ReadonlySet<string>): number | undefined {
  const send = param === "roomsize" ? "room" : param === "delaytime" || param === "delayfeedback" ? "delay" : null;
  // A modulated orbit (`.orbit("<1 2>")`) hides the static one, so no bus is written onto the track (parse
  // likewise leaves such tracks out of bus inference): this keeps generate → parse a fixed point.
  if (send === null || modulated.has("orbit") || !usesSend(track, send, modulated)) return undefined;
  return busFor(project, track.orbit)?.[param as "roomsize" | "delaytime" | "delayfeedback"];
}

function trackChain(track: Track, project: Project): Chain {
  if (track.kind === "code") return { head: (track.rawCode ?? "").trim() || "silence", calls: [] };
  const modulated = modulatedControls(track);
  const calls: string[] = [];
  for (const m of track.modifiers) {
    if (m.enabled && m.code.trim() !== "") calls.push(normalizeModifierCode(m.code));
  }
  for (const p of PARAM_ORDER) {
    const v = track.params[p] ?? busValue(project, track, p, modulated);
    if (v === undefined || v === null || modulated.has(p) || isDefaultParam(p, v)) continue;
    calls.push(`.${p}(${formatParamValue(v)})`);
  }
  if (track.orbit !== 1 && !modulated.has("orbit")) calls.push(`.orbit(${formatNumber(track.orbit)})`);
  return { head: sourceHead(track), calls };
}

const oneLine = (c: Chain) => c.head + c.calls.join("");

/**
 * Lay out `prefix + chain + suffix`. One line when it fits in LINE_WIDTH; otherwise the head stays on the
 * first line and the chained calls are packed greedily onto continuation lines. Code that already spans
 * several lines (code tracks, multi-line modifiers) keeps its own line breaks.
 */
function packChain(prefix: string, chain: Chain, contIndent: string, suffix: string): string[] {
  const single = prefix + oneLine(chain) + suffix;
  if (single.includes("\n")) return single.split("\n");
  if (single.length <= LINE_WIDTH || chain.calls.length === 0) return [single];
  const lines = [prefix + chain.head];
  let cur = "";
  for (const call of chain.calls) {
    if (cur !== "" && contIndent.length + cur.length + call.length > LINE_WIDTH) {
      lines.push(contIndent + cur);
      cur = "";
    }
    cur += call;
  }
  lines.push(contIndent + cur + suffix);
  return lines;
}

function arrangedBlock(prefix: string, chain: Chain, entries: readonly ArrangeEntry[]): string[] {
  const pat = oneLine(chain);
  const single = `${prefix}arrange(${entries.map((e) => `[${e.bars}, ${e.play ? pat : "silence"}]`).join(", ")})`;
  if (!single.includes("\n") && single.length <= LINE_WIDTH) return [single];
  const lines = [`${prefix}arrange(`];
  entries.forEach((e, i) => {
    const close = i === entries.length - 1 ? "])" : "],";
    const entryPrefix = `${CONTINUATION_INDENT}[${e.bars}, `;
    if (!e.play) lines.push(`${entryPrefix}silence${close}`);
    else lines.push(...packChain(entryPrefix, chain, ENTRY_INDENT, close));
  });
  return lines;
}

/**
 * Model → Strudel program (SPEC §4.1). Pure and deterministic.
 *
 * Layout: `setcpm(bpm/beatsPerBar)`, the prelude verbatim, a blank line, one block per track in project
 * order (a plain `silence` line when no track is included, so the program always ends in an expression),
 * then `all(x => x.postgain(v))` when the master postgain isn't 1 (the limiter is runtime-only).
 * A block is `$: <source><modifiers><params incl. bus FX><.orbit(n)>`; `_$:` when the track isn't audible
 * (mute, or another track is soloed — DECISIONS V3).
 *
 * Scope `song` wraps tracks whose clips don't cover the whole song in `arrange()` (V5); a track without
 * clips is emitted muted with its plain pattern so its code still shows. Scope `section` renders the
 * section at `atBar` (see `resolveSection`): only tracks with a clip in it, unwrapped.
 * `instrument` appends `.analyze("<trackId>")` to each block's last line (same line count, V9).
 */
export function generate(project: Project, options: GenerateOptions): GeneratedProgram {
  const lines: string[] = [`setcpm(${formatNumber(project.tempo.bpm)}/${formatNumber(project.tempo.beatsPerBar)})`];
  for (const entry of project.prelude) lines.push(...entry.split("\n"));

  const range = options.scope === "section" ? resolveSection(project, options.atBar) : null;
  const included = range
    ? project.tracks.filter((t) => clipsOverlap(t.clips, range.startBar, range.endBar))
    : project.tracks;

  const postgain = project.master.postgain;
  lines.push("");
  // A program needs a body expression: one that ends in a declaration (a prelude `const`) otherwise fails
  // to transpile. A bare `silence` plays nothing and parses back to no track.
  if (included.length === 0) lines.push("silence");

  const map: LineMap = {};
  for (const track of included) {
    let chain = trackChain(track, project);
    const entries = range ? "full" : arrangeEntries(track.clips, project.lengthBars);
    const audible = isAudible(track, project.tracks) && entries !== "none";
    const prefix = audible ? "$: " : "_$: ";

    if (track.kind === "code") {
      const type = expressionType(chain.head);
      const wrapped = Array.isArray(entries) ? type === "SequenceExpression" : options.instrument === true && type !== null && !CHAIN_SAFE.has(type);
      if (wrapped) chain = { head: `(${chain.head})`, calls: [] };
    }

    const block = Array.isArray(entries)
      ? arrangedBlock(prefix, chain, entries)
      : packChain(prefix, chain, CONTINUATION_INDENT, "");
    if (options.instrument) block[block.length - 1] += `.analyze(${quote(track.id)})`;

    map[track.id] = { start: lines.length + 1, end: lines.length + block.length };
    lines.push(...block);
  }

  if (postgain !== 1) {
    lines.push("", `all(x => x.postgain(${formatNumber(postgain)}))`);
  }

  return { code: lines.join("\n"), lines: map, scope: options.scope };
}
