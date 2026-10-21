/**
 * Master chain and meters (DECISIONS V9, V10).
 *
 *   superdough destinationGain → input → [limiter] → output → destination
 *                                                    output → L/R analysers (master meter)
 *                                                    output → capture taps
 *
 * Strudel has no master limiter; the chain is re-attached whenever superdough's controller rebuilds
 * its output (controller reset) or is replaced.
 */
import type { MeterLevel } from "@phyllo/model";
import type { SuperdoughAudioController } from "@strudel/webaudio";

export const SILENT: MeterLevel = [0, 0];

/** Linear peak of a time-domain buffer. */
export function peakOf(buf: Float32Array): number {
  let p = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i] ?? 0);
    if (v > p) p = v;
  }
  return p;
}

export interface StereoMeter {
  read(): MeterLevel;
  disconnect(): void;
}

/** L/R peak meter tapping `source` (no output connection needed; analysers are read-only taps). */
export function createStereoMeter(ctx: BaseAudioContext, source: AudioNode, fftSize = 2048): StereoMeter {
  const splitter = ctx.createChannelSplitter(2);
  const left = ctx.createAnalyser();
  const right = ctx.createAnalyser();
  left.fftSize = right.fftSize = fftSize;
  source.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 1);
  const buf = new Float32Array(fftSize);
  return {
    read() {
      left.getFloatTimeDomainData(buf);
      const l = peakOf(buf);
      right.getFloatTimeDomainData(buf);
      return [l, peakOf(buf)];
    },
    disconnect() {
      try {
        source.disconnect(splitter);
      } catch {
        // already gone with its graph
      }
      splitter.disconnect();
    },
  };
}

/** Mono analyser (Strudel's `.analyze()` downmixes) read as [p, p]. */
export function readMonoAnalyser(analyser: AnalyserNode, scratch: { buf?: Float32Array<ArrayBuffer> }): MeterLevel {
  if (!scratch.buf || scratch.buf.length !== analyser.fftSize) scratch.buf = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(scratch.buf);
  const p = peakOf(scratch.buf);
  return [p, p];
}

export interface MasterChain {
  readonly ctx: BaseAudioContext;
  readonly output: GainNode;
  /** Wires `controller`'s output into the chain (idempotent, re-run after resets). */
  attach(controller: SuperdoughAudioController): void;
  /** True if `controller`'s current destinationGain is wired into this chain. */
  isAttached(controller: SuperdoughAudioController): boolean;
  setLimiter(on: boolean): void;
  readMaster(): MeterLevel;
  dispose(): void;
}

/** Limiter settings: brickwall-ish DynamicsCompressor just below 0 dBFS. */
export const LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.002, release: 0.12 } as const;

export function createMasterChain(ctx: BaseAudioContext, limiterOn: boolean): MasterChain {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMITER.threshold;
  limiter.knee.value = LIMITER.knee;
  limiter.ratio.value = LIMITER.ratio;
  limiter.attack.value = LIMITER.attack;
  limiter.release.value = LIMITER.release;
  limiter.connect(output);
  output.connect(ctx.destination);
  const meter = createStereoMeter(ctx, output);

  let on = limiterOn;
  const route = () => {
    input.disconnect();
    input.connect(on ? limiter : output);
  };
  route();

  const wired = new WeakSet<AudioNode>();
  const patched = new WeakSet<object>();

  const attach = (controller: SuperdoughAudioController) => {
    const out = controller.output as SuperdoughAudioController["output"] & { initializeAudio?: () => void };
    if (!patched.has(out) && typeof out.initializeAudio === "function") {
      // superdough's reset() calls initializeAudio(), which rebuilds destinationGain → destination
      const original = out.initializeAudio.bind(out);
      out.initializeAudio = () => {
        original();
        wire(out.destinationGain);
      };
      patched.add(out);
    }
    wire(out.destinationGain);
  };

  const wire = (gain: GainNode | null | undefined) => {
    if (!gain || wired.has(gain)) return;
    gain.disconnect();
    gain.connect(input);
    wired.add(gain);
  };

  return {
    ctx,
    output,
    attach,
    isAttached: (controller) => !!controller.output.destinationGain && wired.has(controller.output.destinationGain),
    setLimiter(next) {
      if (next === on) return;
      on = next;
      route();
    },
    readMaster: () => meter.read(),
    dispose() {
      meter.disconnect();
      input.disconnect();
      limiter.disconnect();
      output.disconnect();
    },
  };
}

/** Per-orbit meters on `controller.nodes[n].output`, rebuilt when an orbit object is replaced. */
export function createOrbitMeters(ctx: BaseAudioContext) {
  const meters = new Map<number, { node: AudioNode; meter: StereoMeter }>();
  return {
    read(controller: SuperdoughAudioController | undefined): Record<number, MeterLevel> {
      const out: Record<number, MeterLevel> = {};
      if (!controller) return out;
      for (const [key, orbit] of Object.entries(controller.nodes)) {
        const n = Number(key);
        let entry = meters.get(n);
        if (!entry || entry.node !== orbit.output) {
          entry?.meter.disconnect();
          entry = { node: orbit.output, meter: createStereoMeter(ctx, orbit.output, 1024) };
          meters.set(n, entry);
        }
        out[n] = entry.meter.read();
      }
      return out;
    },
    dispose() {
      for (const { meter } of meters.values()) meter.disconnect();
      meters.clear();
    },
  };
}
