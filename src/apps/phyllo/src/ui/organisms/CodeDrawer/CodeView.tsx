import { validatePattern } from "@phyllo/engine";
import type { Track } from "@phyllo/model";
import { useId, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { isContextMenuKey, useContextMenu } from "../../../hooks";
import { codeMenuEntries } from "./codeMenu";
import type { CodeMenuCommands } from "./codeMenu";
import type { CodeLine, ErrorLocation, PatternLiteral as Literal } from "./codeModel";
import { PatternLiteral } from "./PatternLiteral";
import styles from "./CodeDrawer.module.css";

export interface CodeViewError {
  location: ErrorLocation;
  message: string;
}

export interface CodeViewProps {
  lines: readonly CodeLine[];
  /** Editable source literals keyed `"<line>:<start>"` (see `findPatternLiterals`). */
  literals: ReadonlyMap<string, Literal>;
  tracks: readonly Track[];
  selectedTrackId: string | null;
  /** Engine error placed on a displayed line. */
  error: CodeViewError | null;
  /** Show the line-number gutter. Default true. */
  lineNumbers?: boolean;
  /** Commit an edited pattern (`track/setPattern`). */
  onSetPattern(trackId: string, pattern: string): void;
  /** What the right-click menu does. Without it the code has no menu of its own. */
  menuCommands?: CodeMenuCommands;
}

interface LiteralEdit {
  key: string;
  trackId: string;
  draft: string;
}

const caretRow = (offset: number, message: string) => `${" ".repeat(Math.max(0, offset))}^ ${message}`;

function selectAllOnCommandA(event: KeyboardEvent<HTMLPreElement>) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "a") return;
  if (event.target instanceof HTMLInputElement) return;
  event.preventDefault();
  window.getSelection()?.selectAllChildren(event.currentTarget);
}

/** Selected text keeps the web view's own menu (Copy, Look Up), so the code's menu stays out of the way. */
function hasSelectionWithin(element: Element): boolean {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0 && selection.getRangeAt(0).intersectsNode(element);
}

/**
 * Line-numbered, syntax-colored code. The gutter is a separate column so selecting and copying the code never
 * picks up line numbers; error rows are `user-select: none` for the same reason. ⌘A inside selects only the code.
 */
