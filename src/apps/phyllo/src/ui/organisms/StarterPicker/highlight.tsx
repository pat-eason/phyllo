import type { ReactNode } from "react";
import styles from "./StarterPicker.module.css";

/**
 * Tiny Strudel colourer for the read-only listing: comments, strings, numbers, `$:` labels and called names.
 * Same token colours as the code drawer (`--ph-code-*`). Not a parser; the engine owns real parsing.
 */
const TOKEN = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(^\s*_?\$:)|([A-Za-z_]\w*)(?=\()|((?<![\w.])\d*\.?\d+)/g;

const CLASS_FOR = ["comment", "string", "keyword", "fn", "number"] as const;

export function highlightLine(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const match of line.matchAll(TOKEN)) {
    const at = match.index;
    if (at > cursor) out.push(line.slice(cursor, at));
    const slot = [1, 2, 3, 4, 5].find((i) => match[i] !== undefined) ?? 1;
    out.push(
      <span key={at} className={styles[CLASS_FOR[slot - 1] ?? "comment"]}>
        {match[0]}
      </span>,
    );
    cursor = at + match[0].length;
  }
  if (cursor < line.length) out.push(line.slice(cursor));
  return out;
}

/** The program as one `<pre>`-ready node list: lines joined with real newlines so copy/paste keeps the code intact. */
export function highlightCode(code: string): ReactNode[] {
  const lines = code.split("\n");
  return lines.flatMap((line, i) => (i < lines.length - 1 ? [...highlightLine(line), "\n"] : highlightLine(line)));
}
