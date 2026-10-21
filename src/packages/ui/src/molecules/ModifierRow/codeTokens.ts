export type CodeTokenKind = "str" | "num" | "fn" | "plain";

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const IDENT_START = /[A-Za-z_$]/;
const IDENT = /[\w$]/;
const DIGIT = /[0-9]/;

/**
 * Tiny JS-ish tokenizer for one-line Strudel modifier code: string literals, numbers, and identifiers called
 * as functions (`.lpf(`, `sine.range(`) are tinted; everything else is plain. Not a parser.
 */
export function tokenizeCode(code: string): CodeToken[] {
  const out: CodeToken[] = [];
  const push = (kind: CodeTokenKind, text: string) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else out.push({ kind, text });
  };

  let i = 0;
  while (i < code.length) {
    const ch = code.charAt(i);
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < code.length && code.charAt(j) !== ch) j += code.charAt(j) === "\\" ? 2 : 1;
      j = Math.min(code.length, j + 1);
      push("str", code.slice(i, j));
      i = j;
      continue;
    }
    const prev = i > 0 ? code.charAt(i - 1) : "";
    const startsNumber = DIGIT.test(ch) || (ch === "." && DIGIT.test(code.charAt(i + 1)) && !IDENT.test(prev));
    if (startsNumber && !IDENT.test(prev)) {
      let j = i + 1;
      while (j < code.length && /[0-9.]/.test(code.charAt(j))) j++;
      push("num", code.slice(i, j));
      i = j;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < code.length && IDENT.test(code.charAt(j))) j++;
      let k = j;
      while (k < code.length && code.charAt(k) === " ") k++;
      push(code.charAt(k) === "(" ? "fn" : "plain", code.slice(i, j));
      i = j;
      continue;
    }
    push("plain", ch);
    i++;
  }
  return out;
}
