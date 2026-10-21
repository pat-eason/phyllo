import { afterEach, describe, expect, it, vi } from "vitest";
import type { RenderOptions } from "@phyllo/engine";
import type { GeneratedProgram } from "@phyllo/model";
import { createBrowserApi } from "../native/browser";
import type { AudioBufferLike } from "../native/export";
import { createFakeEngine } from "./fakeEngine";
import { fixtureProject } from "./mocks";
import { isAbortError, rangeCycles, rangeDurationSec, runExport } from "./exportPipeline";
import type { ExportDeps, ExportProgressUpdate, MixdownOptions } from "./exportPipeline";

/** 120 BPM 4/4: one bar = 2 s, the 32-bar song = 1:04 (the mockup's numbers). */
const project = () => fixtureProject({ tempo: { bpm: 120, beatsPerBar: 4 } });

/** Silent-ish stereo buffer of the requested length at a low rate (keeps the WAV encode cheap). */
function fakeBuffer(seconds: number, sampleRate = 8000): AudioBufferLike {
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const channels = [new Float32Array(frames).fill(0.25), new Float32Array(frames).fill(0.25)];
  return { numberOfChannels: 2, sampleRate, getChannelData: (c) => channels[c]! };
}

function setup(overrides: Partial<ExportDeps> = {}) {
  const downloads: string[] = [];
  const native = createBrowserApi({ storage: null, requestMidiAccess: null, log: () => {}, download: (name) => downloads.push(name) });
  const engine = createFakeEngine({ ready: true });
  const renders: { program: GeneratedProgram; opts: RenderOptions }[] = [];
  engine.renderOffline = async (program, opts) => {
    renders.push({ program, opts });
    const cps = 0.5;
    return fakeBuffer((opts.toCycle - opts.fromCycle) / cps + opts.tailSec) as AudioBuffer;
  };
  const progress: ExportProgressUpdate[] = [];
  const deps: ExportDeps = {
    native,
    engine,
    isFocused: () => true,
    onProgress: (p) => progress.push(p),
    setInterval: () => 0,
    clearInterval: () => undefined,
    ...overrides,
  };
  return { native, engine, deps, renders, downloads, progress };
}

const mixdown = (patch: Partial<MixdownOptions> = {}): MixdownOptions => ({
  kind: "mixdown",
  range: { kind: "song" },
  tailBars: 2,
  sampleRate: "device",
  format: "wav",
  bitDepth: 24,
  normalize: true,
  saveCode: false,
  reveal: false,
  path: "Untitled Groove.wav",
  ...patch,
});

