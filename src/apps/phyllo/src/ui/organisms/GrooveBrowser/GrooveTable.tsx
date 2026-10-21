import { GrooveCard, Icon } from "@phyllo/ui";
import type { GrooveSummary, LibrarySort } from "@phyllo/model";
import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { toCardData } from "./format";
import styles from "./GrooveTable.module.css";
import { contextAnchorFromKey } from "./interaction";
import type { GrooveHandlers } from "./interaction";
import type { RowSelection } from "./useRowSelection";

export interface GrooveTableProps extends GrooveHandlers {
  grooves: GrooveSummary[];
  now: Date;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  selection: RowSelection;
  /** Path of the groove being auditioned: its play button shows pause. */
  previewingPath: string | null;
}

interface Column {
  id: string;
  label: string;
  /** Visually hidden header (icon-only columns). */
  hidden?: boolean;
  /** The `setSort` value this column maps to; columns without one aren't sortable. */
  sort?: LibrarySort;
}

const COLUMNS: Column[] = [
  { id: "play", label: "Play", hidden: true },
  { id: "name", label: "Name", sort: "name" },
  { id: "tags", label: "Tags" },
  { id: "bpm", label: "BPM", sort: "bpm" },
  { id: "key", label: "Key" },
  { id: "length", label: "Length" },
  { id: "tracks", label: "Tracks" },
  { id: "edited", label: "Edited", sort: "edited" },
  { id: "favorite", label: "Favorite", hidden: true },
];

/** The store sorts Name and BPM ascending, dates newest first. */
const SORT_DIRECTION: Record<LibrarySort, "ascending" | "descending"> = {
  name: "ascending",
  bpm: "ascending",
  edited: "descending",
  created: "descending",
};

function ariaSortFor(column: Column, sort: LibrarySort): "ascending" | "descending" | "none" | undefined {
  if (!column.sort) return undefined;
  return column.sort === sort ? SORT_DIRECTION[sort] : "none";
}

/**
 * Table view. Rows are GrooveCard rows with a roving tab stop: Up/Down/Home/End move, Shift+Up/Down extend the
 * selection, Space toggles, Enter opens, Esc clears. Click selects, ⌘/Ctrl-click toggles, ⇧-click selects a range.
 */
export function GrooveTable({ grooves, now, sort, onSortChange, selection, previewingPath, onOpen, onPreview, onFavoriteChange, onContextMenu }: GrooveTableProps) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  const paths = grooves.map((g) => g.path);
  const tabStop = activePath !== null && paths.includes(activePath) ? activePath : (paths[0] ?? null);

  function focusRow(path: string | undefined) {
    if (path === undefined) return;
    setActivePath(path);
    rows.current.get(path)?.focus();
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, groove: GrooveSummary, index: number) {
    const anchor = contextAnchorFromKey(event);
    if (anchor) {
      event.preventDefault();
      onContextMenu(groove, anchor);
      return;
    }
    // Keys typed on a button inside the row (play, name, favorite) keep their own meaning.
    if (event.target !== event.currentTarget) return;
    let target: number | undefined;
    switch (event.key) {
      case "ArrowDown":
        target = Math.min(grooves.length - 1, index + 1);
        break;
      case "ArrowUp":
        target = Math.max(0, index - 1);
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = grooves.length - 1;
        break;
      case " ":
        event.preventDefault();
        selection.select(groove.path, "toggle");
        return;
      case "Enter":
        event.preventDefault();
        onOpen(groove);
        return;
      case "Escape":
        selection.clear();
        return;
      default:
        return;
    }
    event.preventDefault();
    const next = grooves[target];
    if (!next) return;
    if (event.shiftKey) selection.select(next.path, "range");
    focusRow(next.path);
  }

  // Capture phase so ⇧/⌘-click selects instead of triggering the name button's open.
  function handleRowClickCapture(event: MouseEvent<HTMLElement>, groove: GrooveSummary) {
    const modifier = event.shiftKey ? "range" : event.metaKey || event.ctrlKey ? "toggle" : null;
    const onButton = event.target instanceof Element && event.target.closest("button") !== null;
    if (modifier === null && onButton) return;
    event.preventDefault();
    event.stopPropagation();
    selection.select(groove.path, modifier ?? "only");
    setActivePath(groove.path);
  }

  return (
    <div className={styles["wrap"]}>
      <table className={styles["table"]} role="grid" aria-label="Grooves" aria-multiselectable="true">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.id} scope="col" className={styles["th"]} data-column={column.id} aria-sort={ariaSortFor(column, sort)}>
                {column.hidden ? (
                  <span className={styles["visuallyHidden"]}>{column.label}</span>
                ) : column.sort ? (
                  <SortButton label={column.label} active={column.sort === sort} direction={SORT_DIRECTION[column.sort]} onClick={() => column.sort && onSortChange(column.sort)} />
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grooves.map((groove, index) => (
            <GrooveCard
              key={groove.path}
              ref={(node) => {
                if (node) rows.current.set(groove.path, node);
                else rows.current.delete(groove.path);
              }}
              groove={toCardData(groove, now)}
              variant="row"
              selected={selection.isSelected(groove.path)}
              previewing={groove.path === previewingPath}
              aria-selected={selection.isSelected(groove.path)}
              tabIndex={groove.path === tabStop ? 0 : -1}
              onFocus={(event) => {
                if (event.target === event.currentTarget) setActivePath(groove.path);
              }}
              onClickCapture={(event) => handleRowClickCapture(event, groove)}
              onKeyDown={(event) => handleRowKeyDown(event, groove, index)}
              onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(groove, { x: event.clientX, y: event.clientY, trigger: null });
              }}
              onOpen={() => onOpen(groove)}
              onPreview={() => onPreview(groove)}
              onFavoriteChange={(favorite) => onFavoriteChange(groove, favorite)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface SortButtonProps {
  label: string;
  active: boolean;
  direction: "ascending" | "descending";
  onClick: () => void;
}

function SortButton({ label, active, direction, onClick }: SortButtonProps) {
  return (
    <button type="button" className={styles["sortButton"]} data-active={active ? "" : undefined} onClick={onClick}>
      {label}
      {active ? <Icon name="chevron-down" size={12} className={direction === "ascending" ? styles["asc"] : undefined} /> : null}
    </button>
  );
}
