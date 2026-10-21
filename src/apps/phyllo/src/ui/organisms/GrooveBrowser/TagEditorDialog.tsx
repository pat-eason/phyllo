import { Button, Chip, TextField } from "@phyllo/ui";
import type { GrooveSummary } from "@phyllo/model";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Dialog } from "./Dialog";
import styles from "./Dialogs.module.css";
import { cleanTag, hasTag, parseTagInput, unionTags } from "./tags";
import { useGuardedAction } from "./useGuardedAction";

export interface TagEditorDialogProps {
  /** One groove: edit its tags. Several: add tags to all of them. */
  targets: GrooveSummary[];
  /** Existing and pending tag names offered as one-click chips. */
  suggestions: string[];
  /** Receives the final list (single) or the tags to add (bulk); resolves with an error message or null. */
  onSave: (tags: string[]) => Promise<string | null>;
  onClose: () => void;
}

/** Edit Tags (single groove) or "add tags to N grooves" (bulk). Typed text commits on Enter or comma. */
export function TagEditorDialog({ targets, suggestions, onSave, onClose }: TagEditorDialogProps) {
  const bulk = targets.length > 1;
  const [tags, setTags] = useState<string[]>(() => (bulk ? [] : [...(targets[0]?.tags ?? [])]));
  const [draft, setDraft] = useState("");
  const action = useGuardedAction();

  const finalTags = unionTags(tags, parseTagInput(draft));

  function commitDraft() {
    setTags(finalTags);
    setDraft("");
  }

  function toggle(tag: string) {
    setTags((current) => (hasTag(current, tag) ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase()) : [...current, tag]));
  }

  async function save() {
    const saved = await action.run(() => onSave(finalTags));
    if (saved) onClose();
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (cleanTag(draft) === "") void save();
      else commitDraft();
    } else if (event.key === "," ) {
      event.preventDefault();
      commitDraft();
    }
  }

  const title = bulk ? `Add tags to ${targets.length} grooves` : "Edit tags";
  const name = targets[0]?.name ?? "";
  const description = bulk ? "The tags are added to each groove and keep what it already has." : `For ${name}. Tags are saved inside the .phyllo file.`;
  const offered = suggestions.filter((s) => !hasTag(tags, s));
  const canSave = bulk ? finalTags.length > 0 : true;

  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!canSave || action.pending}>
            Save tags
          </Button>
        </>
      }
    >
      <TextField
        label="Add a tag"
        labelPosition="top"
        value={draft}
        onChange={setDraft}
        onKeyDown={handleDraftKeyDown}
        placeholder="Type a tag, press Enter"
        description="Separate several with commas."
      />
      <div className={styles["chipRow"]} role="group" aria-label={bulk ? "Tags to add" : "Tags on this groove"}>
        {tags.length === 0 ? <span className={styles["muted"]}>{bulk ? "Nothing to add yet." : "No tags yet."}</span> : null}
        {tags.map((tag) => (
          <Chip key={tag.toLowerCase()} variant="removable" size="sm" onRemove={() => toggle(tag)}>
            {tag}
          </Chip>
        ))}
      </div>
      {offered.length > 0 ? (
        <div className={styles["suggestions"]}>
          <span className={styles["sectionLabel"]}>Existing tags</span>
          <div className={styles["chipRow"]} role="group" aria-label="Existing tags">
            {offered.map((tag) => (
              <Chip key={tag.toLowerCase()} variant="filter" size="sm" selected={false} onClick={() => toggle(tag)}>
                {tag}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      {action.error ? (
        <p className={styles["error"]} role="alert">
          {action.error}
        </p>
      ) : null}
    </Dialog>
  );
}
