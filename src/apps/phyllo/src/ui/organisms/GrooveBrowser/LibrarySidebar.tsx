import { Icon, TextField } from "@phyllo/ui";
import type { LibraryCollection, TagInfo } from "@phyllo/model";
import { tagColor } from "@phyllo/model";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useContextMenuTrigger } from "../../../hooks";
import { grooveCount } from "./format";
import styles from "./LibrarySidebar.module.css";
import { cleanTag, sameTag } from "./tags";
import { tagMenuEntries } from "./tagMenu";
import type { TagMenuCommands } from "./tagMenu";

export interface LibrarySidebarProps {
  collection: LibraryCollection;
  counts: { all: number; favorites: number; recent: number };
  onCollectionChange: (collection: LibraryCollection) => void;
  tags: TagInfo[];
  /** Tags created with "New tag" that no groove uses yet. */
  pendingTags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onDismissPending: (tag: string) => void;
  /** Grooves selected in the list; a new tag is applied to them. */
  selectedGrooveCount: number;
  onCreateTag: (name: string) => void;
  onManageTags: () => void;
  /** Tag menu: Rename… and Delete… open Manage tags on that tag; Merge into rewrites it straight away. */
  onRenameTag: (tag: string) => void;
  onMergeTag: (tag: string, into: string) => void;
  onDeleteTag: (tag: string) => void;
}

interface TagButtonProps {
  tag: TagInfo;
  allTags: readonly string[];
  pressed: boolean;
  commands: TagMenuCommands;
}

/** One tag filter; right-click or Shift+F10 opens its menu. */
function TagButton({ tag, allTags, pressed, commands }: TagButtonProps) {
  const trigger = useContextMenuTrigger(() => ({
    label: `Tag ${tag.name}`,
    entries: tagMenuEntries(tag.name, allTags, pressed, commands),
  }));
  return (
    <button type="button" className={styles["tag"]} aria-pressed={pressed} onClick={() => commands.toggleFilter(tag.name)} {...trigger}>
      <span className={styles["dot"]} style={{ background: tag.color }} aria-hidden="true" />
      <span className={styles["tagName"]}>{tag.name}</span>
      {" "}
      <span className={styles["count"]}>{tag.count}</span>
      {" "}
      <span className={styles["countUnit"]}>{tag.count === 1 ? "groove" : "grooves"}</span>
    </button>
  );
}

const COLLECTIONS: { id: LibraryCollection; label: string; count: keyof LibrarySidebarProps["counts"] }[] = [
  { id: "all", label: "All grooves", count: "all" },
  { id: "favorites", label: "Favorites", count: "favorites" },
  { id: "recent", label: "Recent", count: "recent" },
];

/** Collections (radio-like), tag filters with color dots and counts, New tag, Manage. */
export function LibrarySidebar({
  collection,
  counts,
  onCollectionChange,
  tags,
  pendingTags,
  selectedTags,
  onToggleTag,
  onDismissPending,
  selectedGrooveCount,
  onCreateTag,
  onManageTags,
  onRenameTag,
  onMergeTag,
  onDeleteTag,
}: LibrarySidebarProps) {
  const tagCommands: TagMenuCommands = { toggleFilter: onToggleTag, rename: onRenameTag, merge: onMergeTag, delete: onDeleteTag };
  const tagNames = tags.map((t) => t.name);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const radioRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const newTagButton = useRef<HTMLButtonElement>(null);
  const draftInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) draftInput.current?.focus();
  }, [creating]);

  function handleRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + COLLECTIONS.length) % COLLECTIONS.length;
    const target = COLLECTIONS[next];
    if (!target) return;
    onCollectionChange(target.id);
    radioRefs.current[next]?.focus();
  }

  function finishCreating(commit: boolean) {
    const name = cleanTag(draft);
    if (commit && name !== "") onCreateTag(name);
    setCreating(false);
    setDraft("");
    requestAnimationFrame(() => newTagButton.current?.focus());
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      finishCreating(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finishCreating(false);
    }
  }

  const draftName = cleanTag(draft);
  const newTagHelp =
    selectedGrooveCount > 0
      ? `Adds ${draftName === "" ? "the tag" : draftName} to the ${grooveCount(selectedGrooveCount)} you selected.`
      : "No grooves selected. The tag waits here until a groove uses it: select rows in list view, or right-click a groove and choose Edit tags.";

  return (
    <aside className={styles["sidebar"]} aria-label="Collections and tags">
      <div className={styles["collections"]} role="radiogroup" aria-label="Collections">
        {COLLECTIONS.map((item, index) => {
          const checked = collection === item.id;
          return (
            <button
              key={item.id}
              ref={(node) => {
                radioRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              className={styles["collection"]}
              onClick={() => onCollectionChange(item.id)}
              onKeyDown={(event) => handleRadioKeyDown(event, index)}
            >
              {item.label}
              <span className={styles["count"]}>{counts[item.count]}</span>
            </button>
          );
        })}
      </div>

      <div className={styles["tagsSection"]}>
        <div className={styles["tagsHeader"]}>
          <h2 className={styles["tagsTitle"]}>Tags</h2>
          <button type="button" className={styles["manage"]} onClick={onManageTags} disabled={tags.length === 0}>
            Manage
          </button>
        </div>
        <ul className={styles["tagList"]}>
          {tags.map((tag) => {
            const pressed = selectedTags.some((t) => sameTag(t, tag.name));
            return (
              <li key={tag.name}>
                <TagButton tag={tag} allTags={tagNames} pressed={pressed} commands={tagCommands} />
              </li>
            );
          })}
          {pendingTags.map((name) => (
            <li key={`pending-${name}`} className={styles["pending"]}>
              <span className={styles["dot"]} style={{ background: tagColor(name) }} aria-hidden="true" />
              <span className={styles["tagName"]}>{name}</span>
              <span className={styles["count"]}>unused</span>
              <button type="button" className={styles["dismiss"]} aria-label={`Discard new tag ${name}`} onClick={() => onDismissPending(name)}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
        {creating ? (
          <div className={styles["newTagForm"]}>
            <TextField
              label="New tag name"
              value={draft}
              onChange={setDraft}
              onKeyDown={handleDraftKeyDown}
              onBlur={() => finishCreating(false)}
              placeholder="Tag name"
              description={newTagHelp}
              ref={draftInput}
            />
          </div>
        ) : (
          <button ref={newTagButton} type="button" className={styles["newTag"]} onClick={() => setCreating(true)}>
            <Icon name="plus" size={12} />
            New tag
          </button>
        )}
      </div>

      <p className={styles["footnote"]}>
        Grooves live as <span className={styles["mono"]}>.phyllo</span> files in ~/Music/Phyllo. Tags are saved inside each file, so they travel with it.
      </p>
    </aside>
  );
}
