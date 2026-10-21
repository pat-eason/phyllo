/**
 * Error attribution (DECISIONS V8): turn a Strudel/acorn/runtime error into an `EngineError`
 * that names the offending track via the program's LineMap. Pure.
 */
import { parse } from "acorn";
import type { EngineError, LineMap } from "@phyllo/model";
import { parseMiniPatternError } from "../parse/mini-error";

/**
 * `EngineError` plus, for `kind: "pattern"`, the 1-based column within the mini-notation string. `line` /
 * `column` stay absolute in the program code like every other kind. (Proposed for types.ts: `patternColumn?: number`.)
 */
export type PhylloEngineError = EngineError & { patternColumn?: number };

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

/** 1-based column of a character offset. */
export function columnAtOffset(code: string, offset: number): number {
  const end = Math.min(Math.max(0, offset), code.length);
  return end - (end > 0 ? code.lastIndexOf("\n", end - 1) + 1 : 0) + 1;
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

/** Message of anything thrown (Strudel code can throw plain objects). */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

// ── mini-notation error location ────────────────────────────────────────────────────────────────────

interface AstNode {
  type: string;
  start: number;
  loc?: { start: { line: number }; end: { line: number } };
  raw?: string;
  value?: unknown;
  quasis?: { value: { raw: string } }[];
  expressions?: unknown[];
  [key: string]: unknown;
}

interface MiniString {
  /** Offset of the opening quote. */
  start: number;
  value: string;
  firstLine: number;
  lastLine: number;
}

/** Strings the transpiler parses as mini-notation: double-quoted literals and untagged backtick strings. */
function miniStrings(code: string): MiniString[] {
  let ast: AstNode;
  try {
    ast = parse(code, { ecmaVersion: 2022, allowAwaitOutsideFunction: true, locations: true }) as unknown as AstNode;
  } catch {
    return [];
  }
  const out: MiniString[] = [];
  const visit = (node: AstNode, parent: AstNode | undefined) => {
    const lines = { firstLine: node.loc?.start.line ?? 0, lastLine: node.loc?.end.line ?? 0 };
    if (node.type === "Literal" && typeof node.value === "string" && node.raw?.startsWith('"')) {
      out.push({ start: node.start, value: node.value, ...lines });
    } else if (node.type === "TemplateLiteral" && parent?.type !== "TaggedTemplateExpression" && node.expressions?.length === 0) {
      out.push({ start: node.start, value: node.quasis?.[0]?.value.raw ?? "", ...lines });
    }
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const child = node[key];
      for (const c of Array.isArray(child) ? child : [child]) {
        if (c && typeof c === "object" && typeof (c as AstNode).type === "string") visit(c as AstNode, node);
      }
    }
  };
  visit(ast, undefined);
  return out;
}

export interface MiniErrorLocation {
  /** Absolute 1-based line / column of the offending character in the code. */
  line: number;
  column: number;
  /** 1-based column within the pattern string. */
  patternColumn: number;
}

/**
 * Locates a mini-notation parse error the transpiler reported on `line`: re-parses each mini string on that
 * line with krill (preferring one whose error message equals `message`).
 */
export function locateMiniError(code: string, line: number, message?: string): MiniErrorLocation | undefined {
  let fallback: MiniErrorLocation | undefined;
  for (const s of miniStrings(code)) {
    if (line < s.firstLine || line > s.lastLine) continue;
    const err = parseMiniPatternError(s.value);
    if (!err) continue;
    // krill's offset counts the opening quote, so the pattern column is also the distance from the quote
    const offset = s.start + err.column;
    const found = { line: lineAtOffset(code, offset), column: columnAtOffset(code, offset), patternColumn: err.column };
    if (message === undefined || err.message === message) return found;
    fallback ??= found;
  }
  return fallback;
}

// ── attribution ─────────────────────────────────────────────────────────────────────────────────────

/** Attributes an evaluation error (`onEvalError`): acorn syntax, mini-notation parse, or runtime. */
export function attributeEvalError(err: unknown, ctx: AttributionContext): PhylloEngineError {
  const message = messageOf(err);
  const loc = (err as { loc?: { line?: unknown; column?: unknown } } | null)?.loc;

  // acorn SyntaxError: `.loc {line, column}` (column 0-based) against the original code.
  if (loc && typeof loc.line === "number") {
    const column = typeof loc.column === "number" ? loc.column + 1 : undefined;
    return withTrack({ kind: "eval", message: message.replace(/\s*\(\d+:\d+\)\s*$/, ""), line: loc.line, column }, ctx);
  }

  // Mini-notation: "[mini] parse error at line N: Expected …" (line counted across the program).
  const mini = /\[mini\] parse error at line (\d+):\s*([\s\S]*)/.exec(message);
  if (mini?.[1]) {
    const text = mini[2]?.trim() || message;
    const line = Number(mini[1]);
    const at = locateMiniError(ctx.code, line, text);
    return withTrack({ kind: "pattern", message: text, line, ...at }, ctx);
  }

  // Runtime error while evaluating: find the identifier it names, else the next block that didn't finish.
  const ident = identifierFromMessage(message);
  let line = ident ? findIdentifierLine(ctx.code, ident.name, ident.asMethod) : undefined;
  if (line === undefined && ctx.evaluatedBlocks !== undefined) line = labelLines(ctx.code)[ctx.evaluatedBlocks];
  return withTrack({ kind: "eval", message: cleanMessage(message), line }, ctx);
}

