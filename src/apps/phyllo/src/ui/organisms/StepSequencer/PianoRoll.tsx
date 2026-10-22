import { StepCell, Switch } from "@phyllo/ui";
import { useState } from "react";
import type { CSSProperties } from "react";
import { useContextMenuTrigger } from "../../../hooks";
import { STEPS } from "./drumGrid";
import { pitchRows } from "./pitchGrid";
import { pianoCellMenuEntries } from "./stepMenus";
import styles from "./StepSequencer.module.css";

export interface PianoRollProps {
  /** One MIDI note (or null) per step. */
  notes: readonly (number | null)[];
  /** Project key, e.g. `A minor`. */
  keyName: string;
  color: string;
  /** Called with the new notes after a click (one note per step). */
  onChange: (notes: (number | null)[], added: number | null) => void;
}

const BEATS = [0, 1, 2, 3];

interface PianoCellProps {
  index: number;
  noteLabel: string;
  color: string;
  on: boolean;
  anyNotes: boolean;
  onToggle: () => void;
  onClearAll: () => void;
}

/** One piano-roll cell; its menu places or removes the note, or clears the roll. */
function PianoCell({ index, noteLabel, color, on, anyNotes, onToggle, onClearAll }: PianoCellProps) {
  const menu = useContextMenuTrigger(() => ({
    label: `${noteLabel} step ${index + 1}`,
    entries: pianoCellMenuEntries({ noteLabel, on, anyNotes }, { toggle: onToggle, clearAll: onClearAll }),
  }));
  return (
    <StepCell
      className={styles["pianoCell"]}
      index={index}
      rowLabel={noteLabel}
      color={color}
      on={on}
      beatStart={index % 4 === 0}
      onChange={onToggle}
      {...menu}
    />
  );
}

/** 16 steps × pitches of the project key (two octaves); click a cell to place or remove that step's note. */
export function PianoRoll({ notes, keyName, color, onChange }: PianoRollProps) {
  const [snap, setSnap] = useState(true);
  const rows = pitchRows(notes, keyName, snap);

  function toggle(midi: number, step: number) {
    const next = notes.slice();
    const removing = next[step] === midi;
    next[step] = removing ? null : midi;
    onChange(next, removing ? null : midi);
  }

  function clearAll() {
    onChange(new Array<null>(STEPS).fill(null), null);
  }

  const anyNotes = notes.some((note) => note !== null);

  return (
    <div className={styles["piano"]}>
      <div className={styles["pianoBar"]}>
        <span className={styles["pianoKey"]}>
          Key <strong>{keyName}</strong>
        </span>
        <Switch checked={snap} onChange={setSnap} label="Snap to key" size="sm" />
        <span className={styles["pianoSnapLabel"]} aria-hidden="true">
          Snap to key
        </span>
      </div>
      <div className={styles["scroll"]}>
        <div role="grid" aria-label="Piano roll" className={styles["pianoGrid"]} style={{ "--row-color": color } as CSSProperties}>
          {rows.map((row) => (
            <div key={row.midi} role="row" className={styles["pianoRow"]} data-root={row.root ? "" : undefined} data-off-key={row.inKey ? undefined : ""}>
              <div role="rowheader" className={styles["pianoLabel"]}>
                {row.label}
              </div>
              <div className={styles["pianoSteps"]}>
                {BEATS.map((beat) => (
                  <div key={beat} className={styles["pianoBeat"]}>
                    {BEATS.map((s) => {
                      const i = beat * 4 + s;
                      return (
                        <div key={i} role="gridcell" className={styles["pianoCellWrap"]}>
                          <PianoCell
                            index={i}
                            noteLabel={row.label}
                            color={color}
                            on={notes[i] === row.midi}
                            anyNotes={anyNotes}
                            onToggle={() => toggle(row.midi, i)}
                            onClearAll={clearAll}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className={styles["pianoNote"]}>One note per step · {STEPS} steps · writes note(&quot;…&quot;)</p>
    </div>
  );
}
