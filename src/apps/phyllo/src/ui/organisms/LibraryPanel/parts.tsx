import { SOUND_DRAG_MIME, Chip, SoundRow } from "@phyllo/ui";
import type { SoundRef } from "@phyllo/ui";
import { baseName, drumPreview, drumRef, notePreview, sampleRef, synthRef } from "./soundRefs";
import type { DrumSound, InstrumentSound, SynthSound, UiMode } from "@phyllo/model";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import type { SampleFile } from "../../../native/types";
import type { LibraryActions } from "./useLibraryActions";
import styles from "./LibraryPanel.module.css";

/** Uppercase section label. */
export function GroupHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 className={styles["heading"]} id={id}>
      {children}
    </h3>
  );
}

/** Keyboard alternative to drag: Enter inserts (the chip is a button, so Space and click preview). */
function insertOnEnter(onInsert: () => void) {
  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    event.preventDefault();
    onInsert();
  };
}

function startDrag(ref: SoundRef) {
  return (event: DragEvent<HTMLElement>) => {
    event.dataTransfer.setData(SOUND_DRAG_MIME, JSON.stringify(ref));
    event.dataTransfer.setData("text/plain", ref.name);
    event.dataTransfer.effectAllowed = "copy";
  };
}

export interface SoundChipProps {
  entry: SynthSound | InstrumentSound;
  actions: LibraryActions;
}

/** Synth (code name, mono) or instrument (friendly name) chip: click or Space previews, Enter inserts, drag adds. */
export function SoundChip({ entry, actions }: SoundChipProps) {
  const ref = synthRef(entry);
  const key = `${ref.source}:${entry.code}`;
  const previewing = actions.previewingKey === key;
  const isSynth = entry.group === "synth";
  return (
    <li className={styles["chipItem"]}>
      <Chip
        variant="code"
        className={styles["soundChip"]}
        data-instrument={isSynth ? undefined : ""}
        data-previewing={previewing ? "" : undefined}
        title={isSynth ? `${entry.name}: ${entry.description}` : entry.code}
        aria-roledescription="draggable sound"
        draggable
        onDragStart={startDrag(ref)}
        onKeyDown={insertOnEnter(() => actions.insertSound(ref))}
        onClick={() => actions.preview(key, notePreview(entry))}
      >
        {isSynth ? entry.code : entry.name}
      </Chip>
    </li>
  );
}

export interface ChipListProps {
  label: string;
  entries: readonly (SynthSound | InstrumentSound)[];
  actions: LibraryActions;
}

export function ChipList({ label, entries, actions }: ChipListProps) {
  return (
    <ul className={styles["chips"]} aria-label={label}>
      {entries.map((entry) => (
        <SoundChip key={entry.code} entry={entry} actions={actions} />
      ))}
    </ul>
  );
}

export interface DrumListProps {
  sounds: readonly DrumSound[];
  /** Bank for a sound; a function because search results can span banks. */
  bankFor(sound: DrumSound): string;
  mode: UiMode;
  actions: LibraryActions;
  label: string;
}

export function DrumList({ sounds, bankFor, mode, actions, label }: DrumListProps) {
  return (
    <ul className={styles["rows"]} aria-label={label}>
      {sounds.map((sound) => {
        const bank = bankFor(sound);
        const ref = drumRef(sound, bank);
        const key = `bank:${bank}:${sound.code}`;
        return (
          <SoundRow
            key={sound.code}
            code={sound.code}
            friendly={sound.name}
            mode={mode}
            previewing={actions.previewingKey === key}
            onPreview={() => actions.preview(key, drumPreview(sound, bank))}
            dragData={ref}
            onInsert={() => actions.insertSound(ref)}
          />
        );
      })}
    </ul>
  );
}

export interface SampleListProps {
  files: readonly SampleFile[];
  mode: UiMode;
  actions: LibraryActions;
  label: string;
}

export function SampleList({ files, mode, actions, label }: SampleListProps) {
  return (
    <ul className={styles["rows"]} aria-label={label}>
      {files.map((file) => {
        const ref = sampleRef(file);
        const key = `sample:${file.path}`;
        return (
          <SoundRow
            key={file.path}
            code={file.name}
            friendly={baseName(file.path)}
            mode={mode}
            previewing={actions.previewingKey === key}
            onPreview={() => actions.preview(key, { s: file.name })}
            dragData={ref}
            onInsert={() => actions.insertSound(ref)}
          />
        );
      })}
    </ul>
  );
}
