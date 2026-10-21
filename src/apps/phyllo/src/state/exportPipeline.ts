/**
 * Export pipeline (SPEC §6.5, DECISIONS V11, D54–D57, D93). UI-agnostic: the `useExport` hook drives it and the
 * ExportDialog only collects options.
 *
 * - Mixdown: song-scope code (no meter instrumentation) → `engine.renderOffline` (OfflineAudioContext, ~19× real
 *   time) → `streamAudioBuffer` → native encode. Real-time capture of the master bus only when the offline render
 *   throws.
 * - Stems: one offline render per chosen track with `soloTrackIds: [id]`, `<project> - <track>.<ext>` in a folder.
 * - MIDI: `queryNoteEvents` over the range → `midiFileWrite` (drum tracks on channel 10). Instant.
 * - Code: `.strudel` file (`strudelWrite`) or a strudel.cc link copied to the clipboard.
 *
 * Progress is reported as one 0–1 fraction plus the phase (`rendering` | `encoding`). Offline rendering has no
 * progress events, so that phase is estimated from the expected render speed.
 */
import { generate, queryNoteEvents as engineQueryNoteEvents, toShareUrl } from "@phyllo/engine";
import type { NoteEvent, NoteQueryOptions, PhylloEngine } from "@phyllo/engine";
import type { GeneratedProgram, Project, Track } from "@phyllo/model";
import type { NativeApi } from "../native/api";
import { formatExportNotification, streamAudioBuffer } from "../native/export";
import type { AudioBufferLike } from "../native/export";
import type { ExportBitDepth, ExportFormat, ExportResult, MidiFileTrack } from "../native/types";

// ── options ─────────────────────────────────────────────────────────────────

export type ExportKind = "mixdown" | "stems" | "midi" | "code";

/** What part of the song to export. */
export type ExportRange = { kind: "song" } | { kind: "loop" } | { kind: "section"; sectionId: string };

export type TailBars = 0 | 2 | 4;

/** `device` = the live AudioContext's rate (48 kHz on most Macs). */
export type SampleRateChoice = "device" | 44100;

interface AudioOptionsBase {
  range: ExportRange;
  tailBars: TailBars;
  sampleRate: SampleRateChoice;
  format: ExportFormat;
  bitDepth: ExportBitDepth;
  /** Peak to −1 dBFS. */
  normalize: boolean;
  /** Write the song's Strudel code next to the audio (`<file>.strudel`). */
  saveCode: boolean;
  /** Show the result in Finder when done. */
  reveal: boolean;
}

export interface MixdownOptions extends AudioOptionsBase {
  kind: "mixdown";
  /** Absolute path (or a bare name, which native puts in `Exports/`). */
  path: string;
}

export interface StemsOptions extends AudioOptionsBase {
  kind: "stems";
  /** Absolute, existing folder. */
  folder: string;
  trackIds: string[];
}

export interface MidiOptions {
  kind: "midi";
  range: ExportRange;
  path: string;
  /** `tracks`: one MIDI track per Phyllo track; `single`: every note on one track (channel 1). */
  layout: "tracks" | "single";
}

export interface CodeOptions {
  kind: "code";
  action: "file" | "link";
  /** `section` renders the section at `sectionBar` (the code drawer's "This section"). */
  scope: "song" | "section";
  sectionBar?: number;
  /** For `action: "file"`. */
  path?: string;
}

export type ExportOptions = MixdownOptions | StemsOptions | MidiOptions | CodeOptions;

export type ExportPhase = "rendering" | "encoding";

export interface ExportProgressUpdate {
  phase: ExportPhase;
  /** 0–1 over the whole job. */
  fraction: number;
}

export interface ExportJobResult {
  kind: ExportKind;
  /** The main file (first stem for stems); null for a copied link. */
  path: string | null;
  /** Every file written, audio first. */
  files: string[];
  /** Toast / notification title. */
  title: string;
  /** "Untitled Groove.wav · 1:08 · 24-bit" */
  detail: string;
  /** Rendered audio length, when audio was exported. */
  durationSec?: number;
  /** The strudel.cc link (code → link). */
  link?: string;
  /** True when the offline render failed and real-time capture was used. */
  realtime?: boolean;
}

// ── deps ────────────────────────────────────────────────────────────────────

export type ExportNative = Pick<
  NativeApi,
  | "exportBegin"
  | "exportChunk"
  | "exportFinish"
  | "exportCancel"
  | "midiFileWrite"
  | "strudelWrite"
  | "revealInFinder"
  | "notify"
  | "notifyExportFinished"
>;

export type ExportEngine = Pick<PhylloEngine, "renderOffline" | "startCapture" | "sampleRate">;

