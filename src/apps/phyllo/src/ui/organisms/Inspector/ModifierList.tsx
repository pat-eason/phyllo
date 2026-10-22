import { cloneModifier, searchModifiers } from "@phyllo/model";
import type { Modifier, Track } from "@phyllo/model";
import { IconButton, ModifierRow } from "@phyllo/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import { clipboardOf, useAppStores, useContextMenuTrigger } from "../../../hooks";
import { SearchPopover } from "./SearchPopover";
import type { SearchItem } from "./SearchPopover";
import { MODIFIER_DRAG_MIME, modifierDescription, readModifierDrag } from "./inspectorModel";
import { modifierMenuEntries, modifierSectionMenuEntries } from "./inspectorMenus";
import type { InspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

export interface ModifierListProps {
  track: Track;
  actions: InspectorActions;
}

const itemsFor = (query: string): SearchItem[] =>
  searchModifiers(query).map((m) => ({ key: m.name, code: m.template, text: m.description }));

/** Text fields (the inline code editor, the "+" search) keep the browser's own text menu. */
const isTextField = (target: EventTarget): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

/**
 * Pro "Modifiers · applied in order": reorderable chain (drag the handle, ⌥↑/⌥↓), on/off switch, inline code
 * edit, remove; "+" searches the Strudel function catalog or takes free text. Accepts dropped modifier templates.
 * Right-click a row for its menu, the header or empty area for Add / Paste.
 */
export function ModifierList({ track, actions }: ModifierListProps) {
  const stores = useAppStores();
  const [adding, setAdding] = useState(false);
  const [dropping, setDropping] = useState(false);
  /** Bumped per "Edit code" so the row's inline editor opens, like a double-click. */
  const [editRequest, setEditRequest] = useState<{ id: string; count: number } | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const headingId = useId();
  const mods = track.modifiers;
  // ModifierRow keeps the onMove it had when a handle drag started; read the current order at call time.
  const latest = useRef(mods);
  useLayoutEffect(() => {
    latest.current = mods;
  });

  function move(modifierId: string, delta: number) {
    const current = latest.current;
    const from = current.findIndex((m) => m.id === modifierId);
    const to = Math.max(0, Math.min(current.length - 1, from + delta));
    if (from !== -1 && to !== from) {
      actions.moveModifier(modifierId, to);
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      latest.current = next;
    }
  }

  const sectionMenu = useContextMenuTrigger(() => {
    const pasted = clipboardOf(stores.clipboard.getState().item, "modifier")?.modifier ?? null;
    return {
      label: "Modifiers",
      entries: modifierSectionMenuEntries(pasted, {
        paste: () => {
          if (pasted) actions.insertModifier(cloneModifier(pasted));
        },
        add: () => setAdding(true),
      }),
      returnFocus: addButton.current,
    };
  });

  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(MODIFIER_DRAG_MIME);

  return (
    // The whole section takes drops, so the empty-state hint is a target too (the empty list has no height).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Shift+F10 reaches the menu from the controls inside
    <section
      className={styles["section"]}
      aria-labelledby={headingId}
      onContextMenu={(event: MouseEvent<HTMLElement>) => {
        if (!isTextField(event.target)) sectionMenu.onContextMenu(event);
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (!isTextField(event.target)) sectionMenu.onKeyDown(event);
      }}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dropping) setDropping(true);
      }}
      onDragLeave={(event) => {
        const to = event.relatedTarget;
        if (to instanceof Node && event.currentTarget.contains(to)) return;
        setDropping(false);
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setDropping(false);
        const dropped = readModifierDrag(event.dataTransfer.getData(MODIFIER_DRAG_MIME));
        if (dropped) actions.addModifier(dropped.code, { ...(dropped.label ? { label: dropped.label } : {}), origin: "user" });
      }}
    >
      <div className={styles["sectionHead"]}>
        <h3 id={headingId} className={styles["legend"]}>
          Modifiers · applied in order
        </h3>
        <span className={styles["anchor"]}>
          <IconButton
            ref={addButton}
            icon="plus"
            size={26}
            label="Add modifier"
            aria-haspopup="dialog"
            aria-expanded={adding}
            onClick={() => setAdding((a) => !a)}
          />
          {adding ? (
            <SearchPopover
              label="Add a modifier"
              searchLabel="Search Strudel functions"
              placeholder="Search functions, e.g. fast"
              itemsFor={itemsFor}
              onPick={(item) => actions.addModifier(item.code, { label: item.text, origin: "user" })}
              freeText={{ label: "Use as typed", onPick: (code) => actions.addModifier(code, { origin: "user" }) }}
              onClose={() => setAdding(false)}
              returnFocus={addButton}
            />
          ) : null}
        </span>
      </div>
      <div
        role="list"
        aria-labelledby={headingId}
        className={styles["modifiers"]}
        data-dropping={dropping && mods.length > 0 ? "" : undefined}
      >
        {mods.map((m, index) => (
          <ModifierItem
            key={m.id}
            modifier={m}
            index={index}
            count={mods.length}
            track={track}
            actions={actions}
            editRequest={editRequest?.id === m.id ? editRequest.count : 0}
            onMove={(delta) => move(m.id, delta)}
            onRequestEdit={() => setEditRequest((r) => ({ id: m.id, count: (r?.count ?? 0) + 1 }))}
          />
        ))}
      </div>
      {mods.length === 0 ? (
        <p className={styles["emptyMods"]} data-dropping={dropping ? "" : undefined}>No modifiers yet. Add one with + or drop one from the library.</p>
      ) : null}
    </section>
  );
}

