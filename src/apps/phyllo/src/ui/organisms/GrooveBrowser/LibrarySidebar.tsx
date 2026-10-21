import { Icon, TextField } from "@phyllo/ui";
import type { LibraryCollection, TagInfo } from "@phyllo/model";
import { tagColor } from "@phyllo/model";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { grooveCount } from "./format";
import styles from "./LibrarySidebar.module.css";
import { cleanTag } from "./tags";

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
}: LibrarySidebarProps) {
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
            const pressed = selectedTags.some((t) => t.toLowerCase() === tag.name.toLowerCase());
            return (
              <li key={tag.name}>
                <button
                  type="button"
                  className={styles["tag"]}
                  aria-pressed={pressed}
                  onClick={() => onToggleTag(tag.name)}
                >
                  <span className={styles["dot"]} style={{ background: tag.color }} aria-hidden="true" />
                  <span className={styles["tagName"]}>{tag.name}</span>
                  {" "}
                  <span className={styles["count"]}>{tag.count}</span>
                  {" "}
                  <span className={styles["countUnit"]}>{tag.count === 1 ? "groove" : "grooves"}</span>
                </button>
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