export function CodeView({ lines, literals, tracks, selectedTrackId, error, lineNumbers = true, onSetPattern, menuCommands }: CodeViewProps) {
  const id = useId();
  const contextMenu = useContextMenu();
  const [edit, setEdit] = useState<LiteralEdit | null>(null);
  const names = useMemo(() => new Map(tracks.map((t) => [t.id, t.name])), [tracks]);
  // Parses and evaluates the draft (`bd*lm` parses but can't play); an invalid draft is never committed.
  const draftError = useMemo(() => {
    if (!edit) return null;
    const result = validatePattern(edit.draft, tracks.find((t) => t.id === edit.trackId)?.source.type);
    return result.ok ? null : result;
  }, [edit, tracks]);
  const patterns = useMemo(() => new Map(tracks.map((t) => [t.id, t.pattern])), [tracks]);
  const literalErrorId = `${id}-pattern-error`;
  const evalErrorId = `${id}-eval-error`;

  // An edit whose literal disappeared (scope switch, track removed) is simply dropped.
  const activeEdit = edit && literals.has(edit.key) ? edit : null;

  const commit = () => {
    if (!activeEdit || draftError) return;
    const current = patterns.get(activeEdit.trackId);
    if (current !== undefined && activeEdit.draft !== current) onSetPattern(activeEdit.trackId, activeEdit.draft);
    setEdit(null);
  };

  /** `trackId`: the track of the right-clicked line, null for the code in general. */
  function openMenu(event: MouseEvent<HTMLElement>, trackId: string | null) {
    if (!menuCommands) return;
    // A pattern being edited is a text field with its own menu.
    if (event.target instanceof Element && event.target.closest("input, textarea")) return;
    if (hasSelectionWithin(event.currentTarget)) return;
    const track = tracks.find((t) => t.id === trackId) ?? null;
    contextMenu.openFromEvent(event, { label: "Generated code", entries: codeMenuEntries(track, menuCommands) });
  }

  function onCodeKeyDown(event: KeyboardEvent<HTMLPreElement>) {
    selectAllOnCommandA(event);
    if (!menuCommands || !isContextMenuKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    contextMenu.openAtElement(event.currentTarget, { label: "Generated code", entries: codeMenuEntries(null, menuCommands) });
  }

  const gutter: ReactNode[] = [];
  const rows: ReactNode[] = [];
  for (const line of lines) {
    const hasError = error?.location.line === line.number;
    gutter.push(
      <span key={line.number} className={styles["lineNumber"]} data-error={hasError ? "" : undefined}>
        {hasError ? <span className={styles["errorMarker"]} aria-hidden="true" /> : null}
        {line.number}
      </span>,
    );

    const editedLiteral = activeEdit?.key.startsWith(`${line.number}:`) ? literals.get(activeEdit.key) : undefined;
    const content = line.tokens.map((token) => {
      const key = `${line.number}:${token.start}`;
      const literal = literals.get(key);
      if (literal) {
        const editing = activeEdit?.key === key;
        const trackName = names.get(literal.trackId) ?? literal.trackId;
        return (
          <PatternLiteral
            key={key}
            text={literal.text}
            trackName={trackName}
            editing={editing}
            draft={editing ? activeEdit.draft : ""}
            invalid={editing && draftError !== null}
            errorId={literalErrorId}
            onStart={() => setEdit({ key, trackId: literal.trackId, draft: patterns.get(literal.trackId) ?? "" })}
            onDraft={(draft) => setEdit({ key, trackId: literal.trackId, draft })}
            onCommit={commit}
            onCancel={() => setEdit(null)}
          />
        );
      }
      return (
        <span key={key} className={styles[token.type]}>
          {token.text}
        </span>
      );
    });

    rows.push(
      <span
        key={line.number}
        className={styles["line"]}
        data-highlighted={line.trackId !== null && line.trackId === selectedTrackId ? "" : undefined}
        data-muted={line.muted ? "" : undefined}
        data-error={hasError ? "" : undefined}
        aria-describedby={hasError ? evalErrorId : undefined}
        onContextMenu={(event) => openMenu(event, line.trackId)}
      >
        {content}
      </span>,
    );

    if (hasError && error) {
      const column = error.location.column;
      gutter.push(<span key={`${line.number}-e`} className={styles["gutterSpacer"]} />);
      rows.push(
        <span key={`${line.number}-e`} id={evalErrorId} className={styles["errorRow"]}>
          {column !== undefined ? caretRow(column - 1, error.message) : error.message}
        </span>,
      );
    }

    if (editedLiteral && draftError) {
      gutter.push(<span key={`${line.number}-p`} className={styles["gutterSpacer"]} />);
      rows.push(
        <span key={`${line.number}-p`} id={literalErrorId} className={styles["errorRow"]}>
          {draftError.column === undefined
            ? draftError.message
            : caretRow(editedLiteral.start + draftError.column, draftError.message)}
        </span>,
      );
    }
  }

  return (
    <div className={styles["codeGrid"]} data-line-numbers={lineNumbers ? undefined : "off"}>
      {lineNumbers ? (
        <div className={styles["gutter"]} aria-hidden="true">
          {gutter}
        </div>
      ) : null}
      <div className={styles["codeScroll"]}>
        {/* A focusable, labelled code region: keyboard users scroll it and ⌘A selects just the code. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
        <pre className={styles["code"]} aria-label="Generated Strudel code" tabIndex={0} onKeyDown={onCodeKeyDown} onContextMenu={(event) => openMenu(event, null)}>
          {rows}
        </pre>
      </div>
    </div>
  );
}
