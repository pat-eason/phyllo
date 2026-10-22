/**
 * Phyllo's Strudel runtime (T1.5). Framework-free; high-frequency data (playhead, meters) is pull-based.
 *
 * Design (DECISIONS V1–V18, docs/strudel-verification/REPORT.md (c)/(e)):
 * - `repl()` is used for evaluation only (transpile, `$:` blocks, setcpm). Playback runs on our own
 *   `Cyclist` so the look-ahead is configurable (V16) and the transport (seek, loop, song end) lives in a
 *   wrapper pattern (V6) whose song pattern is swapped atomically after a strict query guard (V8).
 * - Heard playhead from the Cyclist anchors minus latency at `getOutputTimestamp` (V7).
 * - Master chain: destinationGain → transport gate → [limiter + clip] → analysers/capture → destination (V10).
 *   Stop/pause close the gate and cut superdough's voices; the limiter is on by default.
 * - Strudel log lines meaning a hap was dropped (`[voicing]: unknown chord …`) become runtime errors on the
 *   track whose block emits them, found by querying each block on its own while capturing logs.
 */
import * as core from "@strudel/core";
import {
  Cyclist,
  Pattern,
  State,
  TimeSpan,
  evalScope,
  getTrigger,
  logger as strudelLogger,
  register,
  repl,
  reset_state,
  setCpsFunc,
  setIsStarted,
  setTime,
  setTriggerFunc,
} from "@strudel/core";
import type { Hap, Repl } from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import {
  analysers,
  getAudioContext,
  getSuperdoughAudioController,
  initAudio,
  loadBuffer,
  registerSynthSounds,
  registerZZFXSounds,
  samples,
  setAudioContext,
  setSuperdoughAudioController,
  superdough,
  webaudioOutput,
} from "@strudel/webaudio";
import type { EngineError, EngineStatus, GeneratedProgram, MeterLevel } from "@phyllo/model";
import { startCaptureTap } from "./capture";
import { guardEndedHandlers } from "./ended-guard";
import { guardNodePool } from "./pool-guard";
import { attributeEvalError, attributeHapError, attributeLogIssue, attributeQueryError, silencingLog } from "./errors";
import type { AttributionContext, SilencingLog } from "./errors";
import { createMasterChain, createOrbitMeters, GATE_RAMP_SEC, readMonoAnalyser, SILENT } from "./master";
import type { MasterChain } from "./master";
import { hapToMidiMessages, midiPortName } from "./midi";
import { renderPatternOffline, suppressCrossContextErrors } from "./offline";
import { hapToOscMessage } from "./osc";
import { clickPattern, METRONOME_ORBIT } from "./metronome";
import type { MetronomeSettings } from "./metronome";
import {
  installUrlResolver,
  loadDefaultSamples,
  preloadSounds,
  registeredSampleUrls,
  setFontLoader,
  soundKey,
  soundsInRange,
} from "./samples";
import { soloTracks } from "./stems";
import { heardSchedulerCycle, loopToCycles, mapCycle, segmentAt, songCycleAt, transportPattern } from "./transport";
import type { LoopCycles, Segment } from "./transport";
import type {
  EngineOptions,
  LogLevel,
  MeterSnapshot,
  OutputDevice,
  PhylloEngine,
  PreviewSound,
  RenderOptions,
  TransportState,
} from "./types";

export const DEFAULT_LOOKAHEAD_MS = 100;
const MIN_LOOKAHEAD_MS = 20;
const MAX_LOOKAHEAD_MS = 1000;
/** Cycles scanned for samples to preload after each evaluation. */
const PRELOAD_CYCLES = 64;
const PRELOAD_TIMEOUT_MS = 4000;
const WATCHDOG_MS = 40;
/** After the stop ramp, superdough's orbits are rebuilt to cut scheduled voices and reverb/delay tails. */
const STOP_CUT_MS = Math.ceil(GATE_RAMP_SEC * 1000) + 10;
/** Logged (silently) to reset Strudel's 1 s duplicate-message debounce around log captures. */
const LOG_SENTINEL = "[phyllo] log capture";

/**
 * Strudel's `logger` drops a message identical to the previous one within 1 s. Logging a different message
 * resets that, so captures see every message; console output of the sentinel is suppressed.
 */
function resetLogDebounce(): void {
  const original = console.log;
  console.log = () => undefined;
  try {
    strudelLogger(LOG_SENTINEL, "debug");
  } finally {
    console.log = original;
  }
}

interface QueryLogCapture {
  messages: string[];
}

interface LiveProgram {
  program: GeneratedProgram;
  /** The evaluated song (stack of `$:` blocks), before transport mapping. */
  pattern: Pattern;
  /** One pattern per evaluated `.p()` block, in source order (for query-error attribution). */
  blocks: Pattern[];
  cps: number;
}

interface Evaluated {
  pattern: Pattern;
  blocks: Pattern[];
  cps: number;
}

/** Error carrying the attributed engine error (thrown by `renderOffline`). */
export class EngineEvalError extends Error {
  readonly detail: EngineError;
  constructor(detail: EngineError) {
    super(detail.message);
    this.name = "EngineEvalError";
    this.detail = detail;
  }
}

