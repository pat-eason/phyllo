/**
 * Guided one-line explanation of a mini-notation pattern (SPEC §6.1 Inspector › Pattern).
 *
 * `<c2 eb2 g2 bb1>*2` → `"< >" picks the next note each time; "*2" makes that happen twice per cycle.`
 *
 * Covers `~ * / [ ] < > , ? ( k,n ) @ !`. Phrases appear in the order the operators first show up in the pattern,
 * at most three, so the result stays a single line.
 */

const MAX_PHRASES = 3;

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

function spell(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length ? (NUMBER_WORDS[n] ?? String(n)) : String(n);
}

function times(n: number): string {
  if (n === 2) return "twice";
  if (n === 1) return "once";
  return `${spell(n)} times`;
}

type Kind = "rest" | "mult" | "slow" | "group" | "alt" | "layer" | "maybe" | "euclid" | "weight" | "repeat";

interface Finding {
  kind: Kind;
  /** The operator as written, e.g. `*2`, `(3,8)` */
  text: string;
  /** Numeric argument when there is one */
  n?: number;
  /** For euclid: [hits, steps, rotation?] */
  args?: number[];
  /** For `*`: the operator applies to a bracketed group rather than a single word */
  onGroup?: boolean;
}

const NOTE_WORD = /^[a-g](#{1,2}|b{1,2})?-?\d*$/;
const CHORD_WORD = /^[A-G][#b]?[A-Za-z0-9^+°ø-]*$/;

function readNumber(text: string, from: number): { value: number; text: string } | null {
  const m = /^(\d+\.?\d*|\.\d+)/.exec(text.slice(from));
  return m ? { value: Number(m[1]), text: m[1] ?? "" } : null;
}

function scan(pattern: string): Finding[] {
  const found: Finding[] = [];
  const seen = new Set<Kind>();
  const add = (f: Finding) => {
    if (seen.has(f.kind)) return;
    seen.add(f.kind);
    found.push(f);
  };
  let prevSignificant = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern.charAt(i);
    if (ch === "(") {
      const close = pattern.indexOf(")", i);
      const end = close === -1 ? pattern.length : close;
      const inner = pattern.slice(i + 1, end);
      const parts = inner.split(",").map((p) => p.trim());
      const nums = parts.map((p) => (/^-?\d+$/.test(p) ? Number(p) : Number.NaN));
      add({ kind: "euclid", text: `(${inner})`, args: nums.every((n) => !Number.isNaN(n)) && nums.length >= 2 ? nums : [] });
      i = end;
      prevSignificant = ")";
      continue;
    }
    if (ch === "~") add({ kind: "rest", text: "~" });
    else if (ch === "*" || ch === "/" || ch === "@" || ch === "!" || ch === "?") {
      const num = readNumber(pattern, i + 1);
      const text = ch + (num?.text ?? "");
      if (ch === "*") {
        add({ kind: "mult", text, ...(num ? { n: num.value } : {}), onGroup: prevSignificant === "]" || prevSignificant === ">" });
      } else if (ch === "/") add({ kind: "slow", text, ...(num ? { n: num.value } : {}) });
      else if (ch === "@") add({ kind: "weight", text, ...(num ? { n: num.value } : {}) });
      else if (ch === "!") add({ kind: "repeat", text, ...(num ? { n: num.value } : {}) });
      else add({ kind: "maybe", text, ...(num ? { n: num.value } : {}) });
      if (num) i += num.text.length;
    } else if (ch === "[") add({ kind: "group", text: "[ ]" });
    else if (ch === "<") add({ kind: "alt", text: "< >" });
    else if (ch === ",") add({ kind: "layer", text: "," });
    if (!/\s/.test(ch)) prevSignificant = ch;
  }
  return found;
}

/** What the words in the pattern are, for phrases like "picks the next note". */
function nounFor(pattern: string): string {
  const words = pattern.match(/[A-Za-z][A-Za-z0-9#^+°ø-]*/g) ?? [];
  if (words.length === 0) return "step";
  if (words.every((w) => NOTE_WORD.test(w))) return "note";
  if (words.every((w) => CHORD_WORD.test(w))) return "chord";
  return "sound";
}

/** True when every layer of the pattern is a single top-level step, so a multiplier is "per cycle". */
function isSingleStep(pattern: string): boolean {
  let depth = 0;
  let steps = 0;
  let inStep = false;
  let maxSteps = 0;
  for (const ch of pattern) {
    if ("[<({".includes(ch)) depth++;
    else if ("]>)}".includes(ch)) depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === ",") {
      maxSteps = Math.max(maxSteps, steps);
      steps = 0;
      inStep = false;
      continue;
    }
    if (depth === 0 && /\s/.test(ch)) {
      inStep = false;
      continue;
    }
    if (!inStep) {
      steps++;
      inStep = true;
    }
  }
  return Math.max(maxSteps, steps) <= 1;
}

function phraseFor(f: Finding, pattern: string, perCycle: boolean): string {
  const q = `"${f.text}"`;
  switch (f.kind) {
    case "rest":
      return `${q} is a rest, so that step stays silent`;
    case "mult": {
      const where = perCycle ? "per cycle" : "in the time of one step";
      if (f.n === undefined) return `${q} repeats the step, ${perCycle ? "fitting more into each cycle" : "squeezing more into one step"}`;
      return `${q} ${f.onGroup ? "makes that happen" : "plays it"} ${times(f.n)} ${where}`;
    }
    case "slow":
      return f.n === undefined || f.n === 0
        ? `${q} stretches the step out`
        : `${q} stretches it over ${f.n === 1 ? "one cycle" : `${spell(f.n)} cycles`}`;
    case "group":
      return `${q} squeezes everything inside into one step`;
    case "alt":
      return `${q} picks the next ${nounFor(pattern)} each time`;
    case "layer":
      return `${q} plays the parts together, as layers`;
    case "maybe":
      return f.n === undefined
        ? `${q} gives that step a 50% chance of playing`
        : `${q} leaves that step out about ${Math.round(f.n * 100)}% of the time`;
    case "euclid": {
      const args = f.args ?? [];
      const hits = args[0];
      const steps = args[1];
      if (hits === undefined || steps === undefined) return `${q} spreads hits evenly over a number of steps`;
      const rotation = args[2];
      const base = `${q} spreads ${hits} ${hits === 1 ? "hit" : "hits"} evenly over ${steps} steps`;
      return rotation ? `${base}, starting ${rotation} ${rotation === 1 ? "step" : "steps"} in` : base;
    }
    case "weight":
      return f.n === undefined
        ? `${q} makes that step longer`
        : `${q} makes that step ${f.n === 1 ? "the normal length" : `${times(f.n)} as long`}`;
    case "repeat":
      return f.n === undefined
        ? `${q} repeats the previous step`
        : `${q} plays that step ${times(f.n)} in a row`;
  }
}

/** One plain-language sentence about the operators in a mini-notation pattern. */
export function explainPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (trimmed === "") return "Nothing to play yet. Type a note or a sound name.";
  const findings = scan(trimmed);
  if (findings.length === 0) {
    const words = trimmed.split(/\s+/).filter((w) => w !== "");
    if (words.length === 1) return "One step, played once per cycle.";
    return `Each word is a step. The ${words.length} steps share one cycle equally.`;
  }
  const perCycle = isSingleStep(trimmed);
  const phrases = findings.slice(0, MAX_PHRASES).map((f) => phraseFor(f, trimmed, perCycle));
  return `${phrases.join("; ")}.`;
}
