import { parseExpressionAt } from "acorn";
import type { Modifier, ParamName, Track } from "@phyllo/model";
import { formatNumber } from "./format";

/** Knob params plus `orbit`, which is a track field but is set by a chained call like the others. */
export type ControlName = ParamName | "orbit";

/**
 * Strudel control names (and aliases) per canonical param, from @strudel/core 1.2.6 controls.mjs
 * (REPORT (a)): `lpf` = cutoff/ctf/lp, `lpq` = resonance, `hpf` = hcutoff/hp, `roomsize` = size/sz/rsize,
 * `delaytime` = delayt/dt, `delayfeedback` = delayfb/dfb, `orbit` = o.
 */
export const PARAM_ALIASES: Readonly<Record<ControlName, readonly string[]>> = {
  gain: ["gain"],
  pan: ["pan"],
  lpf: ["lpf", "cutoff", "ctf", "lp"],
  lpq: ["lpq", "resonance"],
  hpf: ["hpf", "hcutoff", "hp"],
  shape: ["shape"],
  room: ["room"],
  roomsize: ["roomsize", "size", "sz", "rsize"],
  delay: ["delay"],
  delaytime: ["delaytime", "delayt", "dt"],
  delayfeedback: ["delayfeedback", "delayfb", "dfb"],
  orbit: ["orbit", "o"],
};

const ALIAS_TO_CONTROL = new Map<string, ControlName>();
for (const [canon, names] of Object.entries(PARAM_ALIASES) as [ControlName, readonly string[]][]) {
  for (const n of names) ALIAS_TO_CONTROL.set(n, canon);
}

/** Canonical control for a Strudel function/method name, e.g. `cutoff` → `lpf`. */
export function canonicalControl(name: string): ControlName | undefined {
  return ALIAS_TO_CONTROL.get(name);
}

/**
 * Controls that a colon-separated string value also sets (`lpf("800:10")` sets resonance,
 * `room(".5:4")` writes `size`, `delay(".5:.25:.4")` sets time and feedback).
 */
const COLON_SETS: Partial<Record<ControlName, readonly ControlName[]>> = {
  lpf: ["lpq"],
  room: ["roomsize"],
  delay: ["delaytime", "delayfeedback"],
};

/** Functions that set a knob param without naming it (`jux` pans the two copies hard left/right). */
const IMPLICIT_SETTERS: Readonly<Record<string, readonly ControlName[]>> = {
  jux: ["pan"],
  juxBy: ["pan"],
  juxcut: ["pan"],
  juxcutBy: ["pan"],
};

/**
 * Strudel defaults at which a param is a no-op, so codegen omits it (SPEC §4.1 "omit parameters left at
 * their defaults"). Only params whose absence and default are audibly identical are listed: gain .8
 * (controls.mjs:421), pan .5, and the sends/drive at 0 (superdough only builds reverb/delay when > 0).
 */
export const PARAM_DEFAULTS: Readonly<Partial<Record<ParamName, number>>> = {
  gain: 0.8,
  pan: 0.5,
  shape: 0,
  room: 0,
  delay: 0,
};

export function isDefaultParam(param: ParamName, value: unknown): boolean {
  const d = PARAM_DEFAULTS[param];
  return d !== undefined && typeof value === "number" && Number(formatNumber(value)) === d;
}

// ── Minimal AST walking (acorn has no walker; acorn-walk isn't a dependency) ──

interface AstNode {
  type: string;
  start: number;
  end: number;
  [k: string]: unknown;
}

function isAstNode(v: unknown): v is AstNode {
  return typeof v === "object" && v !== null && typeof (v as { type?: unknown }).type === "string";
}

/** Depth-first visit of every AST node under `root`. */
export function walkAst(root: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(root)) {
    for (const item of root) walkAst(item, visit);
    return;
  }
  if (!isAstNode(root)) return;
  visit(root);
  for (const key of Object.keys(root)) {
    if (key === "loc" || key === "range") continue;
    const child = root[key];
    if (typeof child === "object" && child !== null) walkAst(child, visit);
  }
}

/** Name of a called function: `lpf(…)` → `lpf`, `x.lpf(…)` → `lpf`. */
function calleeName(node: AstNode): string | undefined {
  const callee = node.callee as AstNode | undefined;
  if (!callee) return undefined;
  if (callee.type === "Identifier") return callee.name as string;
  if (callee.type === "MemberExpression" && !callee.computed) {
    const prop = callee.property as AstNode;
    if (prop.type === "Identifier") return prop.name as string;
  }
  return undefined;
}