interface ModifierItemProps {
  modifier: Modifier;
  index: number;
  count: number;
  track: Track;
  actions: InspectorActions;
  editRequest: number;
  onMove: (delta: number) => void;
  onRequestEdit: () => void;
}

/** One chain row with its right-click menu. */
function ModifierItem({ modifier, index, count, track, actions, editRequest, onMove, onRequestEdit }: ModifierItemProps) {
  const stores = useAppStores();
  const menu = useContextMenuTrigger(() => {
    const { project } = stores.project.getState();
    const pasted = clipboardOf(stores.clipboard.getState().item, "modifier")?.modifier ?? null;
    return {
      label: `Modifier ${modifier.code}`,
      entries: modifierMenuEntries(
        {
          modifier,
          index,
          count,
          pasted,
          otherTracks: project.tracks.filter((t) => t.id !== track.id && t.kind !== "code").map((t) => ({ id: t.id, name: t.name })),
        },
        {
          setEnabled: (enabled) => actions.updateModifier(modifier.id, { enabled }),
          edit: onRequestEdit,
          move: onMove,
          duplicate: () => actions.insertModifier(cloneModifier(modifier), index + 1),
          copy: () => stores.clipboard.getState().copy({ kind: "modifier", modifier }),
          paste: () => {
            if (pasted) actions.insertModifier(cloneModifier(pasted), index + 1);
          },
          copyToTrack: (trackId) => actions.copyModifierToTrack(trackId, modifier),
          remove: () => actions.removeModifier(modifier.id),
        },
      ),
    };
  });

  return (
    <ModifierRow
      code={modifier.code}
      description={modifierDescription(modifier)}
      enabled={modifier.enabled}
      onEnabledChange={(enabled) => actions.updateModifier(modifier.id, { enabled })}
      onMove={onMove}
      onEdit={(code) => actions.updateModifier(modifier.id, { code })}
      onRemove={() => actions.removeModifier(modifier.id)}
      editRequest={editRequest}
      onContextMenu={(event) => {
        if (!isTextField(event.target)) menu.onContextMenu(event);
      }}
      onKeyDown={(event) => {
        if (!isTextField(event.target)) menu.onKeyDown(event);
      }}
    />
  );
}
