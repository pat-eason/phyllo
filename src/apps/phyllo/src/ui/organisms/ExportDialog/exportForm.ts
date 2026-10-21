/** ExportDialog form state → pipeline options. Pure. */
import type { Project, Section } from "@phyllo/model";
import type { ExportBitDepth, ExportFormat } from "../../../native/types";
import {
  FORMAT_EXT,
  audibleTracks,
  estimateExportSec,
  formatClock,
  joinPath,
  rangeCycles,
  rangeDurationSec,
  safeFileName,
  withExtension,
} from "../../../state/exportPipeline";
import type { ExportOptions, ExportRange, SampleRateChoice, TailBars } from "../../../state/exportPipeline";

export type ExportTab = "mixdown" | "stems" | "midi" | "code";

export const TABS: { id: ExportTab; label: string; sub: string }[] = [
  { id: "mixdown", label: "Mixdown", sub: "One stereo file" },
  { id: "stems", label: "Stems", sub: "A file per track" },
  { id: "midi", label: "MIDI", sub: "Notes as a .mid file" },
  { id: "code", label: "Code", sub: ".strudel file or strudel.cc link" },
];

/** Shared by Mixdown and Stems so switching tabs keeps the choices. */
export interface AudioForm {
  range: ExportRange;
  format: ExportFormat;
  bitDepth: ExportBitDepth;
  sampleRate: SampleRateChoice;
  tailBars: TailBars;
  normalize: boolean;
  saveCode: boolean;
  reveal: boolean;
  /** Typed or chosen file; null = the default `<Exports>/<project>.<ext>`. */
  path: string | null;
  /** Stems folder; null = the Exports folder. */
  folder: string | null;
  /** Stems; null = every audible track. */
  trackIds: string[] | null;
}

export interface MidiForm {
  range: ExportRange;
  layout: "tracks" | "single";
  path: string | null;
}

export interface CodeForm {
  action: "file" | "link";
  /** `song` or a section id. */
  scope: string;
  path: string | null;
}

export const DEFAULT_AUDIO_FORM: AudioForm = {
  range: { kind: "song" },
  format: "wav",
  bitDepth: 24,
  sampleRate: "device",
  tailBars: 2,
  normalize: true,
  saveCode: true,
  reveal: false,
  path: null,
  folder: null,
  trackIds: null,
};

export const DEFAULT_MIDI_FORM: MidiForm = { range: { kind: "song" }, layout: "tracks", path: null };
export const DEFAULT_CODE_FORM: CodeForm = { action: "file", scope: "song", path: null };

export const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "mp3", label: "MP3 320" },
];

export const FORMAT_NAME: Record<ExportFormat, string> = { wav: "WAV", flac: "FLAC", mp3: "MP3" };

/** FLAC is 16/24-bit only; MP3 is always 320 kbps. */
export function bitDepthOptions(format: ExportFormat): { value: string; label: string }[] {
  if (format === "mp3") return [{ value: "mp3", label: "320 kbps" }];
  const all = [
    { value: "24", label: "24-bit" },
    { value: "16", label: "16-bit" },
    { value: "32", label: "32-bit float" },
  ];
  return format === "flac" ? all.slice(0, 2) : all;
}

/** Keeps the depth valid when the format changes (FLAC has no 32-bit float). */
export function withFormat(form: AudioForm, format: ExportFormat): AudioForm {
  const bitDepth = format === "flac" && form.bitDepth === 32 ? 24 : form.bitDepth;
  const path = form.path && /\.(wav|flac|mp3)$/i.test(form.path) ? withExtension(form.path, FORMAT_EXT[format]) : form.path;
  return { ...form, format, bitDepth, path };
}

export const TAIL_OPTIONS: { value: string; label: string }[] = [
  { value: "0", label: "None" },
  { value: "2", label: "2 bars" },
  { value: "4", label: "4 bars" },
];

export function sampleRateOptions(deviceRate: number): { value: string; label: string }[] {
  return [
    { value: "device", label: `${formatKhz(deviceRate)} kHz (device)` },
    { value: "44100", label: "44.1 kHz" },
  ];
}

const formatKhz = (rate: number) => String(Math.round(rate / 100) / 10);

export interface RangeCard {
  kind: ExportRange["kind"];
  label: string;
  sub: string;
  disabled: boolean;
}


