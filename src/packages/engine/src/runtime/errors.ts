/**
 * Error attribution (DECISIONS V8): turn a Strudel/acorn/runtime error into an `EngineError`
 * that names the offending track via the program's LineMap. Pure.
 */
import { parse } from "acorn";
import type { EngineError, LineMap } from "@phyllo/model";

/** The track whose 1-based inclusive line range contains `line`. */
export function trackAtLine(lines: LineMap, line: number | undefined): string | undefined {
  if (line === undefined) return undefined;
  for (const [id, r] of Object.entries(lines)) {
    if (line >= r.start && line <= r.end) return id;
  }
  return undefined;
}

/** 1-based line of a character offset. */
export function lineAtOffset(code: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, code.length);
  for (let i = 0; i < end; i++) if (code.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * 1-based lines of the top-level labelled statements (`$:`, `_$:`, `name:`) in source order. Each one
 * calls `.p(label)` once when evaluated, which is how the runtime maps evaluated blocks back to lines.
 */
export function labelLines(code: string): number[] {
  try {
    const ast = parse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true, locations: true }) as unknown as {
      body: { type: string; loc?: { start: { line: number } } }[];
    };
    return ast.body.filter((n) => n.type === "LabeledStatement").map((n) => n.loc?.start.line ?? 0);
  } catch {
    return [];
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** First line containing `needle` as a whole word / call; 1-based. */
export function findIdentifierLine(code: string, name: string, asMethod: boolean): number | undefined {
  const re = asMethod ? new RegExp(`\\.\\s*${escapeRe(name)}\\b`) : new RegExp(`(^|[^\\w$.])${escapeRe(name)}\\b`);
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? "";
    const withoutComment = text.replace(/\/\/.*$/, "");
    if (re.test(withoutComment)) return i + 1;
  }
  return undefined;
}

/** Name an error message points at: `foo is not defined`, `….bar is not a function`. */
export function identifierFromMessage(message: string): { name: string; asMethod: boolean } | undefined {
  const notDefined = /^(?:ReferenceError: )?([A-Za-z_$][\w$]*) is not defined/.exec(message);
  if (notDefined?.[1]) return { name: notDefined[1], asMethod: false };
  const notFn = /(?:\.|^)([A-Za-z_$][\w$]*) is not a function/.exec(message);
  if (notFn?.[1]) return { name: notFn[1], asMethod: /\.[A-Za-z_$][\w$]* is not a function/.test(message) };
  return undefined;
}

export interface AttributionContext {
  code: string;
  lines: LineMap;
  /** Number of `.p()` blocks that finished evaluating before the error (runtime errors only). */
  evaluatedBlocks?: number;
}

/** Strips Strudel's log prefixes and the acorn `(line:col)` suffix. */
function cleanMessage(message: string): string {
  return message.replace(/^\[(?:eval|mini|query)\] (?:error: )?/, "").trim();
}

/** Attributes an evaluation error (`onEvalError`): acorn syntax, mini-notation parse, or runtime. */
export function attributeEvalError(err: unknown, ctx: AttributionContext): EngineError {
  const message = err instanceof Error ? err.message : String(err);
  const loc = (err as { loc?: { line?: unknown; column?: unknown } } | null)?.loc;

  // acorn SyntaxError: `.loc {line, column}` (column 0-based) against the original code.
  if (loc && typeof loc.line === "number") {
    const column = typeof loc.column === "number" ? loc.column + 1 : undefined;
    return withTrack({ kind: "eval", message: message.replace(/\s*\(\d+:\d+\)\s*$/, ""), line: loc.line, column }, ctx);
  }

  // Mini-notation: "[mini] parse error at line N: Expected …" (line counted across the program).
  const mini = /\[mini\] parse error at line (\d+):\s*([\s\S]*)/.exec(message);
  if (mini?.[1]) {
    return withTrack({ kind: "pattern", message: mini[2]?.trim() || message, line: Number(mini[1]) }, ctx);
  }

  // Runtime error while evaluating: find the identifier it names, else the next block that didn't finish.
  const ident = identifierFromMessage(message);
  let line = ident ? findIdentifierLine(ctx.code, ident.name, ident.asMethod) : undefined;
  if (line === undefined && ctx.evaluatedBlocks !== undefined) line = labelLines(ctx.code)[ctx.evaluatedBlocks];
  return withTrack({ kind: "eval", message: cleanMessage(message), line }, ctx);
}

/** Attributes a query-time error to the block whose pattern threw (index into the evaluated `.p()` blocks). */
export function attributeQueryError(err: unknown, ctx: AttributionContext, blockIndex: number | undefined): EngineError {
  const message = cleanMessage(err instanceof Error ? err.message : String(err));
  const line = blockIndex === undefined ? undefined : labelLines(ctx.code)[blockIndex];
  return withTrack({ kind: "query", message, line }, ctx);
}

/** Attributes an error raised while playing a hap, using the hap's source locations (char offsets). */
export function attributeHapError(err: unknown, ctx: AttributionContext, locations: { start: number }[] | undefined): EngineError {
  const message = cleanMessage(err instanceof Error ? err.message : String(err));
  const first = locations?.[0];
  const line = first ? lineAtOffset(ctx.code, first.start) : undefined;
  return withTrack({ kind: "runtime", message, line }, ctx);
}

function withTrack(e: EngineError, ctx: AttributionContext): EngineError {
  const out: EngineError = { kind: e.kind, message: e.message };
  if (e.line !== undefined) out.line = e.line;
  if (e.column !== undefined) out.column = e.column;
  const trackId = trackAtLine(ctx.lines, e.line);
  if (trackId !== undefined) out.trackId = trackId;
  return out;
}
