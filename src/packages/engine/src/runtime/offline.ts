/**
 * Offline render (DECISIONS V11, REPORT (e) Q3): our own loop on an OfflineAudioContext instead of
 * Strudel's `renderPatternAudio` (which closes the live context and is silent with FX).
 *
 * Swap superdough's context + controller → initAudio → schedule every onset in time order with
 * `await superdough(...)` → wait for each orbit's reverb IR (generated async) → startRendering → restore.
 */
import { State, TimeSpan } from "@strudel/core";
import type { Hap, Pattern } from "@strudel/core";
import {
  DEFAULT_MAX_POLYPHONY,
  getAudioContext,
  getSuperdoughAudioController,
  initAudio,
  setAudioContext,
  setMaxPolyphony,
  setSuperdoughAudioController,
  webaudioOutput,
} from "@strudel/webaudio";
import type { SuperdoughAudioController } from "@strudel/webaudio";
import { createMasterChain } from "./master";
import { collectSoundRequests, preloadSounds } from "./samples";

export interface OfflineRenderParams {
  fromCycle: number;
  toCycle: number;
  tailSec: number;
  sampleRate: number;
  limiter: boolean;
  warn: (msg: string) => void;
  /** Max wait for reverb impulse responses. */
  reverbTimeoutMs?: number;
  /** Called once superdough is back on the live context (scheduling done, rendering may still run). */
  onLiveRestored?: () => void;
}

/** Onset haps in `[from, to)` sorted by onset (strict query: throws on pattern errors). */
export function onsetsInRange(pattern: Pattern, from: number, to: number, cps: number): Hap[] {
  const haps = pattern.query(new State(new TimeSpan(from, to), { _cps: cps }));
  return haps
    .filter((h) => h.hasOnset() && h.whole !== undefined && h.whole.begin.valueOf() >= from)
    .sort((a, b) => (a.whole?.begin.valueOf() ?? 0) - (b.whole?.begin.valueOf() ?? 0));
}

/** Seconds of audio for a cycle range at `cps`, plus tail. */
export function renderDurationSec(fromCycle: number, toCycle: number, cps: number, tailSec: number): number {
  return Math.max(0, (toCycle - fromCycle) / cps) + Math.max(0, tailSec);
}

async function waitForReverbs(controller: SuperdoughAudioController, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const pending = Object.values(controller.nodes).some((o) => o.reverbNode && !o.reverbNode.buffer);
    if (!pending) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 5));
  }
}

export async function renderPatternOffline(pattern: Pattern, cps: number, p: OfflineRenderParams): Promise<AudioBuffer> {
  if (!(p.toCycle > p.fromCycle)) throw new Error("renderOffline: toCycle must be greater than fromCycle");
  const seconds = renderDurationSec(p.fromCycle, p.toCycle, cps, p.tailSec);
  const length = Math.max(1, Math.ceil(seconds * p.sampleRate));
  const haps = onsetsInRange(pattern, p.fromCycle, p.toCycle, cps);

  const liveCtx = getAudioContext();
  const liveController = getSuperdoughAudioController();
  const ctx = new OfflineAudioContext(2, length, p.sampleRate);
  let restored = false;
  try {
    setAudioContext(ctx);
    setSuperdoughAudioController(null);
    // every onset is scheduled up front, so lift the voice cap that would cut long notes
    await initAudio({ maxPolyphony: Math.max(DEFAULT_MAX_POLYPHONY, haps.length + 1) });
    const controller = getSuperdoughAudioController();
    const chain = createMasterChain(ctx, p.limiter);
    chain.attach(controller);

    await preloadSounds(collectSoundRequests(haps), ctx);

    let failed = 0;
    for (const hap of haps) {
      if (hap.context["onTrigger"] && hap.context["dominantTrigger"]) continue; // MIDI/OSC-only haps
      const begin = hap.whole?.begin.valueOf() ?? 0;
      const t = (begin - p.fromCycle) / cps;
      try {
        await webaudioOutput(hap, 0, hap.duration.valueOf() / cps, cps, t);
      } catch (err) {
        if (failed++ === 0) p.warn(`offline render: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!(await waitForReverbs(controller, p.reverbTimeoutMs ?? 5000))) p.warn("offline render: reverb IR not ready, tail may be dry");
    // Everything is scheduled: hand superdough back to the live context *before* rendering. Superdough's
    // node pool is shared across contexts, so offline voices must not be released into it while they end
    // during rendering (their release now fails harmlessly instead of poisoning the live pool).
    restore();
    return await ctx.startRendering();
  } finally {
    restore();
  }

  function restore() {
    if (restored) return;
    restored = true;
    setAudioContext(liveCtx);
    setSuperdoughAudioController(liveController);
    setMaxPolyphony(DEFAULT_MAX_POLYPHONY);
    p.onLiveRestored?.();
  }
}

/**
 * While the context is swapped, live voices that end schedule their cleanup through superdough's global
 * context and throw "different audio context" from `onended` (and offline voices do the same once the
 * live context is back). Those cleanups only release nodes. They are stopped at the source by
 * `guardEndedHandlers` (ended-guard.ts); this window listener is only a backstop for any that slip past.
 */
export function suppressCrossContextErrors(e: ErrorEvent): void {
  if (/different audio context/i.test(e.message ?? "")) e.preventDefault();
}
