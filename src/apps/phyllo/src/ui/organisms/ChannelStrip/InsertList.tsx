import type { Track } from "@phyllo/model";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useContextMenuTrigger, useProject } from "../../../hooks";
import { navigate } from "../../shell/router";
import { parseInsertValue } from "./stripModel";
import type { InsertItem } from "./stripModel";
import { modifierInsertMenuEntries, paramInsertMenuEntries } from "./stripMenus";
import styles from "./ChannelStrip.module.css";

interface InsertRowProps {
  track: Track;
  item: InsertItem;
  onEditValue: () => void;
  children: ReactNode;
}

/** One non-editing insert row with its right-click menu. */
function InsertRow({ track, item, onEditValue, children }: InsertRowProps) {
  const { dispatch } = useProject();
  const menu = useContextMenuTrigger(() => {
    const modifier = item.modifierId ? track.modifiers.find((m) => m.id === item.modifierId) : undefined;
    const { param } = item;
    if (!modifier && !param) return null;
    // Like the strip itself, an insert's menu selects the track first.
    dispatch({ type: "ui/select", trackId: track.id });
    const showInInspector = () => navigate({ screen: "arrange" });
    const label = `${track.name} insert ${item.label}`;
    if (modifier) {
      const modifierId = modifier.id;
      return {
        label,
        entries: modifierInsertMenuEntries(modifier.enabled, {
          setEnabled: (enabled) => dispatch({ type: "modifier/update", trackId: track.id, modifierId, patch: { enabled } }),
          showInInspector,
          remove: () => dispatch({ type: "modifier/remove", trackId: track.id, modifierId }),
        }),
      };
    }
    return {
      label,
      entries: paramInsertMenuEntries(
        { editable: item.editable, hasValue: param !== undefined && track.params[param] !== undefined },
        {
          editValue: onEditValue,
          showInInspector,
          remove: () => {
            if (param) dispatch({ type: "track/setParam", trackId: track.id, param, value: null });
          },
        },
      ),
    };
  });
  return (
    <li className={styles["insert"]} title={item.code} {...menu}>
      {children}
    </li>
  );
}

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
          <InsertRow key={item.key} track={track} item={item} onEditValue={() => startEdit(item)}>
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
          </InsertRow>
        );
      })}
    </ul>
  );
}