describe("exportPipeline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should render the whole song offline with the tail at the device rate and write the WAV", async () => {
    // Arrange
    const { deps, renders, downloads } = setup();

    // Act
    const result = await runExport(project(), mixdown(), deps);

    // Assert
    expect(renders).toHaveLength(1);
    expect(renders[0]?.opts).toEqual({ fromCycle: 0, toCycle: 32, tailSec: 4, sampleRate: 48000 });
    expect(renders[0]?.program.code).not.toContain(".analyze(");
    expect(downloads).toEqual(["Untitled Groove.wav"]);
    expect(result).toMatchObject({ kind: "mixdown", path: "Untitled Groove.wav", title: "Export finished", detail: "Untitled Groove.wav · 1:08 · 24-bit" });
  });

  it("should map the loop region and a section to their cycles", () => {
    // Arrange
    const p = project();

    // Act
    const loop = rangeCycles(p, { kind: "loop" });
    const drop = rangeCycles(p, { kind: "section", sectionId: "drop" });

    // Assert
    expect(loop).toEqual({ fromCycle: 8, toCycle: 16, startBar: 9, endBar: 16 });
    expect(drop).toEqual({ fromCycle: 20, toCycle: 32, startBar: 21, endBar: 32 });
    expect(rangeDurationSec(p, { kind: "loop" }, 4)).toBe(24);
  });

  it("should render at 44.1 kHz when asked", async () => {
    // Arrange
    const { deps, renders } = setup();

    // Act
    await runExport(project(), mixdown({ sampleRate: 44100, tailBars: 0, range: { kind: "loop" } }), deps);

    // Assert
    expect(renders[0]?.opts).toEqual({ fromCycle: 8, toCycle: 16, tailSec: 0, sampleRate: 44100 });
  });

  it("should save the song's Strudel code next to the audio", async () => {
    // Arrange
    const { deps, native } = setup();

    // Act
    const result = await runExport(project(), mixdown({ saveCode: true }), deps);

    // Assert
    expect(result.files).toEqual(["Untitled Groove.wav", "Untitled Groove.strudel"]);
    await expect(native.strudelRead("Untitled Groove.strudel")).resolves.toContain("setcpm(120/4)");
  });

  it("should fall back to real-time capture when the offline render fails", async () => {
    // Arrange
    const capture = vi.fn(async ({ durationSec }: { durationSec: number }) => fakeBuffer(durationSec));
    const { deps, engine } = setup({ capture });
    engine.renderOffline = async () => {
      throw new Error("OfflineAudioContext is not supported");
    };

    // Act
    const result = await runExport(project(), mixdown(), deps);

    // Assert
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({ fromCycle: 0, durationSec: 68 }));
    expect(result.realtime).toBe(true);
    expect(result.detail).toBe("Untitled Groove.wav · 1:08 · 24-bit");
  });

  it("should reject with the render error when there is no capture fallback", async () => {
    // Arrange
    const { deps, engine } = setup();
    engine.renderOffline = async () => {
      throw new Error("render exploded");
    };

    // Act
    const run = runExport(project(), mixdown(), deps);

    // Assert
    await expect(run).rejects.toThrow("render exploded");
  });

  it("should send the native notification with a Reveal path only while the window is in the background", async () => {
    // Arrange
    const background = setup({ isFocused: () => false });
    const focused = setup({ isFocused: () => true });
    const backgroundNotify = vi.spyOn(background.native, "notifyExportFinished");
    const focusedNotify = vi.spyOn(focused.native, "notifyExportFinished");

    // Act
    await runExport(project(), mixdown(), background.deps);
    await runExport(project(), mixdown(), focused.deps);

    // Assert
    expect(backgroundNotify).toHaveBeenCalledWith({
      title: "Export finished",
      body: "Export finished · Untitled Groove.wav · 1:08 · 24-bit",
      path: "Untitled Groove.wav",
    });
    expect(focusedNotify).not.toHaveBeenCalled();
  });

  it("should fall back to a plain notification when the export notification isn't shown", async () => {
    // Arrange
    const { deps, native } = setup({ isFocused: () => false });
    vi.spyOn(native, "notifyExportFinished").mockResolvedValue(false);
    const notify = vi.spyOn(native, "notify");

    // Act
    await runExport(project(), mixdown({ format: "wav", bitDepth: 16 }), deps);

    // Assert
    expect(notify).toHaveBeenCalledWith({ title: "Export finished", body: "Export finished · Untitled Groove.wav · 1:08 · 16-bit" });
  });

  it("should show the file in Finder when asked", async () => {
    // Arrange
    const { deps, native } = setup();
    const reveal = vi.spyOn(native, "revealInFinder");

    // Act
    await runExport(project(), mixdown({ reveal: true }), deps);

    // Assert
    expect(reveal).toHaveBeenCalledWith("Untitled Groove.wav");
  });

  it("should report rendering then encoding progress ending at 1", async () => {
    // Arrange
    const { deps, progress } = setup();

    // Act
    await runExport(project(), mixdown(), deps);

    // Assert
    expect(progress[0]).toEqual({ phase: "rendering", fraction: 0 });
    expect(progress.at(-1)).toEqual({ phase: "encoding", fraction: 1 });
    const fractions = progress.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  });

  it("should stop with an AbortError and write nothing when cancelled during the render", async () => {
    // Arrange
    const controller = new AbortController();
    const { deps, engine, downloads } = setup({ signal: controller.signal });
    engine.renderOffline = async () => {
      controller.abort();
      return fakeBuffer(1) as AudioBuffer;
    };

    // Act
    const error = await runExport(project(), mixdown(), deps).catch((e: unknown) => e);

    // Assert
    expect(isAbortError(error)).toBe(true);
    expect(downloads).toEqual([]);
  });

  it("should render one soloed stem per chosen track into the folder", async () => {
    // Arrange
    const { deps, renders, downloads } = setup();

    // Act
    const result = await runExport(
      project(),
      { ...mixdown(), kind: "stems", folder: "/Exports", trackIds: ["kick", "bass"] },
      deps,
    );

    // Assert
    expect(renders.map((r) => r.opts.soloTrackIds)).toEqual([["kick"], ["bass"]]);
    expect(downloads).toEqual(["Untitled Groove - Kick.wav", "Untitled Groove - Bass.wav"]);
    expect(result.detail).toBe("2 stems · 1:08 · 24-bit");
  });

  it("should write MIDI from the pattern notes with drums on channel 10", async () => {
    // Arrange
    const { deps, native } = setup();
    const write = vi.spyOn(native, "midiFileWrite");

    // Act
    const result = await runExport(project(), { kind: "midi", range: { kind: "loop" }, layout: "tracks", path: "Untitled Groove.mid" }, deps);

    // Assert
    const spec = write.mock.calls[0]?.[1];
    expect(spec?.bpm).toBe(120);
    expect(spec?.tracks.map((t) => [t.name, t.channel])).toEqual([
      ["Kick", 10],
      ["Clap", 10],
      ["Hats", 10],
      ["Bass", 1],
    ]);
    const kick = spec?.tracks[0]?.notes ?? [];
    expect(kick).toHaveLength(32);
    expect(kick[0]).toEqual({ startSec: 0, durationSec: 0.5, note: 36, velocity: 100 });
    expect(spec?.tracks[3]?.notes[0]?.note).toBe(33); // a1
    expect(result.title).toBe("MIDI exported");
  });

  it("should put every note on one track for the single-track layout", async () => {
    // Arrange
    const { deps, native } = setup();
    const write = vi.spyOn(native, "midiFileWrite");

    // Act
    await runExport(project(), { kind: "midi", range: { kind: "loop" }, layout: "single", path: "x.mid" }, deps);

    // Assert
    const tracks = write.mock.calls[0]?.[1].tracks ?? [];
    expect(tracks.map((t) => [t.name, t.channel])).toEqual([["Untitled Groove", 1]]);
  });

  it("should refuse a MIDI export with no notes in the range", async () => {
    // Arrange
    const { deps } = setup();
    const p = project();
    const silent = { ...p, tracks: p.tracks.map((t) => ({ ...t, mute: true })) };

    // Act
    const run = runExport(silent, { kind: "midi", range: { kind: "song" }, layout: "tracks", path: "x.mid" }, deps);

    // Assert
    await expect(run).rejects.toThrow("There are no notes to export in this range.");
  });

  it("should write a .strudel file or copy a strudel.cc link", async () => {
    // Arrange
    const copied: string[] = [];
    const { deps, native } = setup({ copyText: async (text) => void copied.push(text) });

    // Act
    const file = await runExport(project(), { kind: "code", action: "file", scope: "song", path: "/Exports/song.strudel" }, deps);
    const link = await runExport(project(), { kind: "code", action: "link", scope: "song" }, deps);

    // Assert
    expect(file).toMatchObject({ title: "Code saved", detail: "song.strudel" });
    await expect(native.strudelRead("/Exports/song.strudel")).resolves.toContain("arrange(");
    expect(copied).toEqual([link.link]);
    expect(link.link).toMatch(/^https:\/\/strudel\.cc\/#/);
  });
});