/** Attributes a query-time error to the block whose pattern threw (index into the evaluated `.p()` blocks). */
export function attributeQueryError(err: unknown, ctx: AttributionContext, blockIndex: number | undefined): EngineError {
  const message = cleanMessage(messageOf(err));
  const line = blockIndex === undefined ? undefined : labelLines(ctx.code)[blockIndex];
  return withTrack({ kind: "query", message, line }, ctx);
}

/** Attributes an error raised while playing a hap, using the hap's source locations (char offsets). */
export function attributeHapError(err: unknown, ctx: AttributionContext, locations: { start: number }[] | undefined): EngineError {
  const message = cleanMessage(messageOf(err));
  const first = locations?.[0];
  const line = first ? lineAtOffset(ctx.code, first.start) : undefined;
  return withTrack({ kind: "runtime", message, line }, ctx);
}

// ── Strudel log lines that mean sound is dropped (SPEC §4.4) ────────────────────────────────────────

export interface SilencingLog {
  /** User-facing message (Strudel's prefix removed). */
  message: string;
  /** The source token the message names (chord symbol, sound name), used to point at it in the code. */
  token?: string;
}

const SILENCING_LOGS: { re: RegExp; clean: (m: RegExpExecArray) => string; token?: (m: RegExpExecArray) => string | undefined }[] = [
  // tonal voicing(): the hap becomes silence (voicings.mjs)
  { re: /^\[voicing\]:? unknown chord "([^"]*)"/, clean: (m) => `unknown chord "${m[1] ?? ""}"`, token: (m) => m[1] },
  // tonal scale(): the value has no note to play (tonal.mjs)
  { re: /^\[tonal\] (Invalid value format for 'scale'[^\n]*)/, clean: (m) => m[1] ?? m[0] },
  // superdough sampler: the sample never plays
  { re: /^\[sampler\] could not load "([^"]*)"/, clean: (m) => `could not load sample "${m[1] ?? ""}"`, token: (m) => m[1]?.split(":")[0] },
];

/** If `message` is a Strudel log line meaning a hap is silently dropped, its user-facing text. */
export function silencingLog(message: string): SilencingLog | undefined {
  for (const rule of SILENCING_LOGS) {
    const m = rule.re.exec(message);
    if (!m) continue;
    const token = rule.token?.(m);
    return token ? { message: rule.clean(m), token } : { message: rule.clean(m) };
  }
  return undefined;
}

/** First occurrence of `token` (not part of a longer name) on lines `range`: 1-based line + column. */
export function findTokenInLines(
  code: string,
  token: string,
  range: { start: number; end: number },
): { line: number; column: number } | undefined {
  if (!token) return undefined;
  const re = new RegExp(`(^|[^\\w#^])${escapeRe(token)}(?![\\w#^])`);
  const lines = code.split("\n");
  for (let l = Math.max(1, range.start); l <= Math.min(range.end, lines.length); l++) {
    const m = re.exec(lines[l - 1] ?? "");
    if (m) return { line: l, column: m.index + (m[1]?.length ?? 0) + 1 };
  }
  return undefined;
}

/**
 * Attributes a silencing log to the evaluated block that produced it (index into the `.p()` blocks): the
 * track whose LineMap block holds the block's label line, pointing at the token when it's in that block.
 */
export function attributeLogIssue(log: SilencingLog, ctx: AttributionContext, blockIndex: number | undefined): EngineError {
  const labelLine = blockIndex === undefined ? undefined : labelLines(ctx.code)[blockIndex];
  const trackId = trackAtLine(ctx.lines, labelLine);
  const range = trackId === undefined ? undefined : ctx.lines[trackId];
  const at = range && log.token ? findTokenInLines(ctx.code, log.token, range) : undefined;
  return withTrack({ kind: "runtime", message: log.message, line: labelLine, ...at }, ctx);
}

function withTrack(e: PhylloEngineError, ctx: AttributionContext): PhylloEngineError {
  const out: PhylloEngineError = { kind: e.kind, message: e.message };
  if (e.line !== undefined) out.line = e.line;
  if (e.column !== undefined) out.column = e.column;
  if (e.patternColumn !== undefined) out.patternColumn = e.patternColumn;
  const trackId = trackAtLine(ctx.lines, e.line);
  if (trackId !== undefined) out.trackId = trackId;
  return out;
}
