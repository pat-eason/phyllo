import { parse as acornParse } from "acorn";
import type {
  ArrayExpression,
  CallExpression,
  Comment,
  Expression,
  Literal,
  Node,
  Program,
  SpreadElement,
  TemplateLiteral,
} from "acorn";
import type {
  Bus,
  Clip,
  Master,
  Modifier,
  ParamName,
  ParamValue,
  ParseResult,
  ParseWarning,
  Track,
  TrackKind,
  TrackSource,
} from "@phyllo/model";
import { LIMITS } from "@phyllo/model";
import { formatNumber, isExactNumber } from "../codegen/format";
import { canonicalControl, controlsSetBy, isDefaultParam, modulatedControls } from "../codegen/params";
import type { ControlName } from "../codegen/params";
import { inferSoundSource } from "./infer";

export interface ParseOptions {
  /** Fresh ids for tracks, modifiers and clips. Default: a per-call counter (`p1`, `p2`, …). */
  newId?: () => string;
  /** Track colors, assigned in track order (cycling). Default: `""`, and the `code/replace` reducer assigns colors. */
  palette?: readonly string[];
  /**
   * @deprecated Ignored. Tracks not wrapped in `arrange()` now parse with `clips: []` and the `code/replace`
   * reducer decides their clips (it knows the song length). Kept so existing callers still compile.
   */
  lengthBars?: number;
  /**
   * Fold orbit-shared FX back into buses: when every track on an orbit that sends to the reverb (delay) has
   * the same static `roomsize` (`delaytime`, `delayfeedback`), it becomes that orbit's bus setting and is
   * removed from those tracks. This inverts codegen's bus emission exactly. Default false.
   */
  inferBuses?: boolean;
}

/** A JavaScript syntax error. `line` is 1-based, `column` 1-based. */
export interface ParseSyntaxError {
  message: string;
  line: number;
  column: number;
}

/**
 * `ParseResult` plus status. On a syntax error `ok` is false, `error` carries the location, `tracks` and
 * `prelude` are empty and the caller keeps its last good model (SPEC §4.4). `buses` is set with `inferBuses`.
 */
export interface ParseOutcome extends ParseResult {
  ok: boolean;
  error?: ParseSyntaxError;
  buses?: Bus[];
}

const SOURCE_CALLS = new Set(["s", "sound", "note", "n", "chord"]);
/** Top-level calls that configure the REPL rather than produce the pattern to play. */
const DIRECTIVES = new Set(["all", "each", "samples", "hush", "setcpm", "setCpm", "setcps", "setCps"]);

function counterId(): () => string {
  let n = 0;
  return () => `p${++n}`;
}

