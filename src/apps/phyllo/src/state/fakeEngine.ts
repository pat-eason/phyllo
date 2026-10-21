import type {
  LoopSettings,
  MeterSnapshot,
  OutputDevice,
  PhylloEngine,
  PreviewSound,
  RenderOptions,
  TransportState,
} from "@phyllo/engine";
import type { EngineStatus, GeneratedProgram } from "@phyllo/model";
import type { Unsubscribe } from "./feed";

/** A `PhylloEngine` for stories and tests, plus what it recorded. */
export interface FakeEngine extends PhylloEngine {
  /** Every program passed to `evaluate`, oldest first. */
  readonly evaluations: readonly GeneratedProgram[];
  /** Every `preview` call. */
  readonly previews: readonly PreviewSound[];
  readonly loop: LoopSettings;
  readonly songLength: number;
  readonly outputDevice: string | null;
  readonly initCount: number;
}

export interface FakeEngineOptions {
  /** epoch ms clock; default `Date.now` (follows `vi.useFakeTimers()`). */
  now?: () => number;
  /** Make `init()` reject with this message (audio blocked). */
  initError?: string;
  /** Start as if `init()` already ran, so `evaluate` reports status at once (default false, like the real engine). */
  ready?: boolean;
}

/** `setcpm(a/b)` → cycles per second. */
function cpsOf(code: string): number | null {
  const m = /setcpm\(\s*([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/.exec(code);
  if (!m) return null;
  const cpm = Number(m[1]) / (m[2] ? Number(m[2]) : 1);
  return Number.isFinite(cpm) && cpm > 0 ? cpm / 60 : null;
}

/**
 * Deterministic engine: no audio. `getCycle` advances with the clock at the program's `setcpm` rate and wraps
 * inside the loop; `getMeters` returns sine levels per instrumented track while playing; `evaluate` succeeds
 * unless the code contains `ERROR`, which fails like a real eval error attributed to that line's track.
 */
export function createFakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  const now = options.now ?? (() => Date.now());
  const evaluations: GeneratedProgram[] = [];
  const previews: PreviewSound[] = [];
  const statusSubs = new Set<(s: EngineStatus) => void>();
  const transportSubs = new Set<(s: TransportState) => void>();

  let ready = options.ready ?? false;
  let initCount = 0;
  let status: EngineStatus = { ok: true, evaluatedAt: null };
  let program: GeneratedProgram | null = null;
  let pending: GeneratedProgram | null = null;
  let cps = 0.5;
  let playing = false;
  /** Song cycle at `anchorMs`. */
  let anchorCycle = 0;
  let anchorMs = 0;
  let loop: LoopSettings = { enabled: false, startBar: 1, endBar: 1 };
  let songLength = 0;
  let lookahead = 100;
  let outputDevice: string | null = null;

  const setStatus = (next: EngineStatus) => {
    status = next;
    for (const cb of [...statusSubs]) cb(next);
  };
  const emitTransport = () => {
    for (const cb of [...transportSubs]) cb({ playing });
  };

  const wrap = (cycle: number): number => {
    if (loop.enabled) {
      const start = loop.startBar - 1;
      const end = loop.endBar;
      const len = end - start;
      if (len > 0 && cycle >= end) return start + ((cycle - start) % len);
    }
    return cycle;
  };
  const getCycle = (): number => (playing ? wrap(anchorCycle + ((now() - anchorMs) / 1000) * cps) : anchorCycle);
  const reanchor = (cycle: number) => {
    anchorCycle = cycle;
    anchorMs = now();
  };

  const doEvaluate = (next: GeneratedProgram): EngineStatus => {
    const lines = next.code.split("\n");
    const errorLine = lines.findIndex((l) => l.includes("ERROR"));
    if (errorLine >= 0) {
      const line = errorLine + 1;
      const trackId = Object.entries(next.lines).find(([, r]) => line >= r.start && line <= r.end)?.[0];
      setStatus({
        ok: false,
        evaluatedAt: status.evaluatedAt,
        error: { kind: "eval", message: "ERROR is not defined", line, ...(trackId ? { trackId } : {}) },
      });
      return status;
    }
    if (playing) reanchor(getCycle());
    program = next;
    cps = cpsOf(next.code) ?? cps;
    setStatus({ ok: true, evaluatedAt: now() });
    return status;
  };

  const meters = (): MeterSnapshot => {
    const ids = program ? Object.keys(program.lines) : [];
    if (!playing) {
      return { tracks: Object.fromEntries(ids.map((id) => [id, [0, 0] as const])), orbits: {}, master: [0, 0] };
    }
    const t = now() / 1000;
    const tracks = Object.fromEntries(
      ids.map((id, i) => {
        const l = 0.5 + 0.4 * Math.sin(t * 2 * Math.PI * 0.5 + i);
        const r = 0.5 + 0.4 * Math.sin(t * 2 * Math.PI * 0.5 + i + 0.3);
        return [id, [l, r] as const];
      }),
    );
    const master = 0.6 + 0.3 * Math.sin(t * 2 * Math.PI * 0.25);
    return { tracks, orbits: { 1: [master, master] }, master: [master, master] };
  };

  const engine: FakeEngine = {
    async init() {
      initCount += 1;
      if (options.initError) throw new Error(options.initError);
      if (ready) return;
      ready = true;
      const queued = pending;
      pending = null;
      if (queued) doEvaluate(queued);
    },
    get ready() {
      return ready;
    },
    async evaluate(next) {
      evaluations.push(next);
      if (!ready) {
        pending = next;
        return status;
      }
      return doEvaluate(next);
    },
    get status() {
      return status;
    },
    onStatus(cb): Unsubscribe {
      statusSubs.add(cb);
      return () => statusSubs.delete(cb);
    },
    play() {
      if (playing) return;
      reanchor(anchorCycle);
      playing = true;
      emitTransport();
    },
    pause() {
      if (!playing) return;
      anchorCycle = getCycle();
      playing = false;
      emitTransport();
    },
    stop() {
      const wasPlaying = playing;
      playing = false;
      anchorCycle = loop.enabled ? loop.startBar - 1 : 0;
      if (wasPlaying) emitTransport();
    },
    toStart() {
      reanchor(0);
    },
    seek(cycle) {
      reanchor(Math.max(0, cycle));
    },
    setLoop(next) {
      if (playing) reanchor(getCycle());
      loop = { ...next };
    },
    setSongLength(bars) {
      songLength = bars;
    },
    get playing() {
      return playing;
    },
    onTransport(cb): Unsubscribe {
      transportSubs.add(cb);
      return () => transportSubs.delete(cb);
    },
    getCycle,
    getCps: () => cps,
    setLookahead(ms) {
      lookahead = Math.min(1000, Math.max(20, ms));
    },
    getLookahead: () => lookahead,
    async preview(sound) {
      previews.push(sound);
    },
    async registerSamples() {},
    setLimiter() {},
    getMeters: meters,
    async setOutputDevice(deviceId) {
      outputDevice = deviceId;
      return true;
    },
    async listOutputDevices(): Promise<OutputDevice[]> {
      return [{ id: "default", label: "System default" }];
    },
    sampleRate: 48000,
    async renderOffline(_program: GeneratedProgram, _opts: RenderOptions): Promise<AudioBuffer> {
      throw new Error("The fake engine can't render audio");
    },
    startCapture() {
      return () => {};
    },
    dispose() {
      playing = false;
      statusSubs.clear();
      transportSubs.clear();
    },
    get evaluations() {
      return evaluations;
    },
    get previews() {
      return previews;
    },
    get loop() {
      return loop;
    },
    get songLength() {
      return songLength;
    },
    get outputDevice() {
      return outputDevice;
    },
    get initCount() {
      return initCount;
    },
  };
  return engine;
}
