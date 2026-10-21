import { SOUND_DRAG_MIME, Chip, SoundRow } from "@phyllo/ui";
import type { SoundRef } from "@phyllo/ui";
import { baseName, drumPreview, drumRef, notePreview, sampleRef, synthRef } from "./soundRefs";
import type { DrumSound, InstrumentSound, SynthSound, UiMode } from "@phyllo/model";
import { useRef, useState } from "react";
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
        selected={previewing}
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

const ROVING_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

/**
 * Roving tabindex for a list of SoundRows: the list is one tab stop (the last row used), ↑/↓/Home/End move
 * between rows. Each row's preview button leaves the tab order (`previewTabbable={false}`); it stays clickable and
 * Space on the row previews.
 */
function useRovingRows(count: number) {
  const list = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(0, count - 1));

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const rows = list.current?.children;
    const row = event.target instanceof HTMLElement ? event.target : null;
    if (!rows || !row || row.parentElement !== list.current || !ROVING_KEYS.has(event.key)) return;
    const index = Array.prototype.indexOf.call(rows, row);
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else next = rows.length - 1;
    event.preventDefault();
    const target = rows[next];
    if (target instanceof HTMLElement) target.focus();
  }

  const rowProps = (index: number) => ({
    tabIndex: index === current ? 0 : -1,
    previewTabbable: false,
    onFocus: () => setActive(index),
  });
  return { list, onKeyDown, rowProps };
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
  const { list, onKeyDown, rowProps } = useRovingRows(sounds.length);
  return (
    // ↑/↓ move between the focusable rows (roving tabindex); the rows themselves are the interactive elements.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <ul ref={list} className={styles["rows"]} aria-label={label} onKeyDown={onKeyDown}>
      {sounds.map((sound, index) => {
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
            {...rowProps(index)}
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
  const { list, onKeyDown, rowProps } = useRovingRows(files.length);
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <ul ref={list} className={styles["rows"]} aria-label={label} onKeyDown={onKeyDown}>
      {files.map((file, index) => {
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
            {...rowProps(index)}
          />
        );
      })}
    </ul>
  );
}
