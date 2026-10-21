// Needs types/strudel-parse.d.ts (referenced from src/index.ts).
import { isNote } from "@strudel/core";
import type { SourceType } from "@phyllo/model";
import { queryEvents } from "../mini/query";
import type { MiniEvent } from "../mini/query";
import { parseMiniPatternError } from "./mini-error";

export type PatternValidation = { ok: true } | { ok: false; message: string; column?: number };

/** Cycles queried to catch errors in alternating patterns like `bd*<2 q>`. */
const VALIDATE_CYCLES = 4;

/**
 * Full pattern check for the Inspector pattern field, the code drawer and live code: the pattern must parse
 * **and** evaluate (`bd*lm` is valid mini-notation that throws "Invalid argument" as soon as it is queried).
 * `sourceType` adds the value check the track's `.s()` / `.note()` / `.n()` call implies.
 * Messages are written for people ("`lm` isn't a number — `*` needs a number like `*4`"); `column` is 1-based.
 */
export function validatePattern(pattern: string, sourceType: SourceType = "s"): PatternValidation {
  const syntax = parseMiniPatternError(pattern);
  if (syntax) return { ok: false, message: friendlySyntaxMessage(pattern, syntax.message), column: syntax.column };

  let events: MiniEvent[];
  try {
    events = queryEvents(pattern, 0, VALIDATE_CYCLES);
  } catch (err) {
    const found = diagnoseArguments(pattern);
    if (found) return { ok: false, ...found };
    return { ok: false, message: `This pattern can't be played (${errorText(err)}). Check the numbers after \`*\`, \`/\`, \`(\` and \`@\`.` };
  }

  const bad = firstBadValue(events, sourceType, pattern);
  if (bad) return { ok: false, ...bad };
  return { ok: true };
}

// ── syntax errors ───────────────────────────────────────────────────────────

const OPENERS: Record<string, string> = { "[": "]", "<": ">", "{": "}", "(": ")" };
const CLOSERS = new Set(Object.values(OPENERS));

/** Peggy's "Expected …" list is for developers; name the usual causes instead. */
function friendlySyntaxMessage(pattern: string, raw: string): string {
  const stack: { char: string; column: number }[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i] ?? "";
    if (ch in OPENERS) stack.push({ char: ch, column: i + 1 });
    else if (CLOSERS.has(ch)) {
      const open = stack.pop();
      if (!open || OPENERS[open.char] !== ch) return `There's an extra \`${ch}\` with nothing to close.`;
    }
  }
  const unclosed = stack.pop();
  if (unclosed) return `\`${unclosed.char}\` is never closed — add \`${OPENERS[unclosed.char] ?? ""}\`.`;
  const trailing = /([*/!@%])\s*$/.exec(pattern);
  if (trailing) return `\`${trailing[1]}\` needs a number after it, like \`${trailing[1]}4\`.`;
  return raw.startsWith("Expected ") ? "This isn't valid pattern notation here — check the characters near the marked spot." : raw;
}

// ── evaluation errors ───────────────────────────────────────────────────────

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err)).replace(/^\[mini\]\s*/, "");

const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;

interface Found {
  message: string;
  column?: number;
}

/**
 * Evaluation errors from Strudel are generic ("Invalid argument"), so find the culprit in the text: a word where a
 * number is required after `*`, `/`, `!`, `@`, `%`, or inside a euclid `(a,b,c)`.
 */
function diagnoseArguments(pattern: string): Found | null {
  const operator = /([*/%])\s*([A-Za-z_][\w#.-]*)/.exec(pattern);
  if (operator) {
    const [, op, word] = operator;
    return { message: `\`${word}\` isn't a number — \`${op}\` needs a number like \`${op}4\`.`, column: columnOf(operator, word) };
  }
  const euclid = /\(([^()]*)\)/g;
  for (let m = euclid.exec(pattern); m; m = euclid.exec(pattern)) {
    const args = (m[1] ?? "").split(",");
    for (const arg of args) {
      const word = arg.trim();
      if (word !== "" && !NUMBER.test(word) && /^[A-Za-z_]/.test(word)) {
        return { message: `\`${word}\` isn't a number — \`(3,8)\` needs numbers like \`(3,8)\`.`, column: m.index + 1 + (m[0] ?? "").indexOf(word) };
      }
    }
  }
  return null;
}

function columnOf(match: RegExpExecArray, word: string | undefined): number {
  return match.index + (match[0] ?? "").lastIndexOf(word ?? "") + 1;
}

// ── value checks per source type ────────────────────────────────────────────

function firstBadValue(events: readonly MiniEvent[], sourceType: SourceType, pattern: string): Found | null {
  for (const e of events) {
    const v = Array.isArray(e.value) ? e.value[0] : e.value;
    if (typeof v !== "string") continue;
    if (sourceType === "note" && !isNote(v)) {
      return { message: `\`${v}\` isn't a note — use names like c3, eb4 or f#2 (or a MIDI number).`, column: indexColumn(pattern, v) };
    }
    if (sourceType === "n" && !NUMBER.test(v)) {
      return { message: `\`${v}\` isn't a number — this track plays numbered notes or samples, like 0 2 4.`, column: indexColumn(pattern, v) };
    }
  }
  return null;
}

function indexColumn(pattern: string, word: string): number | undefined {
  const i = pattern.indexOf(word);
  return i < 0 ? undefined : i + 1;
}