/**
 * Superdough orbit reserved for `preview()`: previews get their own output bus, so `stopPreview()` can silence them
 * without touching the song's voices (orbits are created lazily per number; the song uses 1 and up).
 */
export const PREVIEW_ORBIT = -1;

/** The part of superdough's audio controller `releasePreviewOrbit` touches. */
export interface PreviewOrbitHost {
  nodes: Record<number, { output: AudioNode; summingNode: AudioNode } | undefined>;
}

/**
 * Starts silencing the preview orbit: ramps its output to 0 over `rampSec` from `now` (AudioContext time) and detaches
 * it from the controller at once, so the next preview builds a fresh bus at full level. Returns the disconnect to run
 * after the ramp, or null when nothing has previewed since the last release.
 */
export function releasePreviewOrbit(controller: PreviewOrbitHost, now: number, rampSec: number): (() => void) | null {
  const orbit = controller.nodes[PREVIEW_ORBIT];
  if (!orbit) return null;
  delete controller.nodes[PREVIEW_ORBIT];
  const gain = (orbit.output as Partial<GainNode>).gain;
  if (gain) {
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + rampSec);
  }
  return () => {
    orbit.summingNode.disconnect();
    orbit.output.disconnect();
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

function strictQuery(pattern: Pattern, begin: number, end: number, cps: number): void {
  pattern.query(new State(new TimeSpan(begin, end), { _cps: cps }));
}

/** Index of the first block whose strict query throws over any of `spans`. */
function failingBlock(blocks: readonly Pattern[], spans: readonly [number, number][], cps: number): number | undefined {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;
    try {
      for (const [b, e] of spans) strictQuery(block, b, e, cps);
    } catch {
      return i;
    }
  }
  return undefined;
}

/**
 * An evaluation-only repl. `beforeEval` wraps the freshly injected `Pattern.prototype.p` to record each
 * block in order; `editPattern` captures the stacked result without starting anything.
 */
function createEvaluator(onWarn: (m: string) => void) {
  let blocks: Pattern[] = [];
  let captured: Pattern | undefined;
  let errors: unknown[] = [];
  const r: Repl = repl({
    defaultOutput: async () => undefined,
    getTime: () => 0,
    transpiler,
    onEvalError: (err) => errors.push(err),
    beforeEval: () => {
      const inner = Pattern.prototype.p as (this: Pattern, id: string) => Pattern;
      Pattern.prototype.p = function (this: Pattern, id: string) {
        blocks.push(this);
        return inner.call(this, id);
      };
    },
    editPattern: (p) => {
      captured = p;
      return p;
    },
  });
  return {
    repl: r,
    /** Evaluates `code`; on error returns the raw error and how many blocks finished. */
    async evaluate(code: string): Promise<{ ok: true; value: Evaluated } | { ok: false; error: unknown; evaluatedBlocks: number }> {
      blocks = [];
      captured = undefined;
      errors = [];
      const prevCps = r.scheduler.cps;
      let ret: Pattern | undefined;
      try {
        ret = await r.evaluate(code, false);
      } catch (err) {
        errors.push(err);
      }
      if (!ret || errors.length || !captured) {
        r.scheduler.setCps(prevCps); // setcpm may have run before the failure
        if (!errors.length) onWarn("evaluation produced no pattern");
        return { ok: false, error: errors[0] ?? new Error("evaluation failed"), evaluatedBlocks: blocks.length };
      }
      return { ok: true, value: { pattern: captured, blocks: [...blocks], cps: r.scheduler.cps } };
    },
    restoreCps(cps: number) {
      r.scheduler.setCps(cps);
    },
  };
}