function stringValue(node: Expression | SpreadElement | undefined): string | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof (node as Literal).value === "string") return (node as Literal).value as string;
  if (node.type === "TemplateLiteral") {
    const t = node as TemplateLiteral;
    if (t.expressions.length === 0 && t.quasis.length === 1) return t.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function numberValue(node: Expression | SpreadElement | undefined): number | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof (node as Literal).value === "number") return (node as Literal).value as number;
  if (node.type === "UnaryExpression" && node.operator === "-") {
    const inner = numberValue(node.argument);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

function isIdentifier(node: unknown, name?: string): boolean {
  const n = node as { type?: string; name?: string } | null;
  return n?.type === "Identifier" && (name === undefined || n.name === name);
}

function calleeIdentifier(node: Expression): string | undefined {
  if (node.type !== "CallExpression") return undefined;
  const callee = node.callee;
  return callee.type === "Identifier" ? callee.name : undefined;
}

// ── Chain decomposition ─────────────────────────────────────────────────────

interface ChainCall {
  name: string;
  node: CallExpression;
  /** Verbatim source of the call including its leading dot, e.g. `.lpf(sine.range(400, 1400))`. */
  text: string;
}

/** `s("bd").bank("x").gain(.8)` → root `s("bd")` + calls [bank, gain]; null unless every link is `.name(…)`. */
function decompose(code: string, expr: Expression): { root: CallExpression; calls: ChainCall[] } | null {
  const calls: ChainCall[] = [];
  let cur: Expression = expr;
  for (;;) {
    if (cur.type !== "CallExpression" || cur.optional) return null;
    const callee = cur.callee;
    if (callee.type === "Identifier") break;
    if (callee.type !== "MemberExpression" || callee.computed || callee.optional) return null;
    if (callee.property.type !== "Identifier" || callee.object.type === "Super") return null;
    calls.unshift({ name: callee.property.name, node: cur, text: code.slice(callee.object.end, cur.end).trim() });
    cur = callee.object;
  }
  return { root: cur, calls };
}

// ── Track analysis ──────────────────────────────────────────────────────────

type ClipSpan = { startBar: number; endBar: number };

interface TypedTrack {
  kind: Exclude<TrackKind, "code">;
  source: TrackSource;
  pattern: string;
  params: Partial<Record<ParamName, ParamValue>>;
  modifiers: string[];
  orbit: number;
}

type Analysis = { typed: TypedTrack } | { code: string; reason: string };

type Role =
  | { role: "bank" | "sound"; value: string }
  | { role: "voicing" }
  | { role: "control"; canon: ControlName; value: ParamValue }
  | { role: "modifier" };

/** Map a pattern expression onto the supported subset (SPEC §4.2), or explain why it stays code. */
function analyzePattern(code: string, expr: Expression): Analysis {
  const raw = code.slice(expr.start, expr.end);
  const chain = decompose(code, expr);
  if (!chain) return { code: raw, reason: "not a chain of calls on a source" };
  const sourceName = calleeIdentifier(chain.root) ?? "";
  if (!SOURCE_CALLS.has(sourceName)) return { code: raw, reason: `${sourceName || "expression"}() is not a source call` };
  const args = chain.root.arguments;
  const pattern = args.length === 1 ? stringValue(args[0]) : undefined;
  if (pattern === undefined) return { code: raw, reason: `${sourceName}() needs one string literal argument` };

  const isSoundRoot = sourceName === "s" || sourceName === "sound";
  const roles: Role[] = [];
  let seenModifier = false;
  let bank: string | null = null;
  let sound: string | null = null;
  let voicing = false;

  for (const call of chain.calls) {
    const a = call.node.arguments;
    const str = a.length === 1 ? stringValue(a[0]) : undefined;
    const num = a.length === 1 ? numberValue(a[0]) : undefined;
    const canon = canonicalControl(call.name);
    if (call.name === "bank" && isSoundRoot && !seenModifier && bank === null && str !== undefined) {
      bank = str;
      roles.push({ role: "bank", value: str });
    } else if ((call.name === "s" || call.name === "sound") && !isSoundRoot && !seenModifier && sound === null && str !== undefined) {
      sound = str;
      roles.push({ role: "sound", value: str });
    } else if (call.name === "voicing" && sourceName === "chord" && !seenModifier && !voicing && a.length === 0) {
      voicing = true;
      roles.push({ role: "voicing" });
    } else if (canon === "orbit" && num !== undefined && Number.isInteger(num) && num >= 0) {
      roles.push({ role: "control", canon, value: num });
    } else if (canon && canon !== "orbit" && num !== undefined && isExactNumber(num)) {
      roles.push({ role: "control", canon, value: num });
    } else if (canon && canon !== "orbit" && str !== undefined && !str.includes(":")) {
      roles.push({ role: "control", canon, value: str });
    } else {
      roles.push({ role: "modifier" });
      seenModifier = true;
    }
  }

  // A static control stays a knob only if nothing else in the chain also sets it (the later call would win,
  // or a modifier modulates it), and a patterned (string) value only if no modifier follows it, since moving
  // it behind a time-changing modifier would change what it means. Otherwise it is kept verbatim.
  for (let changed = true; changed; ) {
    changed = false;
    const setByModifiers = new Set<ControlName>();
    const counts = new Map<ControlName, number>();
    roles.forEach((r, i) => {
      if (r.role === "modifier") controlsSetBy(chain.calls[i]?.text ?? "").forEach((c) => setByModifiers.add(c));
      if (r.role === "control") counts.set(r.canon, (counts.get(r.canon) ?? 0) + 1);
    });
    roles.forEach((r, i) => {
      if (r.role !== "control") return;
      const later = typeof r.value === "string" && roles.slice(i + 1).some((x) => x.role === "modifier");
      if (setByModifiers.has(r.canon) || (counts.get(r.canon) ?? 0) > 1 || later) {
        roles[i] = { role: "modifier" };
        changed = true;
      }
    });
  }

  if (sourceName === "chord" && !voicing) return { code: raw, reason: "chord() without .voicing()" };

  const params: Partial<Record<ParamName, ParamValue>> = {};
  const modifiers: string[] = [];
  let orbit = 1;
  roles.forEach((r, i) => {
    const call = chain.calls[i];
    if (!call) return;
    if (r.role === "modifier") modifiers.push(call.text);
    else if (r.role === "control") {
      if (r.canon === "orbit") orbit = r.value as number;
      else params[r.canon] = r.value;
    }
  });

  let kind: TypedTrack["kind"];
  let source: TrackSource;
  if (sourceName === "chord") {
    kind = "chord";
    source = { type: "chord", sound, bank: null };
  } else if (sourceName === "note" || sourceName === "n") {
    kind = "melodic";
    source = { type: sourceName, sound, bank: null };
  } else {
    const methods = roles.flatMap((r, i) => (r.role === "modifier" ? [chain.calls[i]?.name ?? ""] : []));
    ({ kind, source } = inferSoundSource(pattern, bank, methods));
  }
  return { typed: { kind, source, pattern, params, modifiers, orbit } };
}

/**
 * `arrange([8, silence], [8, pat], …)` with every non-silence entry textually the same pattern → that
 * pattern + one clip per entry playing it. When every entry is `silence`, `inner` is null and every entry
 * counts as a clip (gaps and clips of a silent track are indistinguishable; this regenerates the same code).
 */
function unwrapArrange(code: string, expr: Expression): { inner: Expression | null; clips: ClipSpan[]; total: number } | null {
  if (calleeIdentifier(expr) !== "arrange") return null;
  const call = expr as CallExpression;
  let bar = 1;
  let inner: Expression | null = null;
  let innerText: string | null = null;
  const clips: ClipSpan[] = [];
  const entries: ClipSpan[] = [];
  for (const arg of call.arguments) {
    if (arg.type !== "ArrayExpression") return null;
    const [lenNode, patNode] = (arg as ArrayExpression).elements;
    if ((arg as ArrayExpression).elements.length !== 2 || !lenNode || !patNode || patNode.type === "SpreadElement") return null;
    const bars = numberValue(lenNode);
    if (bars === undefined || !Number.isInteger(bars) || bars <= 0) return null;
    const span = { startBar: bar, endBar: bar + bars - 1 };
    entries.push(span);
    if (!isIdentifier(patNode, "silence")) {
      const text = code.slice(patNode.start, patNode.end);
      if (innerText !== null && text !== innerText) return null;
      innerText = text;
      inner = patNode;
      clips.push(span);
    }
    bar += bars;
  }
  if (entries.length === 0) return null;
  return inner ? { inner, clips, total: bar - 1 } : { inner: null, clips: entries, total: bar - 1 };
}

// ── Top-level directives ────────────────────────────────────────────────────

type Tempo = { bpm: number; beatsPerBar: number };

/** Beats per bar tried, in order, for a bare cycles-per-minute value. */
const CPM_BEATS = [4, 3, 2, 1] as const;

const inBpmRange = (bpm: number) => bpm >= LIMITS.bpm.min && bpm <= LIMITS.bpm.max;

/**
 * A cycles-per-minute value as BPM: the first beats-per-bar of 4, 3, 2, 1 whose `bpm = cpm·beatsPerBar` is
 * inside the reducer's BPM limits and prints so that the regenerated `setcpm(bpm/beatsPerBar)` is `cpm`
 * again. Null when none fits (the call then stays in the prelude, so the tempo still plays as written).
 */
function tempoForCpm(cpm: number): Tempo | null {
  if (!Number.isFinite(cpm) || cpm <= 0) return null;
  for (const beatsPerBar of CPM_BEATS) {
    const bpm = Number(formatNumber(cpm * beatsPerBar));
    if (inBpmRange(bpm) && Math.abs(bpm / beatsPerBar - cpm) <= 1e-9 * cpm) return { bpm, beatsPerBar };
  }
  return null;
}

/**
 * `setcpm(bpm/beatsPerBar)` (codegen's form, taken as written when both fit the model) / `setcpm(cpm)` /
 * `setcps(cps)` (→ `tempoForCpm(60·cps)`). undefined: not a tempo call; null: not representable.
 */
function tempoOf(expr: Expression): Tempo | null | undefined {
  const name = calleeIdentifier(expr);
  if (name !== "setcpm" && name !== "setCpm" && name !== "setcps" && name !== "setCps") return undefined;
  const args = (expr as CallExpression).arguments;
  const arg = args[0];
  if (args.length !== 1 || !arg || arg.type === "SpreadElement") return null;
  if (name === "setcps" || name === "setCps") {
    const cps = numberValue(arg);
    return cps === undefined ? null : tempoForCpm(cps * 60);
  }
  if (arg.type === "BinaryExpression" && arg.operator === "/" && arg.left.type !== "PrivateIdentifier") {
    const a = numberValue(arg.left);
    const b = numberValue(arg.right);
    if (a === undefined || b === undefined || b <= 0) return null;
    const fits = inBpmRange(a) && isExactNumber(a) && Number.isInteger(b) && b >= LIMITS.beatsPerBar.min && b <= LIMITS.beatsPerBar.max;
    return fits ? { bpm: a, beatsPerBar: b } : tempoForCpm(a / b);
  }
  const cpm = numberValue(arg);
  return cpm === undefined ? null : tempoForCpm(cpm);
}

/** `all(x => x.postgain(v))` → v. */
function postgainOf(expr: Expression): number | undefined {
  if (calleeIdentifier(expr) !== "all") return undefined;
  const args = (expr as CallExpression).arguments;
  const fn = args[0];
  if (args.length !== 1 || fn?.type !== "ArrowFunctionExpression" || fn.params.length !== 1) return undefined;
  const param = fn.params[0];
  const body = fn.body;
  if (!param || param.type !== "Identifier" || body.type !== "CallExpression" || body.arguments.length !== 1) return undefined;
  const callee = body.callee;
  if (callee.type !== "MemberExpression" || callee.computed || !isIdentifier(callee.property, "postgain")) return undefined;
  if (!isIdentifier(callee.object, param.name)) return undefined;
  return numberValue(body.arguments[0]);
}

// ── Main ────────────────────────────────────────────────────────────────────

interface Draft {
  label: string | null;
  mute: boolean;
  solo: boolean;
  line: number;
  /** The pattern expression, or the raw body text when the label's body isn't an expression. */
  expr: Expression | string;
}

function syntaxError(err: unknown): ParseOutcome {
  const e = err as { message?: string; loc?: { line: number; column: number } };
  const message = (e.message ?? String(err)).replace(/\s*\(\d+:\d+\)$/, "");
  const line = e.loc?.line ?? 1;
  const column = (e.loc?.column ?? 0) + 1;
  return { ok: false, error: { message, line, column }, tracks: [], prelude: [], warnings: [{ message, line }] };
}

function labelInfo(label: string): { name: string | null; mute: boolean; solo: boolean } {
  // Strudel (core/repl.mjs `.p()`): a leading or trailing `_` mutes; labels of length > 1 starting with `S` solo.
  const mute = label.startsWith("_") || label.endsWith("_");
  const core = label.replace(/^_+|_+$/g, "");
  const solo = !mute && label.length > 1 && label.startsWith("S");
  const name = core.replace(/^S(?=\$)/, "").replace(/\$/g, "");
  return { name: name === "" ? null : name, mute, solo };
}

/**
 * Strudel program → tracks + prelude (SPEC §4.2). Never drops or rewrites code it can't map:
 * - `$:` / `_$:` / named labels (`bass:`, `_bass:`) are tracks; without labels the program's final
 *   expression is the one track (Strudel plays only that). A label names its track; an unlabelled block
 *   (`$:`) gets `name: ""` and the `code/replace` reducer keeps the matched track's name or picks a default.
 * - A block in the supported subset becomes a typed track; anything else becomes a Code track holding the
 *   verbatim expression (with a warning). A block containing a comment is kept as code too.
 *   `sound(…)` / `.sound(…)` normalise to `s` (a pure alias in Strudel, so the sound is unchanged).
 * - `setcpm(a/b)` / `setcpm(x)` / `setcps(x)` set the tempo (see `tempoOf`), `all(x => x.postgain(v))` the
 *   master postgain; a top-level `hush()` mutes the blocks above it and is dropped; a bare `silence`
 *   statement is dropped; every other top-level statement and every comment outside a track is kept
 *   verbatim in `prelude`.
 * - Clips: only a block wrapped in `arrange([n, silence|pat], …)` (one repeated pattern, or all `silence`)
 *   carries clips. Every other track has `clips: []`, meaning "no arrangement in the code": the reducer
 *   keeps the matched track's clips or gives a new track one full-song clip.
 */
export function parse(code: string, options: ParseOptions = {}): ParseOutcome {
  const newId = options.newId ?? counterId();
  const comments: Comment[] = [];
  let program: Program;
  try {
    program = acornParse(code, {
      ecmaVersion: "latest",
      sourceType: "script",
      locations: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      onComment: comments,
    });
  } catch (err) {
    return syntaxError(err);
  }

  const warnings: ParseWarning[] = [];
  const preludeItems: { start: number; text: string }[] = [];
  const drafts: (Draft & { start: number; end: number })[] = [];
  /** Spans whose comments are already kept verbatim (prelude statements) or force a Code track (track expressions). */
  const preludeSpans: [number, number][] = [];
  let tempo: ParseResult["tempo"];
  let master: Partial<Master> | undefined;

  const body = program.body;
  const hasLabels = body.some((s) => s.type === "LabeledStatement");
  const lastIndex = body.length - 1;
  const lineOf = (node: Node) => node.loc?.start.line ?? 1;

  body.forEach((stmt, i) => {
    const text = code.slice(stmt.start, stmt.end);
    if (stmt.type === "LabeledStatement") {
      const info = labelInfo(stmt.label.name);
      const expr = stmt.body.type === "ExpressionStatement" ? stmt.body.expression : code.slice(stmt.body.start, stmt.body.end);
      drafts.push({ label: info.name, mute: info.mute, solo: info.solo, line: lineOf(stmt), expr, start: stmt.start, end: stmt.end });
      return;
    }
    if (stmt.type === "ExpressionStatement") {
      const expr = stmt.expression;
      // A bare `silence` statement plays nothing wherever it stands (codegen writes one as the body of a
      // program without tracks, so Strudel's transpiler has an expression to return).
      if (isIdentifier(expr, "silence")) return;
      // Top-level `hush()` drops every block registered above it (core/repl.mjs `hush`): those blocks
      // become muted tracks and the call itself is dropped, since the mutes now say the same thing.
      if (calleeIdentifier(expr) === "hush" && (expr as CallExpression).arguments.length === 0) {
        const hushed = drafts.filter((d) => !d.mute);
        hushed.forEach((d) => (d.mute = true));
        if (hushed.length > 0) warnings.push({ message: `hush() silences the ${hushed.length} block(s) above it: they are muted`, line: lineOf(stmt) });
        return;
      }
      const t = tempoOf(expr);
      if (t) {
        tempo = t;
        return;
      }
      if (t === null) {
        warnings.push({ message: "setcpm/setcps value is computed or outside the BPM range: kept in the prelude", line: lineOf(stmt) });
      }
      const pg = t === undefined ? postgainOf(expr) : undefined;
      if (pg !== undefined) {
        master = { postgain: pg };
        return;
      }
      const directive = t !== undefined || DIRECTIVES.has(calleeIdentifier(expr) ?? "") || expr.type === "AwaitExpression";
      if (!hasLabels && i === lastIndex && !directive) {
        drafts.push({ label: null, mute: false, solo: false, line: lineOf(stmt), expr, start: stmt.start, end: stmt.end });
        return;
      }
      if (hasLabels && !directive && t === undefined) {
        warnings.push({ message: "Unlabelled expression kept in the prelude (only $: blocks play)", line: lineOf(stmt) });
      }
    }
    preludeItems.push({ start: stmt.start, text });
    preludeSpans.push([stmt.start, stmt.end]);
  });

  const inSpan = (c: Comment, [s, e]: [number, number]) => c.start >= s && c.end <= e;
  const exprSpan = (d: Draft): [number, number] | null => (typeof d.expr === "string" ? null : [d.expr.start, d.expr.end]);
  for (const c of comments) {
    if (preludeSpans.some((sp) => inSpan(c, sp))) continue;
    if (drafts.some((d) => { const sp = exprSpan(d); return sp !== null && inSpan(c, sp); })) continue;
    preludeItems.push({ start: c.start, text: code.slice(c.start, c.end) });
  }
  preludeItems.sort((a, b) => a.start - b.start);

  // Strudel keeps only the last block per name: earlier duplicates are silent, so they parse as muted.
  const lastByName = new Map<string, number>();
  drafts.forEach((d, i) => d.label !== null && lastByName.set(d.label, i));

  interface Built {
    draft: Draft;
    analysis: Analysis;
    clips: ClipSpan[] | null;
    total: number | null;
  }
  const built: Built[] = drafts.map((d, i) => {
    if (d.label !== null && lastByName.get(d.label) !== i && !d.mute) {
      d.mute = true;
      warnings.push({ message: `Duplicate block name "${d.label}": only the last one plays, this one is muted`, line: d.line });
    }
    if (typeof d.expr === "string") return { draft: d, analysis: { code: d.expr, reason: "label body is not an expression" }, clips: null, total: null };
    // `.analyze(…)` is never stripped: instrumented code is evaluated, never parsed, so a user's
    // `.analyze` is user code and stays (as a modifier).
    const expr = d.expr;
    const raw = code.slice(expr.start, expr.end);
    if (comments.some((c) => c.start >= expr.start && c.end <= expr.end)) {
      return { draft: d, analysis: { code: raw, reason: "contains comments" }, clips: null, total: null };
    }
    const arr = unwrapArrange(code, expr);
    if (arr) {
      const analysis: Analysis = arr.inner ? analyzePattern(code, arr.inner) : { code: "silence", reason: "arrange() of silence only" };
      return { draft: d, analysis, clips: arr.clips, total: arr.total };
    }
    return { draft: d, analysis: analyzePattern(code, expr), clips: null, total: null };
  });

  const totals = built.flatMap((b) => (b.total === null ? [] : [b.total]));
  const arrangedLength = totals.length > 0 ? Math.max(...totals) : undefined;
  if (totals.some((t) => t !== arrangedLength)) {
    warnings.push({ message: "arrange() totals differ: shorter arrangements loop in Strudel but their clips are placed once" });
  }
  const usedNames = new Set<string>();
  const uniqueName = (label: string | null) => {
    if (label === null) return "";
    let name = label;
    for (let k = 2; usedNames.has(name); k++) name = `${label} ${k}`;
    usedNames.add(name);
    return name;
  };
  const palette = options.palette ?? [];

  const tracks: Track[] = built.map((b, i) => {
    const { draft } = b;
    const id = newId();
    const clips: Clip[] = (b.clips ?? []).map((s) => ({ id: newId(), ...s }));
    const color = palette.length > 0 ? (palette[i % palette.length] ?? "") : "";
    const common = { id, color, mute: draft.mute, solo: draft.solo, clips };
    if ("code" in b.analysis) {
      warnings.push({ message: `Kept as a Code track: ${b.analysis.reason}`, line: draft.line });
      const source: TrackSource = { type: "s", sound: null, bank: null };
      return {
        ...common,
        name: uniqueName(draft.label),
        kind: "code",
        source,
        pattern: "",
        params: {},
        modifiers: [],
        orbit: 1,
        rawCode: b.analysis.code,
      };
    }
    const t = b.analysis.typed;
    const modifiers: Modifier[] = t.modifiers.map((code) => ({ id: newId(), code, enabled: true, origin: "parsed" }));
    return {
      ...common,
      name: uniqueName(draft.label),
      kind: t.kind,
      source: t.source,
      pattern: t.pattern,
      params: t.params,
      modifiers,
      orbit: t.orbit,
      rawCode: null,
    };
  });

  const result: ParseOutcome = { ok: true, tracks, prelude: preludeItems.map((p) => p.text), warnings };
  if (tempo) result.tempo = tempo;
  if (master) result.master = master;
  if (arrangedLength !== undefined) result.lengthBars = arrangedLength;
  if (options.inferBuses) result.buses = inferBuses(tracks);
  return result;
}

const BUS_KEYS = [
  ["roomsize", "room"],
  ["delaytime", "delay"],
  ["delayfeedback", "delay"],
] as const;

/**
 * See `ParseOptions.inferBuses`. Mutates the tracks' params (they are freshly built by `parse`). A track
 * whose orbit is modulated (`.orbit("<1 2>")`) has no knowable static orbit, so it keeps its own values.
 */
function inferBuses(tracks: Track[]): Bus[] {
  const buses: Bus[] = [];
  const eligible = tracks.filter((t) => t.kind !== "code" && !modulatedControls(t).has("orbit"));
  const orbits = [...new Set(eligible.map((t) => t.orbit))].sort((a, b) => a - b);
  for (const orbit of orbits) {
    const bus: Bus = { orbit };
    for (const [key, send] of BUS_KEYS) {
      const senders = eligible.filter((t) => {
        if (t.orbit !== orbit) return false;
        const mod = modulatedControls(t);
        const v = t.params[send];
        return mod.has(send) || (v !== undefined && !isDefaultParam(send, v));
      });
      if (senders.length === 0) continue;
      const values = senders.map((t) => (modulatedControls(t).has(key) ? undefined : t.params[key]));
      const first = values[0];
      if (typeof first !== "number" || !values.every((v) => v === first)) continue;
      bus[key] = first;
      for (const t of senders) delete t.params[key];
    }
    if (Object.keys(bus).length > 1) buses.push(bus);
  }
  return buses;
}

