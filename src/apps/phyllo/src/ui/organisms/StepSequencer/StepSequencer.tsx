import { DRUM_BANKS, friendlySoundName } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import { Button, PatternField, SegmentedControl, Select, Surface } from "@phyllo/ui";
import { useId, useState } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { useEngine, useProjectSelector, useUiMode } from "../../../hooks";
import { CodeView } from "./CodeView";
import { deriveDrumGrid } from "./drumGrid";
import type { DrumGrid } from "./drumGrid";
import { usePatternEditor } from "./editorContext";
import { parseSourceCall, sourceCall } from "./liveCode";
import { PianoRoll } from "./PianoRoll";
import { derivePianoRoll, pianoRollMini } from "./pitchGrid";
import { StepsView } from "./StepsView";
import { useTrackEditor } from "./useTrackEditor";
import type { TrackEditor } from "./useTrackEditor";
import styles from "./StepSequencer.module.css";

export type PatternEditorTab = "steps" | "piano" | "code";

export interface StepSequencerProps extends Omit<ComponentPropsWithoutRef<"section">, "children"> {
  /** Track to edit. Default: `PatternEditorProvider`'s track, else the selected track. */
  trackId?: string | null;
  /** Tab shown first. Default: Steps for drum tracks, Piano roll for note tracks, else Code. */
  defaultTab?: PatternEditorTab;
}

const TABS: { value: PatternEditorTab; label: string }[] = [
  { value: "steps", label: "Steps" },
  { value: "piano", label: "Piano roll" },
  { value: "code", label: "Code" },
];

const LIVE_SYNCED = "Synced both ways — edit the grid or the text";

function isPianoTrack(track: Track): boolean {
  return track.kind === "melodic" && track.source.type === "note";
}

function tabFor(track: Track): PatternEditorTab {
  if (track.kind === "drum") return "steps";
  if (isPianoTrack(track)) return "piano";
  return "code";
}

function subtitle(track: Track, grid: DrumGrid | null, key: string): string {
  if (track.kind === "drum") {
    const bank = DRUM_BANKS.find((b) => b.code === track.source.bank)?.name ?? track.source.bank;
    const sounding = grid?.ok ? grid.rows.filter((r) => r.steps.some(Boolean)).map((r) => r.label) : [];
    const what = sounding.length > 0 ? sounding.join(", ") : "Drums";
    return bank ? `${what} · ${bank}` : what;
  }
  if (track.kind === "code") return "Code track · edited as text";
  return `${friendlySoundName(track.source)} · ${key}`;
}

/** "This pattern can't be shown as steps": the text only, plus a way to start over on the grid. */
function UnfitNotice({ pattern, reason, detail, onReplace }: { pattern: string; reason: string; detail: string; onReplace: () => void }) {
  return (
    <div className={styles["unfit"]} role="status">
      <p className={styles["unfitTitle"]}>{reason}</p>
      <p className={styles["unfitDetail"]}>It {detail}. The code keeps playing as written.</p>
      <pre className={styles["unfitCode"]}>
        <code>{pattern}</code>
      </pre>
      <Button variant="secondary" size="sm" onClick={onReplace}>
        Replace with a step pattern
      </Button>
    </div>
  );
}

function LiveCode({ track, editor }: { track: Track; editor: TrackEditor }) {
  const { mode } = useUiMode();
  const [error, setError] = useState<string | undefined>(undefined);
  const value = sourceCall(track);
  if (value === null) return null;
  return (
    <Surface as="section" material="inset" radius="xl" aria-label="Live code" className={styles["live"]}>
      <PatternField
        variant="live"
        label="Live code"
        syncedNote={LIVE_SYNCED}
        value={value}
        mode={mode}
        spellCheck={false}
        error={error}
        onChange={(text) => {
          const parsed = parseSourceCall(text, track);
          setError(parsed.ok ? undefined : parsed.error);
        }}
        onCommit={(text) => {
          const parsed = parseSourceCall(text, track);
          if (!parsed.ok) {
            setError(parsed.error);
            return;
          }
          setError(undefined);
          editor.beginGesture();
          editor.write({ pattern: parsed.pattern });
          editor.setSource(parsed.source);
          editor.endGesture();
        }}
      />
    </Surface>
  );
}

function StepsTab({ track, editor }: { track: Track; editor: TrackEditor }) {
  const editorState = usePatternEditor();
  const { selectedRow, setSelectedRow } = editorState;
  const [extra, setExtra] = useState<{ trackId: string; sounds: string[] }>({ trackId: track.id, sounds: [] });
  const extraSounds = extra.trackId === track.id ? extra.sounds : [];

  if (track.kind !== "drum") {
    return (
      <p className={styles["muted"]}>
        The step grid edits drum tracks. {isPianoTrack(track) ? "Use the Piano roll for this track." : "Edit this track in the Code tab."}
      </p>
    );
  }
  const grid = deriveDrumGrid(track.pattern, track.params.gain, extraSounds);
  if (!grid.ok) {
    return <UnfitNotice pattern={track.pattern} reason={grid.reason} detail={grid.detail} onReplace={() => editor.write({ pattern: "~" })} />;
  }
  const fallback = grid.rows.find((r) => r.steps.some(Boolean)) ?? grid.rows[0];
  const selected = grid.rows.some((r) => r.sound === selectedRow) ? (selectedRow ?? "") : (fallback?.sound ?? "");
  return (
    <StepsView
      name={track.name}
      grid={grid}
      bank={track.source.bank}
      extraSounds={extraSounds}
      onAddSound={(sound) => {
        setExtra({ trackId: track.id, sounds: [...extraSounds, sound] });
        setSelectedRow(sound);
      }}
      onRemoveSound={(sound) => setExtra({ trackId: track.id, sounds: extraSounds.filter((s) => s !== sound) })}
      selectedRow={selected}
      onSelectRow={setSelectedRow}
      editor={editor}
      euclid={editorState}
    />
  );
}

