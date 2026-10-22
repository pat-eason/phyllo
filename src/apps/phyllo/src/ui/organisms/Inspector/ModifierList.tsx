import { searchModifiers } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import { IconButton, ModifierRow } from "@phyllo/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { SearchPopover } from "./SearchPopover";
import type { SearchItem } from "./SearchPopover";
import { MODIFIER_DRAG_MIME, modifierDescription, readModifierDrag } from "./inspectorModel";
import type { InspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

export interface ModifierListProps {
  track: Track;
  actions: InspectorActions;
}

const itemsFor = (query: string): SearchItem[] =>
  searchModifiers(query).map((m) => ({ key: m.name, code: m.template, text: m.description }));

/**
 * Pro "Modifiers · applied in order": reorderable chain (drag the handle, ⌥↑/⌥↓), on/off switch, inline code
 * edit, remove; "+" searches the Strudel function catalog or takes free text. Accepts dropped modifier templates.
 */
export function ModifierList({ track, actions }: ModifierListProps) {
  const [adding, setAdding] = useState(false);
  const [dropping, setDropping] = useState(false);
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

  const accepts = (event: DragEvent) => event.dataTransfer.types.includes(MODIFIER_DRAG_MIME);

  return (
    // The whole section takes drops, so the empty-state hint is a target too (the empty list has no height).
    <section
      className={styles["section"]}
      aria-labelledby={headingId}
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
        {mods.map((m) => (
          <ModifierRow
            key={m.id}
            code={m.code}
            description={modifierDescription(m)}
            enabled={m.enabled}
            onEnabledChange={(enabled) => actions.updateModifier(m.id, { enabled })}
            onMove={(delta) => move(m.id, delta)}
            onEdit={(code) => actions.updateModifier(m.id, { code })}
            onRemove={() => actions.removeModifier(m.id)}
          />
        ))}
      </div>
      {mods.length === 0 ? (
        <p className={styles["emptyMods"]} data-dropping={dropping ? "" : undefined}>No modifiers yet. Add one with + or drop one from the library.</p>
      ) : null}
    </section>
  );
}