function firstArgString(node: AstNode): string | undefined {
  const args = node.arguments as AstNode[] | undefined;
  const a = args?.[0];
  if (!a) return undefined;
  if (a.type === "Literal" && typeof a.value === "string") return a.value;
  if (a.type === "TemplateLiteral") {
    const quasis = a.quasis as { value: { cooked?: string | null } }[];
    if (quasis.length === 1) return quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

/** Parse a chained-call snippet (`.lpf(sine…)`) as the tail of a member expression; null if it isn't JS. */
function parseChainSnippet(code: string): AstNode | null {
  const src = code.trimStart().startsWith(".") ? `_${code.trim()}` : code.trim();
  try {
    const node = parseExpressionAt(src, 0, { ecmaVersion: "latest" }) as unknown as AstNode;
    return node.end === src.length ? node : null;
  } catch {
    return null;
  }
}

/** Every control a piece of code sets via a call to the control or one of its aliases. */
export function controlsSetBy(code: string): Set<ControlName> {
  const out = new Set<ControlName>();
  const ast = parseChainSnippet(code);
  if (!ast) {
    // Not parseable on its own: fall back to a textual scan so a broken modifier still wins over a knob.
    for (const [alias, canon] of ALIAS_TO_CONTROL) {
      if (new RegExp(`(^|[^\\w$])${alias}\\s*\\(`).test(code)) out.add(canon);
    }
    for (const [fn, sets] of Object.entries(IMPLICIT_SETTERS)) {
      if (new RegExp(`(^|[^\\w$])${fn}\\s*\\(`).test(code)) sets.forEach((c) => out.add(c));
    }
    return out;
  }
  walkAst(ast, (node) => {
    if (node.type !== "CallExpression") return;
    const name = calleeName(node);
    if (!name) return;
    const canon = canonicalControl(name);
    if (canon) {
      out.add(canon);
      if (firstArgString(node)?.includes(":")) COLON_SETS[canon]?.forEach((c) => out.add(c));
    }
    IMPLICIT_SETTERS[name]?.forEach((c) => out.add(c));
  });
  return out;
}

function enabledModifiers(track: Track): Modifier[] {
  return track.modifiers.filter((m) => m.enabled && m.code.trim() !== "");
}

/** Controls (knob params and orbit) set by the track's enabled modifiers. */
export function modulatedControls(track: Track): Set<ControlName> {
  const out = new Set<ControlName>();
  if (track.kind === "code") return out;
  for (const m of enabledModifiers(track)) controlsSetBy(m.code).forEach((c) => out.add(c));
  return out;
}

/**
 * Knob params set by an enabled modifier (e.g. `.lpf(sine.range(400, 1400).slow(8))`): the modifier wins,
 * codegen skips the static value and the Inspector shows the knob as modulated (SPEC §4.1).
 */
export function modulatedParams(track: Track): Set<ParamName> {
  const out = new Set<ParamName>();
  for (const c of modulatedControls(track)) if (c !== "orbit") out.add(c);
  return out;
}

/** Compact value text for ranges: 1400 → `1.4k`, 400 → `400`, 0.25 → `.25`. */
export function formatCompact(v: number): string {
  if (Math.abs(v) >= 1000) {
    const k = Math.round((v / 1000) * 10) / 10;
    return `${formatNumber(k)}k`;
  }
  return formatNumber(Math.round(v * 100) / 100);
}

function literalNumber(node: AstNode | undefined): number | undefined {
  if (!node) return undefined;
  if (node.type === "Literal" && typeof node.value === "number") return node.value;
  if (node.type === "UnaryExpression" && node.operator === "-") {
    const inner = literalNumber(node.argument as AstNode);
    return inner === undefined ? undefined : -inner;
  }
  return undefined;
}

/** Value numbers of a mini string, ignoring operator arguments (`*4`, `/2`, `!3`, `@2`, `?.3`, `(3,8)`). */
function numbersInMini(s: string): number[] {
  const values = s.replace(/[*/!@?%]\s*-?(?:\d+\.?\d*|\.\d+)/g, " ").replace(/\([^)]*\)/g, " ");
  return (values.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number).filter((n) => Number.isFinite(n));
}

function rangeText(lo: number, hi: number): string {
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo];
  return `~${formatCompact(a)}–${formatCompact(b)}`;
}

/** Range of one argument expression: `sine.range(400, 1400).slow(8)` or a mini string `"<400 800>"`. */
function argRange(arg: AstNode): string | null {
  let found: string | null = null;
  walkAst(arg, (node) => {
    if (found || node.type !== "CallExpression") return;
    const name = calleeName(node);
    if (name !== "range" && name !== "rangex") return;
    const args = node.arguments as AstNode[];
    const lo = literalNumber(args[0]);
    const hi = literalNumber(args[1]);
    if (lo !== undefined && hi !== undefined) found = rangeText(lo, hi);
  });
  if (found) return found;
  const str = arg.type === "Literal" && typeof arg.value === "string" ? arg.value : undefined;
  if (str !== undefined) {
    const nums = numbersInMini(str);
    if (nums.length >= 2) return rangeText(Math.min(...nums), Math.max(...nums));
  }
  return null;
}

/**
 * Value text for a modulated or patterned knob, e.g. `~400–1.4k` from `.lpf(sine.range(400, 1400))`,
 * `~.45–.7` from `.gain("[.45 .7]*4")`. Null when the param isn't modulated or no range can be read.
 */
export function modulationRange(track: Track, param: ParamName): string | null {
  const aliases = new Set(PARAM_ALIASES[param]);
  for (const m of enabledModifiers(track)) {
    const ast = parseChainSnippet(m.code);
    if (!ast) continue;
    let found: string | null = null;
    walkAst(ast, (node) => {
      if (found || node.type !== "CallExpression") return;
      const name = calleeName(node);
      if (!name || !aliases.has(name)) return;
      const arg = (node.arguments as AstNode[])[0];
      if (arg) found = argRange(arg);
    });
    if (found) return found;
  }
  const v = track.params[param];
  if (typeof v === "string") {
    const nums = numbersInMini(v);
    if (nums.length >= 2) return rangeText(Math.min(...nums), Math.max(...nums));
  }
  return null;
}
