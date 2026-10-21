/**
 * The definition-of-done flow (T7.5a), run inside the real desktop app: real stores, real engine, real Rust.
 * "Opens, plays a starter, edits it, saves it, reopens it from the library and exports a WAV", plus the MIDI /
 * `.strudel` / FLAC exports, the offline sound cache over the asset protocol, and the WKWebView facts nobody could
 * check from Playwright (DECISIONS V15–V18, D27, D54, D91–D93; strudel-verification REPORT (f) item 10).
 *
 * Started by `runSelftestIfEnabled` (./index.ts) only when the app was launched with `PHYLLO_SELFTEST=1`. Every step
 * is recorded; the report is rewritten after each one, and the app quits when done.
 */
import { DEFAULT_SAMPLE_SOURCES, generate, sampleMapFileUrls } from "@phyllo/engine";
import { createProject, serializeProject } from "@phyllo/model";
import type { Project } from "@phyllo/model";
import { invoke } from "@tauri-apps/api/core";
import { createRealtimeCapture } from "../hooks/useExport";
import type { AppStores } from "../state";
import { rangeDurationSec, runExport } from "../state/exportPipeline";
import type { ExportDeps, ExportOptions } from "../state/exportPipeline";
import { navigate } from "../ui/shell/router";
import { readLastProject, writeLastProject } from "../ui/shell/startup";
import {
  captureConsole,
  contextFacts,
  environmentFacts,
  probeDataWorklet,
  probeMediaRecorder,
  probeUnconnectedAnalyser,
  round,
  sleep,
  spyAudioContexts,
  waitRunning,
} from "./probes";
import { advancedCycles, createRecorder, errorText, expectedWavBytes, near, withTimeout } from "./report";
import type { SelftestReport } from "./report";

export interface SelftestConfig {
  enabled: boolean;
  reportPath: string | null;
}

interface AudioInfo {
  format: "wav" | "flac";
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  frames: number;
  peak: number | null;
  sizeBytes: number;
}

interface FileInfo {
  exists: boolean;
  sizeBytes: number;
  magic: string;
}

const PLAY_SECONDS = 3;
/** Groove section of the House starter: every track has a clip there. */
const PLAY_FROM_BAR = 9;
const EXPORT_NAME = "Phyllo Selftest";

const inspectAudio = (path: string) => invoke<AudioInfo>("selftest_inspect_wav", { path });
const fileInfo = (path: string) => invoke<FileInfo>("selftest_file_info", { path });

/** A copy of `project` whose loop covers bars `startBar`–`endBar` (the export range; the store is untouched). */
const withLoop = (project: Project, startBar: number, endBar: number): Project => ({
  ...project,
  loop: { enabled: true, startBar, endBar },
});

const trackByName = (project: Project, name: string) => {
  const track = project.tracks.find((t) => t.name === name);
  if (!track) throw new Error(`House starter has no "${name}" track (tracks: ${project.tracks.map((t) => t.name).join(", ")})`);
  return track;
};

/** Same file and key as `settingsStore` in native/tauri.ts. */
const SETTINGS_FILE = "settings.json";
const SETTINGS_KEY = "settings";

/**
 * Writes back the settings blob from before the run, or removes the key when there was none, so the next normal
 * launch still counts as a first launch. (The store plugin saves every open store on exit, so the file itself
 * stays, as `{}`.)
 */
async function restoreSettings(stores: AppStores, before: unknown): Promise<void> {
  if (before !== null) {
    await stores.native.settingsStore.save(before);
    return;
  }
  const { load } = await import("@tauri-apps/plugin-store");
  const store = await load(SETTINGS_FILE, { autoSave: false });
  await store.delete(SETTINGS_KEY);
  await store.save();
}

async function waitFor(condition: () => boolean, ms: number, pollMs = 50): Promise<boolean> {
  const until = performance.now() + ms;
  while (!condition() && performance.now() < until) await sleep(pollMs);
  return condition();
}