export function createEngine(options: EngineOptions = {}): PhylloEngine {
  const bridge = options.bridge;
  const log = (message: string, level: LogLevel = "info") => options.logger?.(`[phyllo] ${message}`, level);
  const warned = new Set<string>();
  const warnOnce = (message: string) => {
    if (warned.has(message)) return;
    warned.add(message);
    log(message, "warn");
  };

  // Offline sound cache (V15): sample maps, sample files and soundfonts all load through `options.resolveUrl`.
  const uninstallUrlResolver = options.resolveUrl ? installUrlResolver(options.resolveUrl) : undefined;

  let ctx: AudioContext | undefined;
  let ready = false;
  let disposed = false;
  let initPromise: Promise<void> | undefined;
  let live: ReturnType<typeof createEvaluator> | undefined;
  let renderEvaluator: ReturnType<typeof createEvaluator> | undefined;
  let cyclist: Cyclist | undefined;
  let latency = clampLookahead(options.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS) / 1000;
  let chain: MasterChain | undefined;
  let orbitMeters: ReturnType<typeof createOrbitMeters> | undefined;
  /** On by default, like a new project's `master.limiter` (D46). */
  let limiterOn = true;
  let rendering = false;
  let pendingProgram: GeneratedProgram | undefined;
  const pendingSampleNames: string[] = [];
  let evalQueue: Promise<unknown> = Promise.resolve();
  let logListener: ((e: Event) => void) | undefined;
  let crossContextListener: ((e: ErrorEvent) => void) | undefined;

  let status: EngineStatus = { ok: true, evaluatedAt: null };
  const statusSubs = new Set<(s: EngineStatus) => void>();
  const transportSubs = new Set<(s: TransportState) => void>();

  let current: LiveProgram | undefined;
  let previous: LiveProgram | undefined;
  /** The metronome's click track while it is on; stacked onto the live song only (never rendered or exported). */
  let metronome: Pattern | undefined;
  let metronomeBeats = 0;
  let withClick: { song: Pattern; click: Pattern; stacked: Pattern } | undefined;
  /** Runtime issues already reported for the current evaluation, keyed `trackId␀message` (dedupe). */
  let reportedIssues = new Set<string>();
  /** Silencing log messages already probed live for the current evaluation. */
  let probedLogs = new Set<string>();
  /** Set while a query runs whose Strudel log lines must be collected instead of probed live. */
  let logCapture: QueryLogCapture | undefined;
  let uninstallEndedGuard: (() => void) | undefined;
  let uninstallPoolGuard: (() => void) | undefined;
  let stopCut: ReturnType<typeof setTimeout> | undefined;
  let cutAfterRender = false;

  // transport
  let playing = false;
  let position = 0;
  let loop: LoopCycles = { enabled: false, start: 0, end: 0 };
  let songLength = Infinity;
  let segments: Segment[] = [];
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const trackScratch = new Map<string, { buf?: Float32Array<ArrayBuffer> }>();

  const setStatus = (next: EngineStatus) => {
    status = next;
    for (const cb of statusSubs) cb(next);
  };
  const emitTransport = () => {
    const s = { playing };
    for (const cb of transportSubs) cb(s);
  };
  const attribution = (p: GeneratedProgram, evaluatedBlocks?: number): AttributionContext =>
    evaluatedBlocks === undefined ? { code: p.code, lines: p.lines } : { code: p.code, lines: p.lines, evaluatedBlocks };

  const reportError = (error: EngineError) => {
    setStatus({ ok: false, evaluatedAt: status.evaluatedAt, error });
    log(`${error.kind ?? "error"}${error.trackId ? ` in ${error.trackId}` : ""}: ${error.message}`, "warn");
  };

  /**
   * Reports a runtime issue of the playing program once per (track, message) per evaluation. The status has
   * one error slot, so an error already showing (a newer program's eval error while the last good one keeps
   * playing, or this evaluation's first issue) stays; later issues are only logged.
   */
  const reportIssue = (error: EngineError) => {
    const key = `${error.trackId ?? ""}\u0000${error.message}`;
    if (reportedIssues.has(key)) return;
    reportedIssues.add(key);
    if (!status.ok) {
      // one error slot: keep what is showing (an eval error of newer code, or this evaluation's first issue)
      log(`runtime${error.trackId ? ` in ${error.trackId}` : ""}: ${error.message}`, "warn");
      return;
    }
    reportError(error);
  };

  /** Runs `fn` collecting every Strudel log line it emits (Strudel logs synchronously from queries). */
  const captureLogs = (fn: () => void): string[] => {
    const outer = logCapture;
    const capture: QueryLogCapture = { messages: [] };
    logCapture = capture;
    resetLogDebounce();
    try {
      fn();
    } catch {
      // strict-query failures are handled by the guard; here only the log lines matter
    } finally {
      logCapture = outer;
      resetLogDebounce();
    }
    outer?.messages.push(...capture.messages);
    return capture.messages;
  };

  /**
   * Finds which evaluated blocks emit silencing log lines over `spans` (each block queried on its own) and
   * turns them into track-attributed runtime errors. Messages no block reproduces stay unattributed.
   */
  const probeIssues = (prog: LiveProgram, spans: readonly [number, number][], expected: readonly SilencingLog[]): EngineError[] => {
    const ctxAttr = attribution(prog.program);
    const issues: EngineError[] = [];
    const found = new Set<string>();
    prog.blocks.forEach((block, i) => {
      const messages = captureLogs(() => {
        for (const [b, e] of spans) for (let c = Math.floor(b); c < e; c++) block.queryArc(c, Math.min(c + 1, e), { _cps: prog.cps });
      });
      const seen = new Set<string>();
      for (const m of messages) {
        const s = silencingLog(m);
        if (!s || seen.has(s.message)) continue;
        seen.add(s.message);
        found.add(s.message);
        issues.push(attributeLogIssue(s, ctxAttr, i));
      }
    });
    for (const s of expected) if (!found.has(s.message)) issues.push({ kind: "runtime", message: s.message });
    return issues;
  };

  const silencingLogsOf = (messages: readonly string[]): SilencingLog[] => {
    const out = new Map<string, SilencingLog>();
    for (const m of messages) {
      const s = silencingLog(m);
      if (s && !out.has(s.message)) out.set(s.message, s);
    }
    return [...out.values()];
  };

  /** A silencing log line from a live (scheduler) query: find the block around the playhead, once per message. */
  const onLiveSilencingLog = (log: SilencingLog) => {
    if (probedLogs.has(log.message) || rendering) return;
    probedLogs.add(log.message);
    const program = current;
    setTimeout(() => {
      if (!program || program !== current) return;
      const at = (s: number) => {
        const seg = segmentAt(segments, s);
        return seg ? mapCycle(seg, s).u : position;
      };
      const begin = at(cyclist?.lastBegin ?? 0);
      const end = at(cyclist?.lastEnd ?? 0);
      const spans: [number, number][] = [
        [Math.max(0, Math.floor(begin) - 1), Math.floor(begin) + 1],
        [Math.max(0, Math.floor(end)), Math.floor(end) + 1],
      ];
      for (const issue of probeIssues(program, spans, [log])) reportIssue(issue);
    }, 0);
  };

  // ── transport segments ────────────────────────────────────────────────────

  const restSegments = (u: number): Segment[] => [
    { fromS: -Infinity, anchorS: 0, anchorU: u, loop, length: songLength, seek: false },
  ];
  segments = restSegments(0);

  /** Next scheduler cycle the Cyclist will query (changes take effect there). */
  const frontier = () => cyclist?.lastEnd ?? 0;

  /**
   * Cyclist anchors, snapshotted while valid: right after a cps change the Cyclist zeroes its tick count
   * and re-anchors on the next tick, so until then the previous anchors are used.
   */
  let anchors: { numCyclesAtCpsChange: number; secondsAtCpsChange: number | undefined; cps: number } | undefined;

  const heardS = (): number | undefined => {
    if (!ctx || !cyclist || !cyclist.started) return undefined;
    if (cyclist.num_ticks_since_cps_change > 0) {
      anchors = {
        numCyclesAtCpsChange: cyclist.num_cycles_at_cps_change,
        secondsAtCpsChange: cyclist.seconds_at_cps_change,
        cps: cyclist.cps,
      };
    }
    if (!anchors) return undefined;
    const ts = ctx.getOutputTimestamp?.();
    const outputTime =
      ts && typeof ts.contextTime === "number" && ts.contextTime > 0
        ? ts.contextTime
        : ctx.currentTime - (ctx.outputLatency || 0) - (ctx.baseLatency || 0);
    return heardSchedulerCycle({ ...anchors, latency }, outputTime);
  };

  /** Seconds between a context time being scheduled and being heard. */
  const outputDelay = (): number => {
    if (!ctx) return 0;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && typeof ts.contextTime === "number" && ts.contextTime > 0) return Math.max(0, ctx.currentTime - ts.contextTime);
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  };

  const getCycle = (): number => {
    if (!playing) return position;
    const s = heardS();
    return songCycleAt(segments, Math.max(s ?? 0, 0));
  };

  const pushSegment = (seg: Segment) => {
    const s = heardS() ?? 0;
    // keep the segment in effect at the heard position and everything after it
    const keepFrom = segments.findIndex((_x, i) => (segments[i + 1]?.fromS ?? Infinity) > s);
    segments = [...segments.slice(Math.max(0, keepFrom)), seg];
  };

  const reanchor = () => {
    if (!playing) {
      segments = restSegments(position);
      return;
    }
    const f = frontier();
    const seg = segmentAt(segments, f);
    const u = seg ? mapCycle(seg, f).u : position;
    pushSegment({ fromS: f, anchorS: f, anchorU: u, loop, length: songLength, seek: false });
  };

  const tick = () => {
    if (!playing) return;
    ensureChain();
    if (Number.isFinite(songLength) && getCycle() >= songLength) stop();
  };

  // ── audio graph ───────────────────────────────────────────────────────────

  const ensureChain = () => {
    if (!chain || rendering) return;
    const controller = getSuperdoughAudioController();
    if (!chain.isAttached(controller)) chain.attach(controller);
  };

  // ── outputs ───────────────────────────────────────────────────────────────

  const output = async (hap: Hap, deadline: number, duration: number, cps: number, t: number) => {
    if (rendering) return; // superdough's context is the offline one right now
    try {
      await webaudioOutput(hap, deadline, duration, cps, t);
    } catch (err) {
      if (current) reportIssue(attributeHapError(err, attribution(current.program), hap.context.locations));
    }
  };

  const installOutputs = () => {
    // MIDI out → native bridge (V12). Same signature as @strudel/midi: .midi(port?, options?)
    Pattern.prototype.midi = function (this: Pattern, portArg?: unknown) {
      // The transpiler turns "double quoted" names into mini patterns ("IAC Bus 1" → IAC Bus 1 sequence);
      // @strudel/midi rejects that, we join the words back.
      let port = portArg;
      if (portArg instanceof Pattern) {
        port = portArg
          .firstCycle()
          .map((h) => String(h.value))
          .join(" ");
        warnOnce(`.midi("${String(port)}"): use single quotes for port names`);
      }
      return this.onTrigger((...args: unknown[]) => {
        const [hap, currentTime, cps, targetTime] = args as [Hap, number, number, number];
        if (!bridge) return warnOnce("MIDI output needs the native bridge; .midi() is silent");
        hap.ensureObjectValue();
        const value = hap.value as Record<string, unknown>;
        const atMs = (targetTime - currentTime + outputDelay()) * 1000;
        const messages = hapToMidiMessages({ value, durationSec: hap.duration.valueOf() / cps, atMs });
        if (messages.length) bridge.midiSend(midiPortName(value, port), messages);
      }, true);
    };
    // OSC → native UDP to SuperDirt (V12)
    const osc = register("osc", (pat: Pattern) =>
      pat.onTrigger((...args: unknown[]) => {
        const [hap, currentTime, cps, targetTime] = args as [Hap, number, number, number];
        if (!bridge) return warnOnce("OSC output needs the native bridge; .osc() is silent");
        hap.ensureObjectValue();
        const message = hapToOscMessage(
          {
            value: hap.value as Record<string, unknown>,
            cps,
            cycle: hap.wholeOrPart().begin.valueOf(),
            durationCycles: hap.duration.valueOf(),
          },
          (targetTime - currentTime + outputDelay()) * 1000,
        );
        bridge.oscSend([message]);
      }, true),
    );
    return { osc };
  };

  // ── scheduler ─────────────────────────────────────────────────────────────

  const restoreGlobals = () => {
    const c = cyclist;
    if (!c) return;
    setTime(() => c.now());
    setCpsFunc(() => c.cps);
  };

  const songWithClick = (song: Pattern | undefined): Pattern | undefined => {
    if (!metronome) return song;
    if (!song) return metronome;
    if (withClick?.song !== song || withClick.click !== metronome) {
      withClick = { song, click: metronome, stacked: core.stack(song, metronome) };
    }
    return withClick.stacked;
  };

  const source = {
    get: () => songWithClick(current?.pattern),
    onQueryError: (err: unknown) => {
      const failing = current;
      if (failing) {
        const idx = failingBlock(failing.blocks, [[Math.floor(getCycle()), Math.floor(getCycle()) + 2]], failing.cps);
        reportError(attributeQueryError(err, attribution(failing.program), idx));
      }
      // fall back to the program before it (V8: keep the last good program playing)
      current = previous;
      previous = undefined;
      return songWithClick(current?.pattern);
    },
  };
  const transportPat = transportPattern(source, () => segments);

  const createCyclist = () => {
    if (!ctx) return;
    const c = ctx;
    const cps = cyclist?.cps ?? live?.repl.scheduler.cps ?? 0.5;
    cyclist?.stop();
    cyclist = new Cyclist({
      getTime: () => c.currentTime,
      latency,
      onTrigger: getTrigger({ getTime: () => c.currentTime, defaultOutput: output }),
      onToggle: (started) => {
        setIsStarted(started);
        if (!started) reset_state();
      },
    });
    void cyclist.setPattern(transportPat, false);
    cyclist.setCps(cps);
    setTriggerFunc(getTrigger({ getTime: () => c.currentTime, defaultOutput: output }));
    restoreGlobals();
  };

  // ── evaluation ────────────────────────────────────────────────────────────

  const doEvaluate = async (program: GeneratedProgram): Promise<EngineStatus> => {
    if (!live || !ctx) return status;
    const result = await live.evaluate(program.code);
    restoreGlobals();
    if (!result.ok) {
      reportError(attributeEvalError(result.error, attribution(program, result.evaluatedBlocks)));
      return status;
    }
    const { pattern, blocks, cps } = result.value;
    const pos = getCycle();
    const spans: [number, number][] = [[0, 2]];
    if (pos >= 2) spans.push([Math.floor(pos), Math.floor(pos) + 2]);
    const scanEnd = Math.min(Number.isFinite(songLength) ? songLength : PRELOAD_CYCLES, PRELOAD_CYCLES);
    const scanSpans: [number, number][] = [[0, Math.max(1, scanEnd)]];
    if (pos >= scanEnd) scanSpans.push([Math.floor(pos), Math.floor(pos) + 8]);
    if (loop.enabled && loop.start >= scanEnd) scanSpans.push([loop.start, loop.end]);

    // The guard and the preload scan query the new song; collect the log lines they emit (SPEC §4.4: logs like
    // `[voicing]: unknown chord` mean a track is silent and must show as an error).
    const scanLog: QueryLogCapture = { messages: [] };
    const outerCapture = logCapture;
    logCapture = scanLog;
    resetLogDebounce();
    let guardError: { err: unknown } | undefined;
    const requests: ReturnType<typeof soundsInRange> = [];
    try {
      try {
        for (const [b, e] of spans) strictQuery(pattern, b, e, cps);
      } catch (err) {
        guardError = { err };
      }
      if (!guardError) for (const [b, e] of scanSpans) requests.push(...soundsInRange(pattern, b, e, cps));
    } finally {
      logCapture = outerCapture;
      resetLogDebounce();
    }
    if (guardError) {
      live.restoreCps(current?.cps ?? cyclist?.cps ?? cps);
      reportError(attributeQueryError(guardError.err, attribution(program), failingBlock(blocks, spans, cps)));
      return status;
    }
    await withTimeout(preloadSounds(requests, ctx), PRELOAD_TIMEOUT_MS);

    const next: LiveProgram = { program, pattern, blocks, cps };
    const silencing = silencingLogsOf(scanLog.messages);
    const issues = silencing.length ? probeIssues(next, scanSpans, silencing) : [];
    previous = current;
    current = next;
    reportedIssues = new Set();
    probedLogs = new Set(silencing.map((s) => s.message));
    cyclist?.setCps(cps);
    const ok: EngineStatus = { ok: true, evaluatedAt: Date.now() };
    if (!issues.length) {
      setStatus(ok);
      return status;
    }
    status = ok;
    for (const issue of issues) reportIssue(issue);
    return status;
  };

  const evaluateIsolated = async (program: GeneratedProgram): Promise<Evaluated> => {
    renderEvaluator ??= createEvaluator((m) => log(m, "warn"));
    const result = await renderEvaluator.evaluate(program.code);
    restoreGlobals();
    if (!result.ok) throw new EngineEvalError(attributeEvalError(result.error, attribution(program, result.evaluatedBlocks)));
    return result.value;
  };

  // ── transport ops ─────────────────────────────────────────────────────────

  const play = () => {
    if (!ready || !ctx || !cyclist) {
      log("play() before init(); ignored", "warn");
      return;
    }
    if (playing) return;
    if (ctx.state !== "running") void ctx.resume();
    openGate();
    segments = restSegments(position); // the Cyclist restarts at scheduler cycle 0
    anchors = undefined;
    playing = true;
    void Promise.resolve(cyclist.start() as unknown).catch((err: unknown) => log(`scheduler start failed: ${String(err)}`, "error"));
    watchdog ??= setInterval(tick, WATCHDOG_MS);
    emitTransport();
  };

  /**
   * Cuts every voice superdough has scheduled (up to the look-ahead ahead) plus reverb/delay tails: resetting
   * the controller disconnects all orbits and rebuilds the output, which the master chain re-wires.
   */
  const cutVoices = () => {
    if (stopCut) clearTimeout(stopCut);
    stopCut = undefined;
    if (rendering) {
      cutAfterRender = true; // superdough's controller is the offline one right now
      return;
    }
    cutAfterRender = false;
    try {
      getSuperdoughAudioController().reset();
    } catch (err) {
      log(`voice cut failed: ${String(err)}`, "debug");
    }
    ensureChain();
  };

  /** Opens the transport gate, first cutting voices left over from a stop that is still ramping. */
  const openGate = () => {
    if (stopCut) cutVoices();
    ensureChain();
    chain?.setGate(true, 0);
  };

  const halt = (nextPosition: number) => {
    if (playing) {
      cyclist?.stop(); // Strudel's pause keeps counting while silent, so pause = stop + anchor
      // Stop releases sound (T1.V #11): ramp the master to 0, then cut the voices still scheduled and the
      // tails; the gate stays closed until play()/preview() so nothing left over leaks out.
      chain?.setGate(false, GATE_RAMP_SEC);
      if (stopCut) clearTimeout(stopCut);
      stopCut = setTimeout(cutVoices, STOP_CUT_MS);
    }
    playing = false;
    position = Math.max(0, nextPosition);
    segments = restSegments(position);
    if (watchdog) clearInterval(watchdog);
    watchdog = undefined;
    emitTransport();
  };

  const pause = () => {
    if (!playing) return;
    halt(getCycle());
  };

  function stop() {
    halt(loop.enabled ? loop.start : 0);
  }

  const seek = (cycle: number) => {
    const target = Math.max(0, Number.isFinite(cycle) ? cycle : 0);
    if (!playing) {
      position = target;
      segments = restSegments(position);
      return;
    }
    const f = frontier();
    pushSegment({ fromS: f, anchorS: f, anchorU: target, loop, length: songLength, seek: true });
  };

  // ── init ──────────────────────────────────────────────────────────────────

  /** Voice cleanups that failed across contexts (see ended-guard.ts): harmless, coalesced into one debug line. */
  let crossContextCount = 0;
  let crossContextTimer: ReturnType<typeof setTimeout> | undefined;
  const onCrossContextCleanup = () => {
    crossContextCount++;
    crossContextTimer ??= setTimeout(() => {
      log(`skipped ${crossContextCount} voice cleanup(s) across audio contexts (offline render)`, "debug");
      crossContextCount = 0;
      crossContextTimer = undefined;
    }, 500);
  };

  const init = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error("engine disposed"));
    if (initPromise) {
      if (ctx && ctx.state !== "running") void ctx.resume();
      return initPromise;
    }
    // create + resume synchronously so it happens inside the user gesture
    const c = createAudioContext(options.sampleRate, (m) => log(m, "warn"));
    ctx = c;
    const resumed = c.resume();
    uninstallEndedGuard = guardEndedHandlers(onCrossContextCleanup);
    initPromise = (async () => {
      setAudioContext(c);
      uninstallPoolGuard ??= guardNodePool(getAudioContext);
      setSuperdoughAudioController(null);
      await initAudio({});
      await resumed;
      await c.resume(); // initAudio never resumes (superdough.mjs:291)

      mini.miniAllStrings();
      const outputs = installOutputs();
      await evalScope(core, mini, tonal, webaudio, outputs);
      registerSynthSounds();
      registerZZFXSounds();
      // browser-only package (see samples.ts FontLoader); loaded here so the runtime imports under Node
      const soundfonts = await import("@strudel/soundfonts");
      soundfonts.registerSoundfonts();
      setFontLoader(soundfonts.getFontBufferSource);
      if (options.loadDefaultSamples !== false) await loadDefaultSamples((m) => log(m, "warn"));

      live = createEvaluator((m) => log(m, "warn"));
      createCyclist();
      chain = createMasterChain(c, limiterOn);
      orbitMeters = createOrbitMeters(c);
      ensureChain();

      if (typeof document !== "undefined") {
        logListener = (e: Event) => {
          const detail = (e as CustomEvent<{ message?: string; type?: string }>).detail;
          if (!detail?.message || detail.message === LOG_SENTINEL) return;
          const level: LogLevel = detail.type === "error" ? "error" : detail.type === "warning" ? "warn" : "debug";
          options.logger?.(detail.message, level);
          if (logCapture) {
            logCapture.messages.push(detail.message);
            return;
          }
          const silencing = silencingLog(detail.message);
          if (silencing) onLiveSilencingLog(silencing);
        };
        document.addEventListener("strudel.log", logListener);
      }

      if (pendingSampleNames.length) {
        await Promise.allSettled(registeredSampleUrls(pendingSampleNames.splice(0)).map((u) => loadBuffer(u, c)));
      }
      ready = true;
      log(`ready · ${c.sampleRate} Hz`);
      const pending = pendingProgram;
      pendingProgram = undefined;
      if (pending) await evaluate(pending);
    })();
    return initPromise;
  };

  const evaluate = (program: GeneratedProgram): Promise<EngineStatus> => {
    if (!ready) {
      pendingProgram = program;
      return Promise.resolve(status);
    }
    const run = evalQueue.then(() => doEvaluate(program));
    evalQueue = run.catch(() => undefined);
    return run;
  };

  // ── public API ────────────────────────────────────────────────────────────

  const engine: PhylloEngine = {
    init,
    get ready() {
      return ready;
    },
    evaluate,
    get status() {
      return status;
    },
    onStatus(cb) {
      statusSubs.add(cb);
      return () => statusSubs.delete(cb);
    },

    play,
    pause,
    stop,
    toStart: () => seek(0),
    seek,
    setLoop(next) {
      loop = loopToCycles(next);
      reanchor();
    },
    setSongLength(bars) {
      songLength = bars > 0 && Number.isFinite(bars) ? bars : Infinity;
      reanchor();
    },
    get playing() {
      return playing;
    },
    onTransport(cb) {
      transportSubs.add(cb);
      return () => transportSubs.delete(cb);
    },
    getCycle,
    getCps: () => cyclist?.cps ?? live?.repl.scheduler.cps ?? 0.5,
    setLookahead(ms) {
      const next = clampLookahead(ms) / 1000;
      if (next === latency) return;
      latency = next;
      if (!ready) return;
      const wasPlaying = playing;
      if (wasPlaying) pause();
      createCyclist();
      if (wasPlaying) play();
    },
    getLookahead: () => latency * 1000,

    async preview(sound: PreviewSound, durationSec = 0.5) {
      if (!ready || !ctx) throw new Error("preview() before init()");
      if (rendering) return;
      const value: Record<string, unknown> = { s: sound.s, orbit: PREVIEW_ORBIT };
      if (sound.bank) value["bank"] = sound.bank;
      if (sound.note !== undefined) value["note"] = sound.note;
      if (sound.n !== undefined) value["n"] = sound.n;
      if (sound.gain !== undefined && Number.isFinite(sound.gain)) value["gain"] = Math.max(0, sound.gain);
      const key = soundKey(value);
      if (key) await preloadSounds([{ key, value: { ...value } }], ctx);
      openGate(); // closed while stopped
      await superdough(value, ctx.currentTime + 0.05, durationSec);
    },

    stopPreview() {
      if (!ctx || rendering) return; // while rendering, superdough's controller is the offline one
      let controller: PreviewOrbitHost;
      try {
        controller = getSuperdoughAudioController() as unknown as PreviewOrbitHost;
      } catch {
        return;
      }
      const disconnect = releasePreviewOrbit(controller, ctx.currentTime, GATE_RAMP_SEC);
      if (disconnect) setTimeout(disconnect, STOP_CUT_MS);
    },

    async registerSamples(map, baseUrl = "") {
      await samples(map, baseUrl);
      const names = Object.keys(map);
      if (!ctx) {
        pendingSampleNames.push(...names);
        return;
      }
      const c = ctx;
      const results = await Promise.allSettled(registeredSampleUrls(names).map((u) => loadBuffer(u, c)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) log(`${failed} sample file(s) failed to load`, "warn");
    },

    setLimiter(on) {
      limiterOn = on;
      chain?.setLimiter(on);
    },

    setMetronome({ on, beatsPerBar }: MetronomeSettings) {
      if (!on) {
        metronome = undefined;
        metronomeBeats = 0;
        return;
      }
      if (metronome && metronomeBeats === beatsPerBar) return;
      metronome = clickPattern(beatsPerBar);
      metronomeBeats = beatsPerBar;
    },

    getMeters(): MeterSnapshot {
      const tracks: Record<string, MeterLevel> = {};
      const ids = current ? Object.keys(current.program.lines) : [];
      if (!playing || !chain) {
        for (const id of ids) tracks[id] = SILENT;
        return { tracks, orbits: {}, master: SILENT };
      }
      ensureChain();
      for (const id of ids) {
        const a = analysers[id];
        let scratch = trackScratch.get(id);
        if (!scratch) trackScratch.set(id, (scratch = {}));
        tracks[id] = a ? readMonoAnalyser(a, scratch) : SILENT;
      }
      const orbits = orbitMeters?.read(getSuperdoughAudioController()) ?? {};
      delete orbits[PREVIEW_ORBIT]; // previews are not a mixer bus
      delete orbits[METRONOME_ORBIT]; // nor is the metronome
      return { tracks, orbits, master: chain.readMaster() };
    },

    async setOutputDevice(deviceId) {
      const c = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | undefined;
      if (!c || typeof c.setSinkId !== "function") return false;
      try {
        await c.setSinkId(deviceId ?? "");
        return true;
      } catch (err) {
        log(`setSinkId failed: ${String(err)}`, "warn");
        return false;
      }
    },

    async listOutputDevices(): Promise<OutputDevice[]> {
      const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (!md?.enumerateDevices) return [];
      const devices = await md.enumerateDevices();
      return devices
        .filter((d) => d.kind === "audiooutput")
        .map((d, i) => ({ id: d.deviceId, label: d.label || (d.deviceId === "default" ? "System default" : `Output ${i + 1}`) }));
    },

    get sampleRate() {
      return ctx?.sampleRate ?? 0;
    },

    async renderOffline(program: GeneratedProgram, opts: RenderOptions): Promise<AudioBuffer> {
      if (!ready) throw new Error("renderOffline() before init()");
      const prog = opts.soloTrackIds ? soloTracks(program, opts.soloTrackIds) : program;
      const { pattern, cps } = await evaluateIsolated(prog);
      if (!crossContextListener && typeof window !== "undefined") {
        crossContextListener = suppressCrossContextErrors;
        window.addEventListener("error", crossContextListener, true);
      }
      rendering = true;
      try {
        return await renderPatternOffline(pattern, cps, {
          fromCycle: opts.fromCycle,
          toCycle: opts.toCycle,
          tailSec: opts.tailSec,
          sampleRate: opts.sampleRate,
          limiter: limiterOn,
          warn: (m) => log(m, "warn"),
          onLiveRestored: () => {
            rendering = false; // live playback resumes while the offline context renders
            if (cutAfterRender && !playing) cutVoices();
          },
        });
      } finally {
        rendering = false;
        restoreGlobals();
        if (cutAfterRender && !playing) cutVoices();
        cutAfterRender = false;
        ensureChain();
      }
    },

    startCapture(onChunk) {
      if (!ctx || !chain) throw new Error("startCapture() before init()");
      return startCaptureTap(ctx, chain.output, onChunk, (m) => log(m, "warn"));
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      uninstallUrlResolver?.();
      halt(0);
      cyclist?.stop();
      if (stopCut) clearTimeout(stopCut);
      stopCut = undefined;
      if (crossContextTimer) clearTimeout(crossContextTimer);
      uninstallEndedGuard?.();
      uninstallPoolGuard?.();
      if (logListener && typeof document !== "undefined") document.removeEventListener("strudel.log", logListener);
      if (crossContextListener && typeof window !== "undefined") window.removeEventListener("error", crossContextListener, true);
      orbitMeters?.dispose();
      chain?.dispose();
      statusSubs.clear();
      transportSubs.clear();
      ready = false;
      void ctx?.close();
    },
  };
  return engine;
}

