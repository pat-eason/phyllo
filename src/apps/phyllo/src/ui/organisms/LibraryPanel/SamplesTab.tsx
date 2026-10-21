import type { UiMode } from "@phyllo/model";
import { Button, EmptyState, Icon, IconButton, StatusDot } from "@phyllo/ui";
import type { StatusDotStatus } from "@phyllo/ui";
import { useId, useState } from "react";
import { GroupHeading, SampleList } from "./parts";
import { shortPath } from "./soundRefs";
import type { LinkedFolder, SampleFolders } from "./useSampleFolders";
import type { LibraryActions } from "./useLibraryActions";
import styles from "./LibraryPanel.module.css";

/** Files listed per folder before "Show all". */
const FILE_PAGE = 60;

export interface SamplesTabProps {
  mode: UiMode;
  query: string;
  actions: LibraryActions;
  samples: SampleFolders;
  onClearSearch(): void;
}

const STATUS: Record<LinkedFolder["scan"]["status"], { dot: StatusDotStatus; label: string }> = {
  loading: { dot: "busy", label: "Scanning" },
  ready: { dot: "ok", label: "Watching" },
  error: { dot: "warn", label: "Can't read this folder" },
};

interface FolderSectionProps {
  folder: LinkedFolder;
  mode: UiMode;
  query: string;
  actions: LibraryActions;
  onUnlink(): void;
}

function FolderSection({ folder, mode, query, actions, onUnlink }: FolderSectionProps) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const needle = query.trim().toLowerCase();
  const matches = needle ? folder.scan.files.filter((file) => file.name.toLowerCase().includes(needle)) : folder.scan.files;
  // A search opens the folders that have hits; otherwise the user's own toggle decides.
  const expanded = needle ? true : open;
  const visible = showAll ? matches : matches.slice(0, FILE_PAGE);
  if (needle && matches.length === 0 && folder.scan.status !== "loading") return null;
  const status = STATUS[folder.scan.status];
  const count = folder.scan.status === "loading" ? "…" : String(folder.scan.files.length);

  return (
    <li className={styles["folder"]}>
      <button
        type="button"
        className={styles["folderToggle"]}
        aria-expanded={expanded}
        aria-controls={listId}
        title={folder.path}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="folder" size={16} />
        <span className={styles["path"]}>{shortPath(folder.path)}</span>
        <span className={styles["count"]}>{count}</span>
        <Icon name="chevron-down" size={14} className={styles["chevron"]} data-open={expanded ? "" : undefined} />
      </button>
      <div className={styles["folderMeta"]}>
        <StatusDot status={status.dot} label={status.label} labelTone={status.dot === "ok" ? "accent" : "default"} />
        <IconButton icon="close" label={`Unlink ${folder.path}`} size={26} variant="plain" onClick={onUnlink} />
      </div>
      <div id={listId} hidden={!expanded}>
        {matches.length === 0 ? (
          <p className={styles["note"]}>{folder.scan.status === "loading" ? "Looking for audio files…" : "No audio files here."}</p>
        ) : (
          <>
            <SampleList label={`Samples in ${folder.path}`} files={visible} mode={mode} actions={actions} />
            {matches.length > visible.length ? (
              <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
                {`Show all ${matches.length} files`}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
}

/** Samples tab: the linked folders, each expandable to its files. Registering samples with the engine happens elsewhere. */
export function SamplesTab({ mode, query, actions, samples, onClearSearch }: SamplesTabProps) {
  const needle = query.trim().toLowerCase();
  const anyMatch = samples.folders.some((folder) => folder.scan.files.some((file) => file.name.toLowerCase().includes(needle)));

  let body;
  if (samples.folders.length === 0) {
    body = (
      <EmptyState
        compact
        title="No sample folders yet"
        body="Link a folder of .wav or .mp3 files and its sounds show up here."
      />
    );
  } else if (needle && !anyMatch && samples.folders.every((folder) => folder.scan.status !== "loading")) {
    body = (
      <EmptyState
        compact
        title={`No samples match “${query.trim()}”`}
        body="Check the spelling, or try part of the file name."
        action={{ label: "Clear search", onClick: onClearSearch }}
      />
    );
  } else {
    body = (
      <ul className={styles["folders"]}>
        {samples.folders.map((folder) => (
          <FolderSection
            key={folder.path}
            folder={folder}
            mode={mode}
            query={query}
            actions={actions}
            onUnlink={() => samples.unlink(folder.path)}
          />
        ))}
      </ul>
    );
  }

  return (
    <section className={styles["group"]} aria-label="Your folders">
      <GroupHeading>Your folders</GroupHeading>
      {body}
      <Button variant="dashed" size="sm" iconStart="plus" className={styles["linkButton"]} onClick={() => void samples.link()}>
        Link a folder…
      </Button>
    </section>
  );
}
