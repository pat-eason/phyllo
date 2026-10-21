/**
 * Extra ambient declarations used by the runtime (src/runtime). They merge with
 * `strudel.d.ts` (DECISIONS V17). Loosely typed: only what the runtime calls.
 */

declare module "@strudel/core" {
  export interface State {
    span: TimeSpan;
    controls: Record<string, unknown>;
    setSpan(span: TimeSpan): State;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must repeat the type parameter to merge
  export interface Hap<T = unknown> {
    ensureObjectValue(): void;
    wholeOrPart(): TimeSpan;
  }

  export interface Pattern<T = unknown> {
    /** Non-patternified `early` (register() adds `_name` for arity > 1). */
    _early(t: number): Pattern<T>;
    queryArc(begin: number | Fraction, end: number | Fraction, controls?: Record<string, unknown>): Hap<T>[];
  }

  export interface CyclistOptions {
    onTrigger?: (hap: Hap, deadline: number, duration: number, cps: number, t: number) => unknown;
    onToggle?: (started: boolean) => void;
    onError?: (err: unknown) => void;
    getTime: () => number;
    /** Fixed trigger time offset in seconds (default 0.1). */
    latency?: number;
    interval?: number;
    beforeStart?: () => unknown;
  }

  /** Runtime-visible fields of the scheduler used by the transport clock (cyclist.mjs). */
  export interface Cyclist {
    lastBegin: number;
    lastEnd: number;
    lastTick: number;
    num_ticks_since_cps_change: number;
    pattern?: Pattern;
    clock: { duration: number; interval: number; minLatency: number };
  }
  export const Cyclist: new (options: CyclistOptions) => Cyclist;

  export function getTrigger(o: {
    getTime: () => number;
    defaultOutput: (hap: Hap, deadline: number, duration: number, cps: number, t: number) => unknown;
  }): (hap: Hap, deadline: number, duration: number, cps: number, t: number) => Promise<void>;

  export function setTime(fn: () => number): void;
  export function setCpsFunc(fn: () => number): void;
  export function setIsStarted(started: boolean): void;
  export function setTriggerFunc(fn: unknown): void;
  export function reset_state(): void;
  export function noteToMidi(note: string, defaultOctave?: number): number;
  export function isNote(name: unknown): boolean;
  export function parseNumeral(v: unknown): number;
  export function getSoundIndex(n: unknown, numSounds: number): number;
}

declare module "@strudel/webaudio" {
  export function aliasBank(url: string): Promise<void>;
  export function getSampleInfo(
    value: Record<string, unknown>,
    bank: unknown,
  ): { url: string; index: number; label: string; playbackRate: number };
  export function setMaxPolyphony(n?: number): void;
  export const DEFAULT_MAX_POLYPHONY: number;

  export interface SuperdoughAudioController {
    /** Disconnects every orbit and bus (cutting all voices and tails) and rebuilds the output (superdough.mjs). */
    reset(): void;
  }
}

declare module "@strudel/soundfonts" {
  export function getFontBufferSource(
    font: string,
    value: Record<string, unknown>,
    ac: BaseAudioContext,
  ): Promise<AudioBufferSourceNode>;
}