/** Rates an AudioContext may be created with (Web Audio guarantees at least 8–96 kHz). */
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 96000;

/** The `sampleRate` to request, or undefined for the device default (null, missing, or out of range). */
export function requestedSampleRate(rate: number | null | undefined): number | undefined {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return undefined;
  const r = Math.round(rate);
  return r >= MIN_SAMPLE_RATE && r <= MAX_SAMPLE_RATE ? r : undefined;
}

/**
 * Creates the live context at `rate` (B8). A rate the platform refuses (NotSupportedError) falls back to the device
 * default with a warning instead of failing init.
 */
export function createAudioContext(
  rate: number | null | undefined,
  warn: (message: string) => void,
  Ctor: new (options?: AudioContextOptions) => AudioContext = AudioContext,
): AudioContext {
  const sampleRate = requestedSampleRate(rate);
  if (sampleRate === undefined) return new Ctor({ latencyHint: "interactive" });
  try {
    return new Ctor({ latencyHint: "interactive", sampleRate });
  } catch (err) {
    warn(`sample rate ${sampleRate} Hz not supported (${err instanceof Error ? err.message : String(err)}); using the device default`);
    return new Ctor({ latencyHint: "interactive" });
  }
}

function clampLookahead(ms: number): number {
  return Math.min(MAX_LOOKAHEAD_MS, Math.max(MIN_LOOKAHEAD_MS, Number.isFinite(ms) ? ms : DEFAULT_LOOKAHEAD_MS));
}
