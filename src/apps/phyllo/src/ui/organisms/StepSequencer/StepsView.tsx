import { drumSoundsFor } from "@phyllo/model";
import { Select, StepRow } from "@phyllo/ui";
import type { StepRowHandle } from "@phyllo/ui";
import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useStore } from "zustand";
import { isContextMenuKey, useAppStores, useContextMenu, useEngine } from "../../../hooks";
import type { ContextMenuRequest } from "../../../hooks";
import {
  KIT_ORDER,
  STEPS,
  canResetVelocities,
  deriveDrumGrid,
  drumLabel,
  drumRowMini,
  resetVelocities,
  shiftRow,
  withRowSteps,
  withStep,
  writeSteps,
  writeVelocities,
} from "./drumGrid";
import type { DrumGrid, DrumRow } from "./drumGrid";
import type { PatternEditorState } from "./editorContext";
import { stepRowMenuEntries } from "./stepMenus";
import type { TrackEditor } from "./useTrackEditor";
import { VelocityLane } from "./VelocityLane";
import styles from "./StepSequencer.module.css";

type OkGrid = Extract<DrumGrid, { ok: true }>;

export interface StepsViewProps {
  name: string;
  grid: OkGrid;
  bank: string | null;
  /** Sounds added with "+ Add sound" that aren't in the pattern yet. */
  extraSounds: readonly string[];
  onAddSound: (sound: string) => void;
  /** "Remove row" in a row's menu, after its steps are cleared: forget a sound added with "+ Add sound". */
  onRemoveSound: (sound: string) => void;
  selectedRow: string;
  onSelectRow: (sound: string) => void;
  editor: TrackEditor;
  /** Where "Euclid…" in a row's menu sends focus (the Pattern tools panel). */
  euclid: Pick<PatternEditorState, "canFocusEuclid" | "focusEuclid">;
}

const BEAT_LABELS = ["beat 1", "beat 2", "beat 3", "beat 4"];

/** Current 16th of the cycle (one cycle = one bar = the grid). */
function stepOf(cycle: number): number {
  const frac = ((cycle % 1) + 1) % 1;
  return Math.min(STEPS - 1, Math.floor(frac * STEPS + 1e-9));
}