export function rangeCards(project: Project): RangeCard[] {
  const song = rangeCycles(project, { kind: "song" });
  const loop = rangeCycles(project, { kind: "loop" });
  const names = project.sections.map((s) => s.name).join(", ");
  return [
    {
      kind: "song",
      label: "Whole song",
      sub: `Bars ${song.startBar}–${song.endBar} · ${formatClock(rangeDurationSec(project, { kind: "song" }))}`,
      disabled: false,
    },
    {
      kind: "loop",
      label: "Loop region",
      sub: `Bars ${loop.startBar}–${loop.endBar} · ${formatClock(rangeDurationSec(project, { kind: "loop" }))}`,
      disabled: false,
    },
    { kind: "section", label: "A section", sub: names || "No sections yet", disabled: project.sections.length === 0 },
  ];
}

export function sectionLabel(project: Project, section: Section): string {
  const d = formatClock(rangeDurationSec(project, { kind: "section", sectionId: section.id }));
  return `${section.name} · bars ${section.startBar}–${section.endBar} · ${d}`;
}

/** Picking "A section" chooses the first section until another is picked. */
export function rangeOfKind(project: Project, kind: ExportRange["kind"], current: ExportRange): ExportRange {
  if (kind !== "section") return { kind };
  if (current.kind === "section") return current;
  const first = project.sections[0];
  return first ? { kind: "section", sectionId: first.id } : { kind: "song" };
}

// ── paths ───────────────────────────────────────────────────────────────────

export const defaultFilePath = (exportsDir: string, project: Pick<Project, "name">, ext: string) =>
  joinPath(exportsDir, `${safeFileName(project.name)}.${ext}`);

export const audioPath = (form: AudioForm, exportsDir: string, project: Pick<Project, "name">) =>
  form.path ?? defaultFilePath(exportsDir, project, FORMAT_EXT[form.format]);

export const stemsFolder = (form: AudioForm, exportsDir: string) => form.folder ?? exportsDir;

export function stemTrackIds(form: AudioForm, project: Project): string[] {
  const ids = new Set(project.tracks.map((t) => t.id));
  return form.trackIds === null ? audibleTracks(project).map((t) => t.id) : form.trackIds.filter((id) => ids.has(id));
}

// ── validation + options ────────────────────────────────────────────────────

export interface FormContext {
  project: Project;
  exportsDir: string;
  /** `browser` can only write WAV (DECISIONS D57). */
  nativeKind: "tauri" | "browser";
}

/** The reason Export is disabled, or null. */
export function audioProblem(tab: "mixdown" | "stems", form: AudioForm, ctx: FormContext): string | null {
  if (ctx.nativeKind === "browser" && form.format !== "wav") {
    return `${FORMAT_NAME[form.format]} export needs the desktop app; the browser can only write WAV.`;
  }
  if (tab === "mixdown" && audioPath(form, ctx.exportsDir, ctx.project).trim() === "") return "Choose where to save the file.";
  if (tab === "stems") {
    if (stemsFolder(form, ctx.exportsDir).trim() === "") return "Choose a folder for the stems.";
    if (stemTrackIds(form, ctx.project).length === 0) return "Pick at least one track.";
  }
  return null;
}

export function pathProblem(path: string): string | null {
  return path.trim() === "" ? "Choose where to save the file." : null;
}

export function audioOptions(tab: "mixdown" | "stems", form: AudioForm, ctx: FormContext): ExportOptions {
  const base = {
    range: form.range,
    tailBars: form.tailBars,
    sampleRate: form.sampleRate,
    format: form.format,
    bitDepth: form.format === "mp3" ? 16 : form.bitDepth,
    normalize: form.normalize,
    saveCode: form.saveCode,
    reveal: form.reveal,
  } as const;
  return tab === "mixdown"
    ? { kind: "mixdown", ...base, path: audioPath(form, ctx.exportsDir, ctx.project).trim() }
    : { kind: "stems", ...base, folder: stemsFolder(form, ctx.exportsDir).trim(), trackIds: stemTrackIds(form, ctx.project) };
}

/** Info line numbers: audio length and the expected wall time. */
export function audioEstimate(tab: "mixdown" | "stems", form: AudioForm, ctx: FormContext) {
  const audioSec = rangeDurationSec(ctx.project, form.range, form.tailBars);
  const renders = tab === "stems" ? Math.max(1, stemTrackIds(form, ctx.project).length) : 1;
  return { audio: formatClock(audioSec), wait: formatClock(estimateExportSec(audioSec, renders)), renders };
}