function PianoTab({ track, editor, keyName }: { track: Track; editor: TrackEditor; keyName: string }) {
  const { preview } = useEngine();
  if (!isPianoTrack(track)) {
    return <p className={styles["muted"]}>The piano roll edits melodic note(&quot;…&quot;) tracks. Edit this track in the Code tab.</p>;
  }
  const roll = derivePianoRoll(track.pattern);
  if (!roll.ok) {
    return <UnfitNotice pattern={track.pattern} reason={roll.reason} detail={roll.detail} onReplace={() => editor.write({ pattern: "~" })} />;
  }
  return (
    <PianoRoll
      notes={roll.notes}
      keyName={keyName}
      color={track.color}
      onChange={(notes, added) => {
        editor.write({ pattern: pianoRollMini(notes, keyName) });
        if (added !== null && track.source.sound) {
          preview({ s: track.source.sound, note: added }).catch(() => {
            // Audition is best effort (audio may be blocked); the edit already landed.
          });
        }
      }}
    />
  );
}

function Header({ track, grid, keyName, tab, onTab, tabsId, editor }: {
  track: Track;
  keyName: string;
  grid: DrumGrid | null;
  tab: PatternEditorTab;
  onTab: (tab: PatternEditorTab) => void;
  tabsId: string;
  editor: TrackEditor;
}) {
  const bank = track.source.bank ?? "";
  const bankOptions = DRUM_BANKS.map((b) => ({ value: b.code, label: b.code, description: b.description }));
  if (bank && !bankOptions.some((o) => o.value === bank)) bankOptions.push({ value: bank, label: bank, description: "Custom bank" });
  return (
    <div className={styles["header"]}>
      <span className={styles["chip"]} style={{ background: track.color }} aria-hidden="true" />
      <div className={styles["titles"]}>
        <h2 className={styles["name"]}>{track.name}</h2>
        <span className={styles["subtitle"]}>{subtitle(track, grid, keyName)}</span>
      </div>
      <SegmentedControl<PatternEditorTab>
        id={tabsId}
        className={styles["tabs"]}
        semantics="tabs"
        label="Editor"
        options={TABS.map((t) => ({ ...t, controls: `${tabsId}-panel` }))}
        value={tab}
        onChange={onTab}
      />
      <span className={styles["grow"]} />
      <div className={styles["length"]} title="Patterns are one cycle long for now">
        <span className={styles["fieldLabel"]}>Length</span> 1 cycle · 16 steps
      </div>
      {track.kind === "drum" ? (
        <Select<string>
          label="Kit"
          labelPosition="inline"
          value={bank}
          options={bank ? bankOptions : [{ value: "", label: "Default" }, ...bankOptions]}
          onChange={(code) => editor.setSource({ bank: code || null })}
        />
      ) : null}
    </div>
  );
}

/**
 * Pattern editor main column: edits one track's pattern on a 16-step grid (drums), a piano roll (note tracks)
 * or as code, kept in sync with its mini-notation (SPEC §4.3, §6.3).
 */
export function StepSequencer({ trackId, defaultTab, className, ...rest }: StepSequencerProps) {
  const editor = useTrackEditor(trackId);
  const key = useProjectSelector((p) => p.key);
  const tabsId = useId().replace(/[^\w-]/g, "");
  const { track } = editor;
  const [tabState, setTabState] = useState<{ trackId: string | null; tab: PatternEditorTab | null }>({ trackId: null, tab: null });
  const classes = [styles["root"], className].filter(Boolean).join(" ");

  if (!track) {
    return (
      <section className={classes} {...rest}>
        <p className={styles["muted"]}>Select a track to edit its pattern.</p>
      </section>
    );
  }

  const tab = (tabState.trackId === track.id ? tabState.tab : null) ?? defaultTab ?? tabFor(track);
  const grid = track.kind === "drum" ? deriveDrumGrid(track.pattern, track.params.gain) : null;

  return (
    <section className={classes} aria-label={`Pattern editor: ${track.name}`} {...rest}>
      <Header track={track} grid={grid} keyName={key} tab={tab} onTab={(t) => setTabState({ trackId: track.id, tab: t })} tabsId={tabsId} editor={editor} />
      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${tab}`} className={styles["panel"]}>
        {tab === "steps" ? <StepsTab key={track.id} track={track} editor={editor} /> : null}
        {tab === "piano" ? <PianoTab track={track} editor={editor} keyName={key} /> : null}
        {tab === "code" ? <CodeView track={track} onPatternCommit={(pattern) => editor.write({ pattern })} /> : null}
      </div>
      {tab !== "code" ? <LiveCode key={track.id} track={track} editor={editor} /> : null}
    </section>
  );
}
