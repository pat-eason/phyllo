import { Button, Checkbox, Select, TextField } from "@phyllo/ui";
import type { Project } from "@phyllo/model";
import type { ExportBitDepth, ExportFormat } from "../../../native/types";
import type { ExportRange, SampleRateChoice, TailBars } from "../../../state/exportPipeline";
import { audibleTracks } from "../../../state/exportPipeline";
import {
  FORMAT_OPTIONS,
  TAIL_OPTIONS,
  audioPath,
  bitDepthOptions,
  rangeCards,
  rangeOfKind,
  sampleRateOptions,
  sectionLabel,
  stemTrackIds,
  stemsFolder,
  withFormat,
} from "./exportForm";
import type { AudioForm, CodeForm, MidiForm } from "./exportForm";
import { RangeCards } from "./RangeCards";
import type { ChoiceCard } from "./RangeCards";
import styles from "./ExportDialog.module.css";

interface RangeFieldProps {
  project: Project;
  range: ExportRange;
  onChange(range: ExportRange): void;
  id: string;
}

/** Range cards plus the section picker under "A section". */
function RangeField({ project, range, onChange, id }: RangeFieldProps) {
  return (
    <>
      <RangeCards
        id={id}
        label="What to export"
        cards={rangeCards(project)}
        value={range.kind}
        onChange={(kind) => onChange(rangeOfKind(project, kind, range))}
      />
      {range.kind === "section" ? (
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Section"
          value={range.sectionId}
          options={project.sections.map((s) => ({ value: s.id, label: sectionLabel(project, s) }))}
          onChange={(sectionId) => onChange({ kind: "section", sectionId })}
        />
      ) : null}
    </>
  );
}

interface PathFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  onChoose(): void;
  chooseLabel: string;
  problem: string | null;
}

function PathField({ label, value, onChange, onChoose, chooseLabel, problem }: PathFieldProps) {
  return (
    <div className={styles["pathRow"]}>
      <TextField
        className={`${styles["field"]} ${styles["pathField"]}`}
        label={label}
        labelPosition="top"
        value={value}
        onChange={onChange}
        invalid={problem !== null}
        {...(problem ? { description: problem } : {})}
      />
      <Button className={styles["choose"]} onClick={onChoose} aria-label={chooseLabel}>
        Choose…
      </Button>
    </div>
  );
}

export interface AudioPaneProps {
  tab: "mixdown" | "stems";
  project: Project;
  form: AudioForm;
  onChange(form: AudioForm): void;
  exportsDir: string;
  deviceRate: number;
  onChoose(): void;
}

