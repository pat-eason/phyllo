import { Button, Select, TextField } from "@phyllo/ui";
import type { TagInfo } from "@phyllo/model";
import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Dialog } from "./Dialog";
import styles from "./Dialogs.module.css";
import { grooveCount } from "./format";
import { cleanTag, sameTag } from "./tags";
import { useGuardedAction } from "./useGuardedAction";

export interface ManageTagsDialogProps {
  tags: TagInfo[];
  /** Rewrites `from` in every groove that has it: `to` renames or merges, null deletes. Resolves with an error or null. */
  onRewrite: (from: string, to: string | null) => Promise<string | null>;
  onClose: () => void;
}

type Panel = { tag: string; mode: "rename" | "merge" | "delete" };

const COLOR_UNAVAILABLE = "Tag colors come from the tag's name, so they can't be changed yet.";

/**
 * Rename, merge or delete a tag across every file that uses it. Recolor is shown disabled: a tag's color is derived
 * from its name (`tagColor`) and the file format has no field to store a chosen one.
 */
export function ManageTagsDialog({ tags, onRewrite, onClose }: ManageTagsDialogProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [draft, setDraft] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const action = useGuardedAction();

  function open(tag: string, mode: Panel["mode"]) {
    action.clearError();
    setPanel({ tag, mode });
    setDraft(tag);
    setMergeInto(tags.find((t) => !sameTag(t.name, tag))?.name ?? "");
  }

  async function apply(from: string, to: string | null) {
    const done = await action.run(() => onRewrite(from, to));
    if (done) setPanel(null);
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>, from: string) {
    if (event.key === "Enter") {
      event.preventDefault();
      const name = cleanTag(draft);
      if (name !== "") void apply(from, name);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setPanel(null);
    }
  }

  return (
    <Dialog
      title="Manage tags"
      description="Changes are written into every groove file that uses the tag."
      onClose={onClose}
      width={520}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      {tags.length === 0 ? <p className={styles["muted"]}>No tags yet. Tag a groove first.</p> : null}
      <ul className={styles["tagList"]}>
        {tags.map((tag) => {
          const active = panel !== null && sameTag(panel.tag, tag.name) ? panel : null;
          const others = tags.filter((t) => !sameTag(t.name, tag.name));
          return (
            <li key={tag.name} className={styles["tagItem"]}>
              <div className={styles["tagRow"]}>
                <span className={styles["dot"]} style={{ background: tag.color }} aria-hidden="true" />
                <span className={styles["tagName"]}>{tag.name}</span>
                <span className={styles["muted"]}>{grooveCount(tag.count)}</span>
                <span className={styles["tagActions"]}>
                  <Button size="sm" variant="ghost" aria-label={`Rename ${tag.name}`} onClick={() => open(tag.name, "rename")}>
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Merge ${tag.name} into another tag`}
                    disabled={others.length === 0}
                    onClick={() => open(tag.name, "merge")}
                  >
                    Merge
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Recolor ${tag.name}`} disabled title={COLOR_UNAVAILABLE}>
                    Color
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Delete ${tag.name}`} onClick={() => open(tag.name, "delete")}>
                    Delete
                  </Button>
                </span>
              </div>
              {active?.mode === "rename" ? (
                <div className={styles["panel"]}>
                  <TextField
                    label={`New name for ${tag.name}`}
                    labelPosition="top"
                    value={draft}
                    onChange={setDraft}
                    onKeyDown={(event) => handleRenameKeyDown(event, tag.name)}
                    description="Using an existing tag's name merges the two."
                  />
                  <div className={styles["panelActions"]}>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={cleanTag(draft) === "" || cleanTag(draft) === tag.name || action.pending}
                      onClick={() => void apply(tag.name, cleanTag(draft))}
                    >
                      Rename tag
                    </Button>
                  </div>
                </div>
              ) : null}
              {active?.mode === "merge" ? (
                <div className={styles["panel"]}>
                  <Select
                    label={`Merge ${tag.name} into`}
                    labelPosition="top"
                    value={mergeInto}
                    options={others.map((t) => ({ value: t.name, label: t.name }))}
                    onChange={setMergeInto}
                  />
                  <div className={styles["panelActions"]}>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="primary" disabled={mergeInto === "" || action.pending} onClick={() => void apply(tag.name, mergeInto)}>
                      Merge tags
                    </Button>
                  </div>
                </div>
              ) : null}
              {active?.mode === "delete" ? (
                <div className={styles["panel"]}>
                  <p className={styles["confirmText"]}>
                    Remove {tag.name} from {grooveCount(tag.count)}? The grooves stay; only the tag goes.
                  </p>
                  <div className={styles["panelActions"]}>
                    <Button size="sm" variant="ghost" onClick={() => setPanel(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" className={styles["danger"]} disabled={action.pending} onClick={() => void apply(tag.name, null)}>
                      Delete tag
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {action.pending ? (
        <p className={styles["muted"]} role="status">
          Updating files...
        </p>
      ) : null}
      {action.error ? (
        <p className={styles["error"]} role="alert">
          {action.error}
        </p>
      ) : null}
    </Dialog>
  );
}
