import type { Track } from "@phyllo/model";
import { useRef, useState, type KeyboardEvent } from "react";
import { useProject } from "../../../hooks";
import { parseInsertValue } from "./stripModel";
import type { InsertItem } from "./stripModel";
import styles from "./ChannelStrip.module.css";

export interface InsertListProps {
  track: Track;
  items: readonly InsertItem[];
  /** id of the visible "Inserts" legend */
  labelledBy: string;
}

/** The strip's insert rows. Plain-number params edit inline on click (Enter commits, Escape reverts, empty removes). */
export function InsertList({ track, items, labelledBy }: InsertListProps) {
  const { dispatch } = useProject();
  const [editing, setEditing] = useState<{ key: string; draft: string } | null>(null);
  // Set when Enter/Escape already closed the field, so the blur that follows doesn't commit again.
  const closed = useRef(false);

  if (items.length === 0) return null;

  const startEdit = (item: InsertItem) => {
    closed.current = false;
    setEditing({ key: item.key, draft: item.value });
  };

  const commit = (item: InsertItem, text: string) => {
    if (closed.current) return;
    closed.current = true;
    setEditing(null);
    if (!item.param) return;
    const value = parseInsertValue(text);
    if (value === undefined) return;
    dispatch({ type: "track/setParam", trackId: track.id, param: item.param, value });
  };

  return (
    <ul className={styles["inserts"]} aria-labelledby={labelledBy}>
      {items.map((item) => {
        if (editing?.key === item.key) {
          const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(item, event.currentTarget.value);
            } else if (event.key === "Escape") {
              event.preventDefault();
              closed.current = true;
              setEditing(null);
            }
          };
          return (
            <li key={item.key} className={styles["insert"]} data-editing="">
              <span>{item.label}</span>
              <input
                className={styles["insertInput"]}
                aria-label={`${track.name} ${item.label} value`}
                value={editing.draft}
                onChange={(e) => setEditing({ key: item.key, draft: e.target.value })}
                onKeyDown={onKeyDown}
                onBlur={(e) => commit(item, e.currentTarget.value)}
                // Focus moves into the field the user just clicked open.
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                spellCheck={false}
              />
            </li>
          );
        }
        const body = (
          <>
            <span>{item.label}</span>{" "}
            <span className={styles["insertValue"]} data-modulated={item.modulated ? "" : undefined}>
              {item.value}
            </span>
          </>
        );
        return (
          <li key={item.key} className={styles["insert"]} title={item.code}>
            {item.editable ? (
              <button
                type="button"
                className={styles["insertButton"]}
                aria-label={`${item.label} ${item.value}, edit`}
                onClick={() => startEdit(item)}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