/** Mixdown and Stems (same options; Stems adds the track list and a folder instead of a file). */
export function AudioPane({ tab, project, form, onChange, exportsDir, deviceRate, onChoose }: AudioPaneProps) {
  const set = (patch: Partial<AudioForm>) => onChange({ ...form, ...patch });
  const audible = new Set(audibleTracks(project).map((t) => t.id));
  const chosen = new Set(stemTrackIds(form, project));
  const pathValue = tab === "mixdown" ? audioPath(form, exportsDir, project) : stemsFolder(form, exportsDir);
  const pathProblem = pathValue.trim() === "" ? (tab === "mixdown" ? "Choose where to save the file." : "Choose a folder.") : null;

  return (
    <>
      <RangeField id={`export-${tab}-range`} project={project} range={form.range} onChange={(range) => set({ range })} />

      <div className={styles["selects"]}>
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Format"
          value={form.format}
          options={FORMAT_OPTIONS}
          onChange={(format: ExportFormat) => onChange(withFormat(form, format))}
        />
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Bit depth"
          value={form.format === "mp3" ? "mp3" : String(form.bitDepth)}
          options={bitDepthOptions(form.format)}
          disabled={form.format === "mp3"}
          onChange={(v) => set({ bitDepth: Number(v) as ExportBitDepth })}
        />
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Sample rate"
          value={String(form.sampleRate)}
          options={sampleRateOptions(deviceRate)}
          onChange={(v) => set({ sampleRate: (v === "device" ? "device" : 44100) satisfies SampleRateChoice })}
        />
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Tail"
          value={String(form.tailBars)}
          options={TAIL_OPTIONS}
          onChange={(v) => set({ tailBars: Number(v) as TailBars })}
        />
      </div>

      {tab === "stems" ? (
        <fieldset className={styles["trackList"]}>
          <legend className={styles["groupLabel"]}>Tracks</legend>
          <div className={styles["trackGrid"]}>
            {project.tracks.map((track) => (
              <Checkbox
                key={track.id}
                checked={chosen.has(track.id)}
                label={
                  <span className={styles["trackName"]}>
                    <span className={styles["trackDot"]} style={{ background: track.color }} aria-hidden="true" />
                    {track.name}
                    {audible.has(track.id) ? null : <span className={styles["muted"]}> (muted)</span>}
                  </span>
                }
                onChange={(on) => {
                  const next = new Set(chosen);
                  if (on) next.add(track.id);
                  else next.delete(track.id);
                  set({ trackIds: project.tracks.map((t) => t.id).filter((id) => next.has(id)) });
                }}
              />
            ))}
          </div>
          <p className={styles["hint"]}>Bounced one after another, each track soloed.</p>
        </fieldset>
      ) : null}

      <PathField
        label={tab === "mixdown" ? "Save to" : "Save stems to"}
        chooseLabel={tab === "mixdown" ? "Choose a file…" : "Choose a folder…"}
        value={pathValue}
        onChange={(v) => set(tab === "mixdown" ? { path: v } : { folder: v })}
        onChoose={onChoose}
        problem={pathProblem}
      />

      <div className={styles["options"]}>
        <Checkbox checked={form.normalize} onChange={(normalize) => set({ normalize })} label="Normalize peak to −1 dBFS" />
        <Checkbox checked={form.saveCode} onChange={(saveCode) => set({ saveCode })} label="Save the Strudel code next to the audio" />
        <Checkbox checked={form.reveal} onChange={(reveal) => set({ reveal })} label="Show in Finder when done" />
      </div>
    </>
  );
}

export interface MidiPaneProps {
  project: Project;
  form: MidiForm;
  onChange(form: MidiForm): void;
  path: string;
  onChoose(): void;
}

export function MidiPane({ project, form, onChange, path, onChoose }: MidiPaneProps) {
  const set = (patch: Partial<MidiForm>) => onChange({ ...form, ...patch });
  return (
    <>
      <RangeField id="export-midi-range" project={project} range={form.range} onChange={(range) => set({ range })} />
      <div className={styles["selects"]}>
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Tracks"
          value={form.layout}
          options={[
            { value: "tracks", label: "One track per pattern" },
            { value: "single", label: "Single track" },
          ]}
          onChange={(layout) => set({ layout })}
        />
      </div>
      <PathField
        label="Save to"
        chooseLabel="Choose a file…"
        value={path}
        onChange={(v) => set({ path: v })}
        onChoose={onChoose}
        problem={path.trim() === "" ? "Choose where to save the file." : null}
      />
    </>
  );
}

export interface CodePaneProps {
  project: Project;
  form: CodeForm;
  onChange(form: CodeForm): void;
  path: string;
  onChoose(): void;
}

export function CodePane({ project, form, onChange, path, onChoose }: CodePaneProps) {
  const set = (patch: Partial<CodeForm>) => onChange({ ...form, ...patch });
  const cards: ChoiceCard<CodeForm["action"]>[] = [
    { kind: "file", label: "Strudel file", sub: "A .strudel file with the code", disabled: false },
    { kind: "link", label: "strudel.cc link", sub: "Copied to the clipboard", disabled: false },
  ];
  return (
    <>
      <RangeCards
        id="export-code-action"
        label="How to share"
        cards={cards}
        value={form.action}
        onChange={(action) => set({ action })}
      />
      <div className={styles["selects"]}>
        <Select
          className={styles["field"]}
          labelPosition="top"
          label="Code"
          value={form.scope}
          options={[
            { value: "song", label: "Whole song · arrange()" },
            ...project.sections.map((s) => ({ value: s.id, label: `Section · ${s.name}` })),
          ]}
          onChange={(scope) => set({ scope })}
        />
      </div>
      {form.action === "file" ? (
        <PathField
          label="Save to"
          chooseLabel="Choose a file…"
          value={path}
          onChange={(v) => set({ path: v })}
          onChoose={onChoose}
          problem={path.trim() === "" ? "Choose where to save the file." : null}
        />
      ) : null}
    </>
  );
}
