import { MODIFIER_CATEGORIES, modifiersByCategory, searchModifiers } from "@phyllo/model";
import type { ModifierDef } from "@phyllo/model";
import { EmptyState, Icon, IconButton } from "@phyllo/ui";
import type { DragEvent, KeyboardEvent } from "react";
import { MODIFIER_DRAG_MIME } from "./dragTypes";
import type { ModifierDragPayload } from "./dragTypes";
import { GroupHeading } from "./parts";
import type { LibraryActions } from "./useLibraryActions";
import styles from "./LibraryPanel.module.css";

export interface SnippetsTabProps {
  query: string;
  /** A track is selected, so a snippet can be added to it. */
  hasSelection: boolean;
  actions: LibraryActions;
  onClearSearch(): void;
}

interface SnippetRowProps {
  def: ModifierDef;
  hasSelection: boolean;
  actions: LibraryActions;
}

function SnippetRow({ def, hasSelection, actions }: SnippetRowProps) {
  function handleDragStart(event: DragEvent<HTMLLIElement>) {
    const payload: ModifierDragPayload = { name: def.name, code: def.template, label: def.description };
    event.dataTransfer.setData(MODIFIER_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.setData("text/plain", def.template);
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.target !== event.currentTarget || event.key !== "Enter") return;
    event.preventDefault();
    actions.insertModifier(def);
  }

  return (
    // The row is draggable and takes Enter as the non-drag alternative, so it is deliberately focusable.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <li
      className={styles["snippet"]}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      draggable
      aria-roledescription="draggable snippet"
      aria-label={`${def.name}: ${def.description}`}
      onDragStart={handleDragStart}
      onKeyDown={handleKeyDown}
    >
      <span className={styles["snippetBody"]}>
        <code className={styles["snippetCode"]}>{def.template}</code>
        <span className={styles["snippetDescription"]}>{def.description}</span>
      </span>
      <IconButton
        icon="plus"
        size={26}
        variant="plain"
        label={hasSelection ? `Add ${def.template} to the selected track` : `Add ${def.template} (select a track first)`}
        disabled={!hasSelection}
        onClick={() => actions.insertModifier(def)}
      />
      <Icon name="drag" size={14} className={styles["snippetHandle"]} />
    </li>
  );
}

function SnippetList({ label, defs, hasSelection, actions }: { label: string; defs: readonly ModifierDef[] } & Omit<SnippetRowProps, "def">) {
  return (
    <ul className={styles["snippets"]} aria-label={label}>
      {defs.map((def) => (
        <SnippetRow key={def.name} def={def} hasSelection={hasSelection} actions={actions} />
      ))}
    </ul>
  );
}

/** Pro "Snippets" tab: the modifier catalog. Drag a row onto a track, or press Enter / + to add it to the selected track. */
export function SnippetsTab({ query, hasSelection, actions, onClearSearch }: SnippetsTabProps) {
  if (query.trim() !== "") {
    const found = searchModifiers(query);
    if (found.length === 0) {
      return (
        <EmptyState
          compact
          title={`No snippets match “${query.trim()}”`}
          body="Search matches function names, code and descriptions."
          action={{ label: "Clear search", onClick: onClearSearch }}
        />
      );
    }
    return <SnippetList label="Matching snippets" defs={found} hasSelection={hasSelection} actions={actions} />;
  }

  return (
    <>
      {MODIFIER_CATEGORIES.map((category) => {
        const defs = modifiersByCategory(category.id);
        return defs.length === 0 ? null : (
          <section key={category.id} className={styles["group"]} aria-label={category.label}>
            <GroupHeading>{category.label}</GroupHeading>
            <SnippetList label={category.label} defs={defs} hasSelection={hasSelection} actions={actions} />
          </section>
        );
      })}
    </>
  );
}