/** Step grid for a drum track: StepRows, "+ Add sound", and the selected row's velocity lane. */
export function StepsView({ name, grid, bank, extraSounds, onAddSound, onRemoveSound, selectedRow, onSelectRow, editor, euclid }: StepsViewProps) {
  const stores = useAppStores();
  const contextMenu = useContextMenu();
  const { preview } = useEngine();
  const playing = useStore(stores.transport, (s) => s.playing);
  const handles = useRef(new Map<string, StepRowHandle>());
  const paint = useRef<{ sound: string; value: boolean } | null>(null);

  // Playhead: DOM writes through the StepRow handles, never a React render (design-system §5).
  useEffect(() => {
    const all = () => [...handles.current.values()];
    if (!playing) {
      for (const h of all()) h.setCurrentStep(null);
      return undefined;
    }
    const unsubscribe = stores.transport.getState().subscribePosition((pos) => {
      const step = stepOf(pos.cycle);
      for (const h of all()) h.setCurrentStep(step);
    });
    return () => {
      unsubscribe();
      for (const h of all()) h.setCurrentStep(null);
    };
  }, [playing, stores.transport]);

  useEffect(() => {
    const stop = () => {
      if (!paint.current) return;
      paint.current = null;
      editor.endGesture();
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [editor]);

  /** Reads the live grid so a paint stroke sees its own earlier writes. */
  function setStep(sound: string, step: number, on: boolean) {
    const t = editor.current();
    if (!t) return;
    const live = deriveDrumGrid(t.pattern, t.params.gain, extraSounds);
    if (!live.ok) return;
    const row = live.rows.find((r) => r.sound === sound);
    if (!row || row.steps[step] === on) return;
    editor.write(writeSteps(withStep(live.rows, sound, step, on), t.params.gain));
  }

  /** Rewrites the live grid (not the render snapshot) through `editor.write`: one undo step, pattern and gain together. */
  function editRows(change: (rows: DrumRow[]) => DrumRow[]) {
    const t = editor.current();
    if (!t) return;
    const live = deriveDrumGrid(t.pattern, t.params.gain, extraSounds);
    if (live.ok) editor.write(writeSteps(change(live.rows), t.params.gain));
  }

  function previewRow(sound: string) {
    preview({ s: sound, ...(bank ? { bank } : {}) }).catch(() => undefined);
  }

  /** The row menu for whatever was right-clicked (or has focus): selects the row first, like a click on its label. */
  function buildRowMenu(target: EventTarget | null): ContextMenuRequest | null {
    const rowElement = target instanceof Element ? target.closest('[role="row"]') : null;
    const sound = [...handles.current.entries()].find(([, handle]) => handle.element === rowElement)?.[0];
    const t = editor.current();
    if (!rowElement || sound === undefined || !t) return null;
    const live = deriveDrumGrid(t.pattern, t.params.gain, extraSounds);
    const row = live.ok ? live.rows.find((r) => r.sound === sound) : undefined;
    if (!row) return null;
    onSelectRow(sound);
    // The row's pressable buttons are its label, then the 16 cells.
    const buttons = [...rowElement.querySelectorAll("button[aria-pressed]")];
    const pressed = target instanceof Element ? buttons.findIndex((button) => button === target.closest("button")) : -1;
    return {
      label: `${row.label} row`,
      entries: stepRowMenuEntries(
        {
          label: row.label,
          steps: row.steps,
          step: pressed > 0 ? pressed - 1 : null,
          clipboard: stores.clipboard.getState().item,
          removable: !KIT_ORDER.some((kit) => kit === sound),
          euclidAvailable: euclid.canFocusEuclid(),
        },
        {
          preview: () => previewRow(sound),
          setStep: (step, on) => setStep(sound, step, on),
          setSteps: (steps) => editRows((rows) => withRowSteps(rows, sound, steps)),
          shift: (by) => editRows((rows) => shiftRow(rows, sound, by)),
          euclid: () => euclid.focusEuclid(),
          copy: (steps) => stores.clipboard.getState().copy({ kind: "steps", steps }),
          remove() {
            editRows((rows) => withRowSteps(rows, sound, new Array<boolean>(STEPS).fill(false)));
            onRemoveSound(sound);
          },
        },
      ),
    };
  }

  function handleResetVelocities(sound: string) {
    const t = editor.current();
    if (!t) return;
    const live = deriveDrumGrid(t.pattern, t.params.gain, extraSounds);
    if (!live.ok) return;
    const change = resetVelocities(live, sound, t.params.gain);
    if (change) editor.write(change);
  }

  function handleVelocity(sound: string, velocities: number[]) {
    const t = editor.current();
    if (!t) return;
    const live = deriveDrumGrid(t.pattern, t.params.gain, extraSounds);
    if (!live.ok) return;
    const change = writeVelocities(live, sound, velocities, t.params.gain);
    if (change) editor.write(change);
  }

  /**
   * Arrow keys move between the grid's toggles (label + 16 cells per row). A cell's own ←/→/Home/End are handled by
   * the StepRow (roving tabindex), so only what it leaves is handled here: ↑/↓ across rows and ←/→ from the label.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isContextMenuKey(event)) {
      const request = buildRowMenu(event.target);
      if (request && event.target instanceof Element) {
        event.preventDefault();
        event.stopPropagation();
        contextMenu.openAtElement(event.target, request);
      }
      return;
    }
    if (event.defaultPrevented) return;
    const keys: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const move = keys[event.key];
    if (!move) return;
    const rows = grid.rows.map((r) => [...(handles.current.get(r.sound)?.element?.querySelectorAll<HTMLButtonElement>("button[aria-pressed]") ?? [])]);
    const r = rows.findIndex((buttons) => buttons.includes(event.target as HTMLButtonElement));
    if (r < 0) return;
    const c = rows[r]?.indexOf(event.target as HTMLButtonElement) ?? -1;
    const target = rows[r + move[0]]?.[Math.min(STEPS, Math.max(0, c + move[1]))];
    if (!target) return;
    event.preventDefault();
    target.focus();
  }

  const selected = grid.rows.find((r) => r.sound === selectedRow) ?? grid.rows[0];
  const shown = new Set(grid.rows.map((r) => r.sound));
  const addable = drumSoundsFor(bank).filter((d) => !shown.has(d.code));

  return (
    <div className={styles["scroll"]}>
      <div className={styles["gridBox"]}>
        <div className={styles["beatLabels"]} aria-hidden="true">
          <span className={styles["labelSpacer"]} />
          <span className={styles["beats"]}>
            {BEAT_LABELS.map((b) => (
              <span key={b}>{b}</span>
            ))}
          </span>
          <span className={styles["writes"]}>writes</span>
        </div>
        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- focus lives on the cells inside */}
        <div
          role="grid"
          aria-label={`${name} steps`}
          className={styles["rows"]}
          onKeyDown={handleKeyDown}
          onContextMenu={(event) => {
            const request = buildRowMenu(event.target);
            if (request) contextMenu.openFromEvent(event, request);
          }}
        >
          {grid.rows.map((row) => (
            <StepRow
              key={row.sound}
              ref={(h) => {
                if (h) handles.current.set(row.sound, h);
                else handles.current.delete(row.sound);
              }}
              sound={row.sound}
              label={row.label}
              color={row.color}
              steps={row.steps}
              mini={drumRowMini(row) || null}
              selected={row.sound === selected?.sound}
              onSelect={() => onSelectRow(row.sound)}
              onPreview={() => previewRow(row.sound)}
              onToggleStep={(i) => {
                onSelectRow(row.sound);
                setStep(row.sound, i, !row.steps[i]);
              }}
              onPaintStart={(i, value) => {
                onSelectRow(row.sound);
                if (!paint.current) editor.beginGesture();
                paint.current = { sound: row.sound, value };
                setStep(row.sound, i, value);
              }}
              onPaintEnter={(i) => {
                if (paint.current?.sound === row.sound) setStep(row.sound, i, paint.current.value);
              }}
            />
          ))}
        </div>
        {addable.length > 0 ? (
          <div className={styles["addRow"]}>
            <Select<string>
              label="Add a sound row"
              size="sm"
              value=""
              options={[{ value: "", label: "+ Add sound" }, ...addable.map((d) => ({ value: d.code, label: `${drumLabel(d.code)} · ${d.code}` }))]}
              onChange={(code) => {
                if (code) onAddSound(code);
              }}
            />
          </div>
        ) : null}
        {selected ? (
          <VelocityLane
            label={selected.label}
            sound={selected.sound}
            color={selected.color}
            steps={selected.steps}
            velocities={selected.velocities}
            target={grid.velocityMode}
            onChange={(v) => handleVelocity(selected.sound, v)}
            canReset={canResetVelocities(grid, selected.sound)}
            onReset={() => handleResetVelocities(selected.sound)}
            onGestureStart={editor.beginGesture}
            onGestureEnd={editor.endGesture}
          />
        ) : null}
      </div>
    </div>
  );
}