export async function runSelftest(stores: AppStores, config: SelftestConfig): Promise<SelftestReport> {
  const { native } = stores;
  const writeReport = (report: SelftestReport) => invoke<void>("selftest_write_report", { json: JSON.stringify(report) });
  const rec = createRecorder({ onUpdate: writeReport });
  const f = rec.findings;
  const uninstallConsole = captureConsole((entry) => rec.log(entry));
  const contexts = spyAudioContexts();
  const ctx = () => contexts[contexts.length - 1];
  const engine = () => stores.engineHost.get();
  // Restored at the end so a later normal launch doesn't try to reopen a temp-folder project.
  const lastProjectBefore = readLastProject();
  const settingsBefore = await native.settingsStore.load().catch(() => null);
  f["reportPath"] = config.reportPath;

  let savedPath: string | null = null;
  let savedText: string | null = null;
  let exportsDir = "";

  // ── a. boot ──
  await rec.step("a. boot", async ({ detail, check }) => {
    // The startup flow navigates (replace) once it has picked a screen; wait for it so it can't race our project.
    check(await waitFor(() => window.location.hash !== "", 15_000), "startup flow never picked a screen");
    await stores.start();
    const paths = await native.getPaths();
    exportsDir = paths.exports;
    Object.assign(detail, {
      nativeKind: native.kind,
      settingsLoaded: stores.settings.getState().loaded,
      startRoute: window.location.hash,
      paths,
      hadSettings: settingsBefore !== null,
      libraryCount: stores.library.getState().grooves.length,
    });
    check(native.kind === "tauri", `native.kind is ${native.kind}`);
    check(stores.settings.getState().loaded, "settings not loaded");
    f["environment"] = environmentFacts();
  });

  // ── b. starter + audio start ──
  await rec.step(
    "b. house starter + audio",
    async ({ detail, check }) => {
      const project = stores.project.getState().newProject("house");
      navigate({ screen: "arrange" });
      detail["tracks"] = project.tracks.map((t) => t.name);
      detail["bpm"] = project.tempo.bpm;
      check(project.tempo.bpm === 124, `bpm ${project.tempo.bpm}`);
      check(await waitFor(() => window.location.hash === "#/arrange", 3000), `route ${window.location.hash}`);

      // No user gesture here: does WKWebView let an AudioContext start on its own?
      const t0 = performance.now();
      const ready = stores.engine.getState().ensureAudio();
      ready.catch(() => undefined);
      const context = await waitFor(() => ctx() !== undefined, 2000).then(() => ctx());
      check(context !== undefined, "engine.init() created no AudioContext");
      let runningWithoutGesture = false;
      if (context) runningWithoutGesture = await waitRunning(context, 3000);
      const autoplay: Record<string, unknown> = {
        stateAtCreate: context?.state ?? null,
        runningWithoutGesture,
        msToRunning: runningWithoutGesture ? Math.round(performance.now() - t0) : null,
      };
      if (context && !runningWithoutGesture) {
        // Synthetic click (not a trusted gesture) on the real Play button, then resume() again.
        const button = document.querySelector<HTMLButtonElement>('button[aria-label="Play"]');
        autoplay["playButtonFound"] = button !== null;
        button?.click();
        await context.resume().catch((e: unknown) => (autoplay["resumeError"] = errorText(e)));
        autoplay["runningAfterSyntheticClick"] = await waitRunning(context, 3000);
        stores.transport.getState().stop();
      }
      f["audioAutoplay"] = autoplay;
      check(context?.state === "running", `AudioContext state ${context?.state ?? "none"} (no user gesture available)`);

      await withTimeout(ready, 45_000, "ensureAudio (engine.init, default sample maps)");
      detail["initMs"] = Math.round(performance.now() - t0);
      detail["audioReady"] = stores.engine.getState().audioReady;
      check(stores.engine.getState().audioReady, `audio not ready: ${stores.engine.getState().audioError ?? ""}`);
      if (context) f["audioContext"] = contextFacts(context);
    },
    60_000,
  );

  // ── c. play 3 s ──
  let playedOk = false;
  await rec.step(
    "c. play 3 s",
    async ({ detail, check }) => {
      const transport = stores.transport.getState();
      transport.stop();
      transport.seek(PLAY_FROM_BAR);
      stores.engine.getState().regenerateNow();
      const project = stores.project.getState().project;
      const cps = project.tempo.bpm / project.tempo.beatsPerBar / 60;
      const names = new Map(project.tracks.map((t) => [t.id, t.name]));

      const cycles: number[] = [];
      let masterPeak = 0;
      const trackPeaks: Record<string, number> = {};
      await transport.play();
      check(engine().playing, "engine not playing after play()");
      const t0 = performance.now();
      const sampleOnce = () => {
        const e = engine();
        cycles.push(e.getCycle());
        const m = e.getMeters();
        masterPeak = Math.max(masterPeak, m.master[0], m.master[1]);
        for (const [id, level] of Object.entries(m.tracks)) {
          const name = names.get(id) ?? id;
          trackPeaks[name] = Math.max(trackPeaks[name] ?? 0, level[0], level[1]);
        }
      };
      // The real-time capture tap (AudioWorklet from a data: URL, else ScriptProcessorNode) on the live master.
      let tapChunks = 0;
      let tapPeak = 0;
      let tapRate = 0;
      const stopTap = engine().startCapture((pcm, rate) => {
        tapChunks += 1;
        tapRate = rate;
        for (const ch of pcm) for (const v of ch) tapPeak = Math.max(tapPeak, Math.abs(v));
      });
      while (performance.now() - t0 < PLAY_SECONDS * 1000) {
        sampleOnce();
        await sleep(25);
      }
      sampleOnce();
      stopTap();
      const wallSec = (performance.now() - t0) / 1000;
      const advanced = advancedCycles(cycles);
      const expected = cps * wallSec;
      const status = stores.engine.getState().status;
      const audibleTracks = Object.values(trackPeaks).filter((p) => p > 0).length;
      Object.assign(detail, {
        cps: round(cps, 4),
        wallSec: round(wallSec),
        cyclesAdvanced: round(advanced),
        cyclesExpected: round(expected),
        cycleRange: [round(cycles[0] ?? 0), round(cycles[cycles.length - 1] ?? 0)],
        masterPeak: round(masterPeak, 4),
        trackPeaks: Object.fromEntries(Object.entries(trackPeaks).map(([k, v]) => [k, round(v, 4)])),
        status,
        captureTap: { chunks: tapChunks, peak: round(tapPeak, 4), sampleRate: tapRate },
      });
      check(status.ok, `engine status error: ${status.error?.message ?? "?"}`);
      check(Math.abs(advanced - expected) <= 0.2, `cycle advanced ${round(advanced)} vs expected ${round(expected)} (±0.2)`);
      check(masterPeak > 0, "master meter never above 0");
      check(audibleTracks >= 2, `only ${audibleTracks} track meter(s) above 0`);
      const workletWarning = rec.report.console.some((c) => c.message.includes("capture worklet unavailable"));
      f["captureTap"] = {
        path: tapChunks === 0 ? "none" : workletWarning ? "ScriptProcessorNode (worklet failed)" : "AudioWorklet (data: URL)",
        chunks: tapChunks,
        peak: round(tapPeak, 4),
      };
      check(tapChunks > 0 && tapPeak > 0, `capture tap: ${tapChunks} chunks, peak ${tapPeak}`);
      const context = ctx();
      if (context) f["audioContext"] = contextFacts(context);
      playedOk = status.ok && masterPeak > 0;
    },
    20_000,
  );

  // ── d. edit while playing ──
  await rec.step("d. edit (pattern, mute, lpf)", async ({ detail, check }) => {
    const store = stores.project.getState();
    const project = store.project;
    const bass = trackByName(project, "Bass");
    const clap = trackByName(project, "Clap");
    const before = stores.engine.getState().status.evaluatedAt;
    store.dispatch({ type: "track/setPattern", trackId: bass.id, pattern: "<a1 c2 e2 g1>*2" });
    store.dispatch({ type: "track/setMute", trackId: clap.id, mute: true });
    store.dispatch({ type: "track/setParam", trackId: bass.id, param: "lpf", value: 1400 });
    const evaluated = await waitFor(() => {
      const s = stores.engine.getState().status;
      return s.evaluatedAt !== null && s.evaluatedAt !== before;
    }, 3000);
    await sleep(400); // let the clap's last hits ring out of the meters
    const names = new Map(project.tracks.map((t) => [t.id, t.name]));
    let clapPeak = 0;
    let bassPeak = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 800) {
      const m = engine().getMeters();
      for (const [id, level] of Object.entries(m.tracks)) {
        const peak = Math.max(level[0], level[1]);
        if (names.get(id) === "Clap") clapPeak = Math.max(clapPeak, peak);
        if (names.get(id) === "Bass") bassPeak = Math.max(bassPeak, peak);
      }
      await sleep(25);
    }
    const now = stores.project.getState().project;
    const status = stores.engine.getState().status;
    const code = stores.engine.getState().code;
    Object.assign(detail, {
      reEvaluated: evaluated,
      status,
      bassPattern: now.tracks.find((t) => t.id === bass.id)?.pattern,
      bassLpf: now.tracks.find((t) => t.id === bass.id)?.params["lpf"],
      clapMuted: now.tracks.find((t) => t.id === clap.id)?.mute,
      clapPeakAfterMute: round(clapPeak, 4),
      bassPeakAfterEdit: round(bassPeak, 4),
      dirty: stores.project.getState().dirty,
      canUndo: stores.project.getState().canUndo,
    });
    check(evaluated, "no re-evaluation within 3 s of the edits");
    check(status.ok, `engine status error: ${status.error?.message ?? "?"}`);
    check(code.includes("a1 c2 e2 g1"), "generated code lacks the new bass pattern");
    check(code.includes("1400"), "generated code lacks lpf 1400");
    if (playedOk) check(bassPeak > 0, "bass silent after the edit");
    detail["clapSilentAfterMute"] = clapPeak === 0;
  });

  // ── e. save ──
  await rec.step("e. save + autosave", async ({ detail, check }) => {
    stores.transport.getState().stop();
    // Autosave fires ~1.5 s after the last edit (SPEC §5).
    const autosaved = await waitFor(() => stores.project.getState().autosavedAt !== null, 4000);
    detail["autosavedAt"] = stores.project.getState().autosavedAt;
    detail["autosavedPath"] = stores.project.getState().filePath;
    check(autosaved, "no autosave within 4 s of the last edit");
    const result = await stores.project.getState().save();
    check(result.ok, `save failed: ${result.ok ? "" : result.error}`);
    if (!result.ok) return;
    savedPath = result.path;
    const state = stores.project.getState();
    savedText = await native.projectRead(result.path);
    const history = await native.historyList(state.project.id).catch((e: unknown) => errorText(e));
    Object.assign(detail, {
      path: result.path,
      bytes: savedText.length,
      lastSavedAt: state.lastSavedAt,
      dirty: state.dirty,
      snapshots: Array.isArray(history) ? history.length : history,
    });
    check(savedText === serializeProject(state.project), "file on disk differs from the store's serialized project");
    check(!state.dirty, "still dirty after save");
    check(state.lastSavedAt !== null, "lastSavedAt not set");
  });

  // ── f. reopen from the library ──
  await rec.step("f. reopen from library", async ({ detail, check }) => {
    check(savedPath !== null && savedText !== null, "nothing was saved");
    if (savedPath === null || savedText === null) return;
    const scan = await native.libraryScan();
    const entry = scan.entries.find((e) => e.path === savedPath);
    detail["libraryEntries"] = scan.entries.length;
    detail["scanErrors"] = scan.errors;
    detail["entry"] = entry ? { name: entry.summary.name, tracks: entry.summary.trackCount } : null;
    check(entry !== undefined, `libraryScan() does not list ${savedPath}`);
    // Switch away first so the reopen really reads the file.
    stores.project.getState().loadProject(createProject({ id: "prj_selftest_blank", now: new Date().toISOString() }));
    const result = await stores.project.getState().openProject(savedPath);
    check(result.ok, `openProject failed: ${result.ok ? "" : result.error}`);
    const reopened = serializeProject(stores.project.getState().project);
    detail["equal"] = reopened === savedText;
    detail["filePath"] = stores.project.getState().filePath;
    check(reopened === savedText, "reopened project differs from the saved one");
    if (reopened !== savedText) {
      const at = [...reopened].findIndex((c, i) => c !== savedText?.[i]);
      detail["firstDifference"] = { at, saved: savedText.slice(Math.max(0, at - 40), at + 40), reopened: reopened.slice(Math.max(0, at - 40), at + 40) };
    }
  });

  const exportDeps = (): ExportDeps => {
    const e = engine();
    return { native, engine: e, capture: createRealtimeCapture(e, stores), isFocused: () => true };
  };

  // ── g. WAV export ──
  await rec.step(
    "g. export WAV (bars 1–4)",
    async ({ detail, check }) => {
      check(stores.engine.getState().audioReady, "audio never started; the offline render needs engine.init()");
      const project = withLoop(stores.project.getState().project, 1, 4);
      const rate = engine().sampleRate;
      detail["deviceSampleRate"] = rate;
      check(rate === 48000, `device sample rate ${rate}, not 48 kHz`);
      const options: ExportOptions = {
        kind: "mixdown",
        path: `${EXPORT_NAME}.wav`,
        range: { kind: "loop" },
        tailBars: 0,
        sampleRate: "device",
        format: "wav",
        bitDepth: 24,
        normalize: false,
        saveCode: false,
        reveal: false,
      };
      const t0 = performance.now();
      const result = await runExport(project, options, exportDeps());
      const ms = Math.round(performance.now() - t0);
      const duration = rangeDurationSec(project, { kind: "loop" });
      const info = await inspectAudio(result.path ?? "");
      const frames = Math.round(duration * rate);
      const expectedBytes = expectedWavBytes(frames, 2, 24);
      Object.assign(detail, {
        path: result.path,
        realtimeFallback: result.realtime ?? false,
        renderAndEncodeMs: ms,
        speed: round(duration / (ms / 1000), 1),
        durationSec: round(duration),
        info,
        expectedFrames: frames,
        expectedBytes,
      });
      f["offlineRender"] = { ok: !result.realtime, speedX: round(duration / (ms / 1000), 1) };
      f["binaryIpcExport"] = { ok: true, bytes: info.sizeBytes };
      check(!result.realtime, "offline render failed; real-time capture was used");
      check(info.format === "wav" && info.sampleRate === rate, `sample rate ${info.sampleRate}`);
      check(info.channels === 2 && info.bitsPerSample === 24, `${info.channels} ch / ${info.bitsPerSample}-bit`);
      check(near(info.frames, frames, 0.01), `frames ${info.frames} vs ${frames}`);
      check(near(info.sizeBytes, expectedBytes, 0.01), `size ${info.sizeBytes} vs ≈${expectedBytes}`);
      check((info.peak ?? 0) > 0, "WAV is silent (peak 0)");
    },
    60_000,
  );

  // ── h. MIDI, .strudel, FLAC ──
  await rec.step("h1. export MIDI", async ({ detail, check }) => {
    const project = stores.project.getState().project;
    const result = await runExport(project, { kind: "midi", range: { kind: "loop" }, path: `${EXPORT_NAME}.mid`, layout: "tracks" }, exportDeps());
    const info = await fileInfo(result.path ?? "");
    Object.assign(detail, { path: result.path, detail: result.detail, info });
    check(info.exists && info.magic === "MThd", `not a MIDI file: ${JSON.stringify(info)}`);
    check(info.sizeBytes > 100, `MIDI file only ${info.sizeBytes} bytes`);
  });

  await rec.step("h2. export .strudel", async ({ detail, check }) => {
    const project = stores.project.getState().project;
    const path = `${exportsDir}/${EXPORT_NAME}.strudel`;
    const result = await runExport(project, { kind: "code", action: "file", scope: "song", path }, exportDeps());
    const back = await native.strudelRead(path);
    const expected = generate(project, { scope: "song", instrument: false }).code;
    Object.assign(detail, { path: result.path, bytes: back.length });
    check(back === expected, "the .strudel file differs from the generated song code");
  });

  await rec.step(
    "h3. export FLAC (bars 9–10)",
    async ({ detail, check }) => {
      check(stores.engine.getState().audioReady, "audio never started");
      const project = withLoop(stores.project.getState().project, 9, 10);
      const rate = engine().sampleRate;
      const result = await runExport(
        project,
        {
          kind: "mixdown",
          path: `${EXPORT_NAME}.flac`,
          range: { kind: "loop" },
          tailBars: 0,
          sampleRate: "device",
          format: "flac",
          bitDepth: 16,
          normalize: false,
          saveCode: false,
          reveal: false,
        },
        exportDeps(),
      );
      const info = await inspectAudio(result.path ?? "");
      const frames = Math.round(rangeDurationSec(project, { kind: "loop" }) * rate);
      Object.assign(detail, { path: result.path, realtimeFallback: result.realtime ?? false, info, expectedFrames: frames });
      check(info.format === "flac" && info.sampleRate === rate && info.channels === 2 && info.bitsPerSample === 16, `header ${JSON.stringify(info)}`);
      check(near(info.frames, frames, 0.01), `frames ${info.frames} vs ${frames}`);
      check(info.sizeBytes > 1000, `FLAC only ${info.sizeBytes} bytes`);
    },
    60_000,
  );

  // ── i. offline sounds over the asset protocol ──
  await rec.step("i. sound cache + asset protocol", async ({ detail, check }) => {
    const before = await native.soundCacheStatus();
    const source = DEFAULT_SAMPLE_SOURCES[0]!;
    const map = await native.soundCacheFetch(source.map);
    const mapUrl = native.convertFileSrc(map.path);
    const mapResponse = await fetch(mapUrl);
    check(mapResponse.ok, `asset fetch of the sample map: HTTP ${mapResponse.status}`);
    const urls = sampleMapFileUrls(await mapResponse.json(), source.base);
    const sampleUrl = urls.find((u) => /rolandtr909/i.test(u) && /bd/i.test(u)) ?? urls[0];
    check(sampleUrl !== undefined, "sample map lists no files");
    if (sampleUrl === undefined) return;
    const t0 = performance.now();
    const cached = await native.soundCacheFetch(sampleUrl);
    const fetchMs = Math.round(performance.now() - t0);
    const assetUrl = native.convertFileSrc(cached.path);
    const response = await fetch(assetUrl);
    const bytes = await response.arrayBuffer();
    let decodedSec: number | null = null;
    try {
      const audio = await new OfflineAudioContext(2, 128, 48000).decodeAudioData(bytes.slice(0));
      decodedSec = round(audio.duration, 3);
    } catch (error) {
      detail["decodeError"] = errorText(error);
    }
    const after = await native.soundCacheStatus();
    Object.assign(detail, {
      cacheBefore: before,
      cacheAfter: after,
      sampleUrl,
      cachedPath: cached.path,
      assetUrl,
      fetchMs,
      http: response.status,
      bytes: bytes.byteLength,
      decodedSec,
    });
    f["assetProtocol"] = { ok: response.ok && bytes.byteLength > 0, url: assetUrl.replace(/[^/]+$/, "…") };
    check(response.ok && bytes.byteLength > 0, `asset fetch: HTTP ${response.status}, ${bytes.byteLength} bytes`);
    check(decodedSec !== null && decodedSec > 0, "cached sample did not decode");
    check(before.files > 0, "engine init cached no sounds (D108 resolver not used?)");
  });

  // ── j. notifications ──
  await rec.step("j. notification permission", async ({ detail }) => {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    detail["pluginGranted"] = await isPermissionGranted().catch((e: unknown) => errorText(e));
    detail["webNotification"] = typeof Notification === "function" ? Notification.permission : "unavailable";
    f["notifications"] = { ...detail };
  });

  // ── extra WKWebView probes ──
  await rec.step("k. web view probes", async ({ detail }) => {
    detail["dataWorkletOffline"] = await probeDataWorklet();
    const context = ctx();
    detail["unconnectedAnalyser"] = context ? await probeUnconnectedAnalyser(context) : { ok: false, reason: "no context" };
    detail["mediaRecorder"] = probeMediaRecorder();
    const e = engine();
    detail["outputDevices"] = await withTimeout(e.listOutputDevices(), 3000, "listOutputDevices").then(
      (d) => d.map((x) => x.label),
      (err: unknown) => errorText(err),
    );
    detail["setOutputDeviceDefault"] = await e.setOutputDevice(null).catch((err: unknown) => errorText(err));
    Object.assign(f, {
      dataWorkletOffline: detail["dataWorkletOffline"],
      unconnectedAnalyser: detail["unconnectedAnalyser"],
      mediaRecorder: detail["mediaRecorder"],
      setSinkId: {
        onPrototype: (f["environment"] as Record<string, unknown> | undefined)?.["setSinkIdOnPrototype"] ?? null,
        setOutputDeviceDefault: detail["setOutputDeviceDefault"],
        outputDevices: detail["outputDevices"],
      },
    });
  });

  // ── wrap up ──
  stores.transport.getState().stop();
  await stores.flush().catch(() => undefined);
  writeLastProject(lastProjectBefore);
  // Settings live in the app-data folder, not PHYLLO_HOME: put back what was there before the run.
  f["settingsRestored"] = await restoreSettings(stores, settingsBefore).then(
    () => true,
    (e: unknown) => errorText(e),
  );
  uninstallConsole();
  const report = rec.finish();
  await writeReport(report);
  return report;
}
