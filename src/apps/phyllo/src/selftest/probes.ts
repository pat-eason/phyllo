/**
 * Web-view capability probes for the self-test (T7.5a): things the unit tests and Playwright (Chromium) can't tell
 * us about WKWebView. Each probe resolves a plain object for the report and never throws.
 */
import { errorText } from "./report";
import type { ConsoleEntry, Detail } from "./report";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wraps `window.AudioContext` so every context the engine creates is visible to the self-test (sample rate, latency,
 * `state`, `setSinkId`). Install before the engine's `init()`. Returns the live list.
 */
export function spyAudioContexts(): AudioContext[] {
  const contexts: AudioContext[] = [];
  const Native = window.AudioContext;
  if (typeof Native !== "function") return contexts;
  class SpiedAudioContext extends Native {
    constructor(options?: AudioContextOptions) {
      super(options);
      contexts.push(this);
    }
  }
  window.AudioContext = SpiedAudioContext;
  return contexts;
}

/** Waits until `ctx.state === "running"` or `ms` pass. */
export async function waitRunning(ctx: AudioContext, ms: number): Promise<boolean> {
  const until = performance.now() + ms;
  while (ctx.state !== "running" && performance.now() < until) await sleep(50);
  return ctx.state === "running";
}

/** Live-context facts: rate, latencies, sink API. */
export function contextFacts(ctx: AudioContext): Detail {
  const c = ctx as AudioContext & { setSinkId?: unknown; sinkId?: unknown };
  return {
    state: ctx.state,
    sampleRate: ctx.sampleRate,
    baseLatency: ctx.baseLatency ?? null,
    outputLatency: typeof ctx.outputLatency === "number" ? ctx.outputLatency : null,
    setSinkIdOnInstance: typeof c.setSinkId === "function",
    sinkId: typeof c.sinkId === "string" ? c.sinkId : c.sinkId === undefined ? null : String(c.sinkId),
  };
}

const PROBE_PROCESSOR = `class PhylloProbe extends AudioWorkletProcessor { process() { return false; } }
registerProcessor("phyllo-probe", PhylloProbe);`;

/** `audioWorklet.addModule("data:…")` on an OfflineAudioContext (the same mechanism the capture tap uses). */
export async function probeDataWorklet(): Promise<Detail> {
  if (typeof OfflineAudioContext === "undefined") return { ok: false, reason: "no OfflineAudioContext" };
  try {
    const ctx = new OfflineAudioContext(2, 128, 48000);
    if (!ctx.audioWorklet) return { ok: false, reason: "no audioWorklet on OfflineAudioContext" };
    await ctx.audioWorklet.addModule(`data:text/javascript;charset=utf-8,${encodeURIComponent(PROBE_PROCESSOR)}`);
    const node = new AudioWorkletNode(ctx, "phyllo-probe");
    node.connect(ctx.destination);
    await ctx.startRendering();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: errorText(error) };
  }
}

/** An analyser fed by an oscillator but never connected to the destination: does it still see signal? */
export async function probeUnconnectedAnalyser(ctx: AudioContext): Promise<Detail> {
  try {
    const osc = ctx.createOscillator();
    const silent = ctx.createGain();
    silent.gain.value = 1;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    osc.connect(silent).connect(analyser); // analyser → nowhere
    osc.start();
    await sleep(250);
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    osc.stop();
    osc.disconnect();
    silent.disconnect();
    let peak = 0;
    for (const v of data) peak = Math.max(peak, Math.abs(v));
    return { ok: peak > 0.1, peak: round(peak, 4) };
  } catch (error) {
    return { ok: false, reason: errorText(error) };
  }
}

export function probeMediaRecorder(): Detail {
  if (typeof MediaRecorder === "undefined") return { available: false };
  const types = ["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/ogg", "audio/wav"];
  return {
    available: true,
    supported: types.filter((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch {
        return false;
      }
    }),
  };
}

export function environmentFacts(): Detail {
  const proto = typeof AudioContext === "function" ? (AudioContext.prototype as unknown as Record<string, unknown>) : {};
  return {
    userAgent: navigator.userAgent,
    origin: window.location.origin,
    isSecureContext: window.isSecureContext,
    crossOriginIsolated: typeof crossOriginIsolated === "boolean" ? crossOriginIsolated : null,
    audioContext: typeof AudioContext === "function",
    audioWorkletNode: typeof AudioWorkletNode === "function",
    setSinkIdOnPrototype: typeof proto["setSinkId"] === "function",
    mediaDevices: typeof navigator.mediaDevices?.enumerateDevices === "function",
    mediaSession: "mediaSession" in navigator,
    webMidi: typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === "function",
    notificationApi: typeof Notification === "function" ? Notification.permission : null,
    devicePixelRatio: window.devicePixelRatio,
    visibility: document.visibilityState,
    hasFocus: document.hasFocus(),
  };
}

/**
 * Mirrors console errors/warnings and uncaught errors into `sink` (the originals still run). Returns an uninstaller.
 */
export function captureConsole(sink: (entry: Omit<ConsoleEntry, "at">) => void): () => void {
  const original = { error: console.error, warn: console.warn };
  const text = (args: unknown[]) => args.map((a) => (typeof a === "string" ? a : errorText(a))).join(" ");
  console.error = (...args: unknown[]) => {
    sink({ level: "error", message: text(args) });
    original.error.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    sink({ level: "warn", message: text(args) });
    original.warn.apply(console, args);
  };
  const onError = (e: ErrorEvent) => sink({ level: "uncaught", message: `${e.message} (${e.filename}:${e.lineno})` });
  const onRejection = (e: PromiseRejectionEvent) => sink({ level: "rejection", message: errorText(e.reason) });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    console.error = original.error;
    console.warn = original.warn;
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

export function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export { sleep };
