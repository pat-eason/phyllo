/**
 * A small syntax tokenizer for the code drawer: the JavaScript subset Phyllo generates and Strudel users paste
 * (labels `$:` / `_$:`, calls, strings, numbers, comments, arrow functions). Not a parser: it only colors text.
 * Block comments and template strings may span lines; the state carries over from one line to the next.
 */

export type TokenType = "label" | "keyword" | "fn" | "string" | "number" | "comment" | "punct" | "plain";

export interface Token {
  type: TokenType;
  text: string;
  /** 0-based offset in the line. */
  start: number;
}

const KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "new",
  "true",
  "false",
  "null",
  "undefined",
  "await",
  "async",
  "of",
  "in",
]);

/** Strudel values that read as functions even without a call (signals, `silence`, `rev` as an argument). */
const STRUDEL_VALUES = new Set([
  "silence",
  "sine",
  "cosine",
  "saw",
  "square",
  "tri",
  "rand",
  "irand",
  "perlin",
  "rev",
  "isaw",
  "itri",
  "envelope",
]);

type Carry = "none" | "block-comment" | "template";

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

function nextNonSpace(line: string, from: number): string {
  for (let i = from; i < line.length; i += 1) {
    const c = line[i] as string;
    if (c !== " " && c !== "\t") return c;
  }
  return "";
}

function tokenizeLine(line: string, carry: Carry): { tokens: Token[]; carry: Carry } {
  const tokens: Token[] = [];
  const push = (type: TokenType, start: number, end: number) => {
    if (end <= start) return;
    const prev = tokens[tokens.length - 1];
    if (prev && prev.type === type && (type === "plain" || type === "punct") && prev.start + prev.text.length === start) {
      prev.text += line.slice(start, end);
      return;
    }
    tokens.push({ type, text: line.slice(start, end), start });
  };

  let i = 0;
  if (carry === "block-comment") {
    const close = line.indexOf("*/");
    if (close < 0) {
      push("comment", 0, line.length);
      return { tokens, carry };
    }
    push("comment", 0, close + 2);
    i = close + 2;
  } else if (carry === "template") {
    const close = line.indexOf("`");
    if (close < 0) {
      push("string", 0, line.length);
      return { tokens, carry };
    }
    push("string", 0, close + 1);
    i = close + 1;
  }

  // A `$:` / `_$:` label only counts at the start of a line.
  const label = /^(\s*)_?\$:/.exec(line);
  if (i === 0 && label) {
    push("plain", 0, (label[1] ?? "").length);
    push("label", (label[1] ?? "").length, label[0].length);
    i = label[0].length;
  }

  while (i < line.length) {
    const c = line[i] as string;
    const next = line[i + 1] ?? "";
    if (c === "/" && next === "/") {
      push("comment", i, line.length);
      return { tokens, carry: "none" };
    }
    if (c === "/" && next === "*") {
      const close = line.indexOf("*/", i + 2);
      if (close < 0) {
        push("comment", i, line.length);
        return { tokens, carry: "block-comment" };
      }
      push("comment", i, close + 2);
      i = close + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === "\\" ? 2 : 1;
      const end = Math.min(line.length, j + 1);
      push("string", i, end);
      i = end;
      continue;
    }
    if (c === "`") {
      const close = line.indexOf("`", i + 1);
      if (close < 0) {
        push("string", i, line.length);
        return { tokens, carry: "template" };
      }
      push("string", i, close + 1);
      i = close + 1;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(next) && !isIdent(line[i - 1] ?? ""))) {
      let j = i;
      while (j < line.length && /[0-9._eE]/.test(line[j] as string)) j += 1;
      push("number", i, j);
      i = j;
      continue;
    }
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < line.length && isIdent(line[j] as string)) j += 1;
      const word = line.slice(i, j);
      const after = nextNonSpace(line, j);
      const type: TokenType = KEYWORDS.has(word)
        ? "keyword"
        : after === "(" || STRUDEL_VALUES.has(word)
          ? "fn"
          : "plain";
      push(type, i, j);
      i = j;
      continue;
    }
    push(c === " " || c === "\t" ? "plain" : "punct", i, i + 1);
    i += 1;
  }
  return { tokens, carry: "none" };
}

/** Tokens per line of `code` (split on `\n`). */
export function tokenize(code: string): Token[][] {
  let carry: Carry = "none";
  return code.split("\n").map((line) => {
    const result = tokenizeLine(line, carry);
    carry = result.carry;
    return result.tokens;
  });
}