/** Plays the song from `fromCycle` and records the master bus for `durationSec` (real-time fallback). */
export type RealtimeCapture = (opts: {
  fromCycle: number;
  durationSec: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}) => Promise<AudioBufferLike>;

export interface ExportDeps {
  native: ExportNative;
  engine: ExportEngine;
  /** Defaults to the engine's `queryNoteEvents`. */
  queryNoteEvents?: (program: GeneratedProgram, opts: NoteQueryOptions) => Promise<NoteEvent[]>;
  /** Real-time fallback; without it an offline render failure is the export's error. */
  capture?: RealtimeCapture;
  /** Clipboard for code → link. */
  copyText?: (text: string) => Promise<void>;
  /** Whether the app window is focused: the native notification is only sent while it isn't (Toast doc). */
  isFocused?: () => boolean;
  onProgress?: (update: ExportProgressUpdate) => void;
  signal?: AbortSignal;
  /** Clock for the render-progress estimate (ms). */
  now?: () => number;
  /** Interval timer for the estimate; injectable for tests. */
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

// ── pure helpers ────────────────────────────────────────────────────────────

/** Measured offline render speed (DECISIONS V11): seconds of audio per second of wall time. */
export const OFFLINE_SPEED = 19;
/** Share of a render+encode job spent rendering (the rest is handing PCM to the encoder). */
const RENDER_SHARE = 0.8;
export const NORMALIZE_DBFS = -1;

export const FORMAT_EXT: Record<ExportFormat, string> = { wav: "wav", flac: "flac", mp3: "mp3" };

export const cpsOf = (project: Project) => project.tempo.bpm / project.tempo.beatsPerBar / 60;

export interface CycleRange {
  fromCycle: number;
  toCycle: number;
  startBar: number;
  endBar: number;
}

/** Bars are 1-based inclusive; one cycle per bar. Unknown sections fall back to the whole song. */
export function rangeCycles(project: Project, range: ExportRange): CycleRange {
  let startBar = 1;
  let endBar = project.lengthBars;
  if (range.kind === "loop") {
    startBar = project.loop.startBar;
    endBar = project.loop.endBar;
  } else if (range.kind === "section") {
    const section = project.sections.find((s) => s.id === range.sectionId);
    if (section) {
      startBar = section.startBar;
      endBar = section.endBar;
    }
  }
  startBar = Math.max(1, Math.min(startBar, project.lengthBars));
  endBar = Math.max(startBar, Math.min(endBar, project.lengthBars));
  return { fromCycle: startBar - 1, toCycle: endBar, startBar, endBar };
}

/** Seconds of audio for a range plus tail at the project tempo. */
export function rangeDurationSec(project: Project, range: ExportRange, tailBars: TailBars = 0): number {
  const { fromCycle, toCycle } = rangeCycles(project, range);
  return (toCycle - fromCycle + tailBars) / cpsOf(project);
}

/** `1:04` */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Time the first render typically spends fetching and decoding sounds before audio is produced (once per export,
 * not per stem: later renders reuse the loaded sounds). Deliberately conservative; a warm cache is faster.
 */
export const SAMPLE_LOAD_SEC = 6;

/** Wall-clock estimate of an offline audio export: sample loading once, plus rendering (at least one second per render). */
export function estimateExportSec(audioSec: number, renders = 1): number {
  return SAMPLE_LOAD_SEC + Math.max(1, (audioSec / OFFLINE_SPEED) * renders);
}

/** A track is audible unless muted, or another track is soloed and it isn't. */
export function audibleTracks(project: Project): Track[] {
  const soloing = project.tracks.some((t) => t.solo);
  return project.tracks.filter((t) => !t.mute && (!soloing || t.solo));
}

/** Characters macOS / Windows refuse in file names become `-`. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, "-").trim();
  return cleaned === "" ? "Untitled" : cleaned;
}

export function joinPath(folder: string, file: string): string {
  return folder.endsWith("/") || folder.endsWith("\\") ? `${folder}${file}` : `${folder}/${file}`;
}

/** Replaces (or adds) the extension of the last path component. */
export function withExtension(path: string, ext: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const dot = path.lastIndexOf(".");
  const base = dot > slash + 1 ? path.slice(0, dot) : path;
  return `${base}.${ext}`;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

function songProgram(project: Project): GeneratedProgram {
  return generate(project, { scope: "song", instrument: false });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Export cancelled", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string } | null)?.name === "AbortError";
}

const notificationDetail = (body: string) => body.replace(/^Export finished · /, "");

// ── runner ──────────────────────────────────────────────────────────────────

/** Runs one export job. Rejects with an `AbortError` when `deps.signal` aborts. */
export async function runExport(project: Project, options: ExportOptions, deps: ExportDeps): Promise<ExportJobResult> {
  throwIfAborted(deps.signal);
  switch (options.kind) {
    case "mixdown":
      return exportMixdown(project, options, deps);
    case "stems":
      return exportStems(project, options, deps);
    case "midi":
      return exportMidi(project, options, deps);
    case "code":
      return exportCode(project, options, deps);
  }
}

interface RenderStep {
  /** Progress fractions this render maps onto. */
  from: number;
  to: number;
}

/** Offline render with an estimated progress ramp; falls back to real-time capture when allowed. */
async function renderAudio(
  project: Project,
  program: GeneratedProgram,
  opts: AudioOptionsBase,
  deps: ExportDeps,
  step: RenderStep,
  soloTrackIds?: string[],
): Promise<{ buffer: AudioBufferLike; realtime: boolean }> {
  const { fromCycle, toCycle } = rangeCycles(project, opts.range);
  const cps = cpsOf(project);
  const tailSec = opts.tailBars / cps;
  const sampleRate = opts.sampleRate === "device" ? deps.engine.sampleRate || 48000 : opts.sampleRate;
  const audioSec = (toCycle - fromCycle) / cps + tailSec;
  const report = (f: number) => deps.onProgress?.({ phase: "rendering", fraction: step.from + (step.to - step.from) * f });

  const now = deps.now ?? (() => Date.now());
  const startTimer = deps.setInterval ?? ((fn: () => void, ms: number) => globalThis.setInterval(fn, ms));
  const stopTimer = deps.clearInterval ?? ((h: unknown) => globalThis.clearInterval(h as ReturnType<typeof setInterval>));
  const started = now();
  const expectedMs = estimateExportSec(audioSec) * 1000;
  report(0);
  const timer = startTimer(() => report(Math.min(0.95, (now() - started) / expectedMs)), 100);
  try {
    const buffer = await deps.engine.renderOffline(program, {
      fromCycle,
      toCycle,
      tailSec,
      sampleRate,
      ...(soloTrackIds ? { soloTrackIds } : {}),
    });
    throwIfAborted(deps.signal);
    report(1);
    return { buffer, realtime: false };
  } catch (error) {
    if (isAbortError(error) || !deps.capture || soloTrackIds) throw error;
    stopTimer(timer);
    const buffer = await deps.capture({
      fromCycle,
      durationSec: audioSec,
      ...(deps.signal ? { signal: deps.signal } : {}),
      onProgress: (f) => report(Math.min(1, f)),
    });
    throwIfAborted(deps.signal);
    report(1);
    return { buffer, realtime: true };
  } finally {
    stopTimer(timer);
  }
}

async function encode(buffer: AudioBufferLike, path: string, opts: AudioOptionsBase, deps: ExportDeps, step: RenderStep) {
  return streamAudioBuffer(deps.native, buffer, {
    path,
    format: opts.format,
    bitDepth: opts.bitDepth,
    normalizeDbfs: opts.normalize ? NORMALIZE_DBFS : null,
    ...(deps.signal ? { signal: deps.signal } : {}),
    onProgress: (p) => deps.onProgress?.({ phase: "encoding", fraction: step.from + (step.to - step.from) * p.fraction }),
  });
}

async function notifyFinished(deps: ExportDeps, body: string, path: string): Promise<void> {
  const focused = deps.isFocused?.() ?? (typeof document !== "undefined" && document.hasFocus());
  if (focused) return; // the in-app Toast / dialog shows it (Toast doc: never both)
  try {
    const shown = await deps.native.notifyExportFinished({ title: "Export finished", body, path });
    if (!shown) await deps.native.notify({ title: "Export finished", body });
  } catch {
    await deps.native.notify({ title: "Export finished", body }).catch(() => false);
  }
}

async function afterAudio(written: ExportResult, opts: AudioOptionsBase, deps: ExportDeps, program: GeneratedProgram) {
  const files = [written.path];
  if (opts.saveCode) {
    const codePath = withExtension(written.path, "strudel");
    await deps.native.strudelWrite(codePath, program.code);
    files.push(codePath);
  }
  return files;
}

async function exportMixdown(project: Project, opts: MixdownOptions, deps: ExportDeps): Promise<ExportJobResult> {
  const program = songProgram(project);
  const { buffer, realtime } = await renderAudio(project, program, opts, deps, { from: 0, to: RENDER_SHARE });
  const written = await encode(buffer, opts.path, opts, deps, { from: RENDER_SHARE, to: 1 });
  const files = await afterAudio(written, opts, deps, program);
  const body = formatExportNotification(written, { format: opts.format, bitDepth: opts.bitDepth });
  await notifyFinished(deps, body, written.path);
  if (opts.reveal) await deps.native.revealInFinder(written.path).catch(() => undefined);
  return {
    kind: "mixdown",
    path: written.path,
    files,
    title: "Export finished",
    detail: notificationDetail(body),
    durationSec: written.durationSec,
    realtime,
  };
}

async function exportStems(project: Project, opts: StemsOptions, deps: ExportDeps): Promise<ExportJobResult> {
  const tracks = opts.trackIds
    .map((id) => project.tracks.find((t) => t.id === id))
    .filter((t): t is Track => t !== undefined);
  if (tracks.length === 0) throw new Error("Pick at least one track to export.");
  const program = songProgram(project);
  const ext = FORMAT_EXT[opts.format];
  const files: string[] = [];
  let duration = 0;
  const share = 1 / tracks.length;
  for (const [i, track] of tracks.entries()) {
    throwIfAborted(deps.signal);
    const from = i * share;
    const split = from + share * RENDER_SHARE;
    const { buffer } = await renderAudio(project, program, opts, deps, { from, to: split }, [track.id]);
    const path = joinPath(opts.folder, `${safeFileName(project.name)} - ${safeFileName(track.name)}.${ext}`);
    const written = await encode(buffer, path, opts, deps, { from: split, to: from + share });
    files.push(written.path);
    duration = written.durationSec;
  }
  if (opts.saveCode) {
    const codePath = joinPath(opts.folder, `${safeFileName(project.name)}.strudel`);
    await deps.native.strudelWrite(codePath, program.code);
    files.push(codePath);
  }
  const depth = opts.format === "mp3" ? "320 kbps" : opts.bitDepth === 32 ? "32-bit float" : `${opts.bitDepth}-bit`;
  const detail = `${tracks.length} ${tracks.length === 1 ? "stem" : "stems"} · ${formatClock(duration)} · ${depth}`;
  const first = files[0] ?? opts.folder;
  await notifyFinished(deps, `Export finished · ${detail}`, first);
  if (opts.reveal) await deps.native.revealInFinder(first).catch(() => undefined);
  return { kind: "stems", path: first, files, title: "Export finished", detail, durationSec: duration };
}

/** Channels 1–16 in order, skipping 10 (drums). */
function melodicChannel(index: number): number {
  const channels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16];
  return channels[index % channels.length]!;
}

async function exportMidi(project: Project, opts: MidiOptions, deps: ExportDeps): Promise<ExportJobResult> {
  const { fromCycle, toCycle } = rangeCycles(project, opts.range);
  const query = deps.queryNoteEvents ?? engineQueryNoteEvents;
  deps.onProgress?.({ phase: "rendering", fraction: 0 });
  const events = await query(songProgram(project), { fromCycle, toCycle, cps: cpsOf(project) });
  throwIfAborted(deps.signal);
  if (events.length === 0) throw new Error("There are no notes to export in this range.");

  const toNote = (e: NoteEvent) => ({ startSec: e.startSec, durationSec: e.durationSec, note: e.note, velocity: e.velocity });
  let tracks: MidiFileTrack[];
  if (opts.layout === "single") {
    tracks = [{ name: project.name, channel: 1, notes: events.map(toNote) }];
  } else {
    let melodic = 0;
    tracks = project.tracks.flatMap((track) => {
      const notes = events.filter((e) => e.trackId === track.id).map(toNote);
      if (notes.length === 0) return [];
      const channel = track.kind === "drum" ? 10 : melodicChannel(melodic++);
      return [{ name: track.name, channel, notes }];
    });
  }
  deps.onProgress?.({ phase: "encoding", fraction: 0.5 });
  const written = await deps.native.midiFileWrite(opts.path, { bpm: project.tempo.bpm, tracks });
  deps.onProgress?.({ phase: "encoding", fraction: 1 });
  const noteCount = tracks.reduce((n, t) => n + t.notes.length, 0);
  const trackWord = tracks.length === 1 ? "track" : "tracks";
  return {
    kind: "midi",
    path: written.path,
    files: [written.path],
    title: "MIDI exported",
    detail: `${fileName(written.path)} · ${tracks.length} ${trackWord} · ${noteCount} notes`,
  };
}

async function exportCode(project: Project, opts: CodeOptions, deps: ExportDeps): Promise<ExportJobResult> {
  const program =
    opts.scope === "section"
      ? generate(project, { scope: "section", instrument: false, ...(opts.sectionBar ? { atBar: opts.sectionBar } : {}) })
      : songProgram(project);
  if (opts.action === "link") {
    const link = toShareUrl(program.code);
    if (!deps.copyText) throw new Error("The clipboard isn't available here.");
    await deps.copyText(link);
    return { kind: "code", path: null, files: [], title: "Link copied", detail: "Paste it into a browser to open the song on strudel.cc", link };
  }
  const path = opts.path ?? `${safeFileName(project.name)}.strudel`;
  await deps.native.strudelWrite(path, program.code);
  return { kind: "code", path, files: [path], title: "Code saved", detail: fileName(path) };
}
