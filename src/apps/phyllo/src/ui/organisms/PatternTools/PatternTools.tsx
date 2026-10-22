import { bjorklund } from "@phyllo/engine";
import { CHEAT_SHEET, FEEL_TOOLS, createModifier, matchFeel } from "@phyllo/model";
import type { FeelTool, Track } from "@phyllo/model";
import { Button, IconButton, StepCell, Surface, Slider } from "@phyllo/ui";
import { useEffect, useId, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { useUiMode } from "../../../hooks";
import { deriveDrumGrid, usePatternEditor, useTrackEditor, withEuclid, writeSteps } from "../StepSequencer";
import type { TrackEditor } from "../StepSequencer";
import styles from "./PatternTools.module.css";

export interface PatternToolsProps extends Omit<ComponentPropsWithoutRef<"aside">, "children"> {
  /** Track to edit. Default: `PatternEditorProvider`'s track, else the selected track. */
  trackId?: string | null;
}

/** Euclid tool spreads hits over this many steps (each two sixteenths on the 16-step grid). */
const EUCLID_STEPS = 8;
const MIN_HITS = 1;
const MAX_HITS = 8;

function EuclidCard({ track, editor }: { track: Track | undefined; editor: TrackEditor }) {
  const { selectedRow, euclidHits: hits, setEuclidHits, registerEuclidFocus } = usePatternEditor();
  const hitsId = useId();
  const fewerRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  // "Euclid…" in a step row's menu lands here: the first hits button that can still be pressed.
  useEffect(
    () =>
      registerEuclidFocus(() => {
        const target = moreRef.current?.disabled ? fewerRef.current : moreRef.current;
        target?.focus();
      }),
    [registerEuclidFocus],
  );
  const grid = track?.kind === "drum" ? deriveDrumGrid(track.pattern, track.params.gain, selectedRow ? [selectedRow] : []) : null;
  const rows = grid?.ok ? grid.rows : [];
  const row = rows.find((r) => r.sound === selectedRow) ?? rows.find((r) => r.steps.some(Boolean)) ?? rows[0];
  const preview = bjorklund(hits, EUCLID_STEPS);
  const color = row?.color ?? "var(--ph-accent)";

  let note: string | null = null;
  if (!track) note = "Select a track first.";
  else if (track.kind !== "drum") note = "Works on drum rows. Open a drum track to use it.";
  else if (grid && !grid.ok) note = "This pattern can't be shown as steps, so there's no row to fill.";

  function apply() {
    const t = editor.current();
    if (!t || !row) return;
    const live = deriveDrumGrid(t.pattern, t.params.gain, [row.sound]);
    if (!live.ok) return;
    editor.write(writeSteps(withEuclid(live.rows, row.sound, hits, EUCLID_STEPS), t.params.gain));
  }

  return (
    <Surface as="section" material="plate" className={styles["card"]} aria-labelledby={`${hitsId}-title`}>
      <div className={styles["cardHead"]}>
        <h3 id={`${hitsId}-title`} className={styles["cardTitle"]}>
          Spread hits evenly
        </h3>
        {row ? <code className={styles["accentCode"]}>{`${row.sound}(${hits},${EUCLID_STEPS})`}</code> : null}
      </div>
      <p className={styles["explain"]}>
        Euclidean rhythm: place N hits as evenly as possible across 8 steps. Many classic grooves fall out of this.
      </p>
      <div className={styles["hitsRow"]}>
        <span id={hitsId} className={styles["legend"]}>
          Hits
        </span>
        <div role="group" aria-labelledby={hitsId} className={styles["stepper"]}>
          <IconButton
            ref={fewerRef}
            icon="minus"
            label="Fewer hits"
            size={32}
            disabled={hits <= MIN_HITS}
            onClick={() => setEuclidHits(Math.max(MIN_HITS, hits - 1))}
          />
          <output className={styles["hits"]} aria-live="polite">
            {hits}
          </output>
          <IconButton
            ref={moreRef}
            icon="plus"
            label="More hits"
            size={32}
            disabled={hits >= MAX_HITS}
            onClick={() => setEuclidHits(Math.min(MAX_HITS, hits + 1))}
          />
        </div>
      </div>
      <div className={styles["preview"]} aria-hidden="true">
        {preview.map((on, i) => (
          <StepCell
            key={i}
            className={styles["previewCell"]}
            readOnly
            tabIndex={-1}
            index={i}
            rowLabel="Preview"
            color={color}
            on={on}
            onChange={() => {}}
          />
        ))}
      </div>
      <Button variant="primary" size="lg" className={styles["apply"]} disabled={note !== null || !row} onClick={apply}>
        {row ? `Apply to ${row.label}` : "Apply"}
      </Button>
      {note ? <p className={styles["explain"]}>{note}</p> : null}
    </Surface>
  );
}

function feelValue(track: Track | undefined, tool: FeelTool): number {
  for (const m of track?.modifiers ?? []) {
    const hit = matchFeel(m.code);
    if (hit && hit.id === tool.id && m.enabled) return hit.value;
  }
  return tool.off;
}

function FeelCard({ track, editor }: { track: Track | undefined; editor: TrackEditor }) {
  const { mode } = useUiMode();
  const dragging = useRef(false);
  const disabled = !track || track.kind === "code";

  function setFeel(tool: FeelTool, value: number) {
    const t = editor.current();
    if (!t) return;
    const code = tool.codeFor(value);
    const existing = t.modifiers.find((m) => matchFeel(m.code)?.id === tool.id);
    const dispatch = editor.dispatch;
    if (code === "") {
      if (existing) dispatch({ type: "modifier/remove", trackId: t.id, modifierId: existing.id });
    } else if (existing) {
      if (existing.code !== code || !existing.enabled) {
        dispatch({ type: "modifier/update", trackId: t.id, modifierId: existing.id, patch: { code, enabled: true } });
      }
    } else {
      dispatch({ type: "modifier/add", trackId: t.id, modifier: createModifier(code, { origin: "feel", label: tool.label }) });
    }
  }

  const start = () => {
    if (dragging.current) return;
    dragging.current = true;
    editor.beginGesture();
  };
  const end = () => {
    if (!dragging.current) return;
    dragging.current = false;
    editor.endGesture();
  };

  return (
    <Surface as="section" material="plate" className={styles["card"]} aria-label="Feel">
      <h3 className={styles["cardTitle"]}>Feel</h3>
      {FEEL_TOOLS.map((tool) => {
        const value = feelValue(track, tool);
        const code = tool.codeFor(value);
        return (
          <div key={tool.id} className={styles["feel"]}>
            <div className={styles["feelHead"]}>
              <span className={styles["feelLabel"]}>{tool.label}</span>
              <code className={styles["feelCode"]} data-off={code ? undefined : ""}>
                {code || "off"}
              </code>
            </div>
            <Slider
              width="fill"
              label={tool.label}
              min={tool.min}
              max={tool.max}
              step={tool.step}
              value={value}
              disabled={disabled}
              valueText={(v) => tool.describe(v)}
              onChange={(v) => setFeel(tool, v)}
              onPointerDown={start}
              onPointerUp={end}
              onPointerCancel={end}
              onBlur={end}
            />
            {mode === "guided" ? <p className={styles["explain"]}>{tool.describe(value)}</p> : null}
          </div>
        );
      })}
    </Surface>
  );
}

function CheatSheet() {
  const id = useId();
  return (
    <Surface as="section" material="plate" className={styles["card"]} aria-labelledby={id}>
      <h3 id={id} className={styles["cardTitle"]}>
        Mini-notation, quickly
      </h3>
      <dl className={styles["cheat"]}>
        {CHEAT_SHEET.map((entry) => (
          <div key={entry.id} className={styles["cheatRow"]}>
            <dt className={styles["cheatToken"]}>{entry.token}</dt>
            <dd className={styles["cheatMeaning"]}>{entry.meaning}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  );
}

/**
 * Pattern editor tools panel: Euclid fill for the selected drum row, Feel sliders that write modifiers for the
 * whole track, and the mini-notation cheat sheet (SPEC §6.3).
 */
export function PatternTools({ trackId, className, ...rest }: PatternToolsProps) {
  const editor = useTrackEditor(trackId);
  const classes = [styles["root"], className].filter(Boolean).join(" ");
  return (
    <aside aria-label="Pattern tools" className={classes} {...rest}>
      <EuclidCard track={editor.track} editor={editor} />
      <FeelCard track={editor.track} editor={editor} />
      <CheatSheet />
    </aside>
  );
}
