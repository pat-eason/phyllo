/**
 * Ambient declarations for the Strudel packages (none ship types; DECISIONS V17).
 * Loosely typed on purpose: declare what the engine uses, widen when needed.
 * Ambient module declarations merge, so an area may add `types/strudel-<area>.d.ts`
 * and reference it from `src/index.ts`.
 */

declare module "@strudel/core" {
  export class Fraction {
    constructor(n: number | string);
    valueOf(): number;
    add(f: Fraction | number): Fraction;
    sub(f: Fraction | number): Fraction;
    mul(f: Fraction | number): Fraction;
    div(f: Fraction | number): Fraction;
    sam(): Fraction;
  }
  /** Calling `Fraction(n)` without `new` is how Strudel itself constructs them. */
  export function fraction(n: number | string | Fraction): Fraction;

  export class TimeSpan {
    constructor(begin: Fraction | number, end: Fraction | number);
    begin: Fraction;
    end: Fraction;
  }

  export class State {
    constructor(span: TimeSpan, controls?: Record<string, unknown>);
  }

  export interface Hap<T = unknown> {
    whole: TimeSpan | undefined;
    part: TimeSpan;
    value: T;
    context: { locations?: { start: number; end: number }[]; tags?: string[]; [k: string]: unknown };
    hasOnset(): boolean;
    duration: Fraction;
  }

  export class Pattern<T = unknown> {
    constructor(query: (state: State) => Hap<T>[]);
    query(state: State): Hap<T>[];
    queryArc(begin: number | Fraction, end: number | Fraction): Hap<T>[];
    firstCycle(withContext?: boolean): Hap<T>[];
    early(t: number | Fraction | Pattern): Pattern<T>;
    late(t: number | Fraction | Pattern): Pattern<T>;
    fast(f: number | Pattern): Pattern<T>;
    slow(f: number | Pattern): Pattern<T>;
    ribbon(offset: number, cycles: number): Pattern<T>;
    onTrigger(fn: (...args: unknown[]) => void, dominant?: boolean): Pattern<T>;
    tag(t: string): Pattern<T>;
    p(id: string): Pattern<T>;
    [method: string]: unknown;
  }

  export const silence: Pattern;
  export function pure<T>(v: T): Pattern<T>;
  export function stack(...pats: unknown[]): Pattern;
  export function arrange(...sections: [number, Pattern][]): Pattern;
  export function register(name: string | string[], fn: (...args: never[]) => unknown, patternify?: boolean): unknown;
  export function evalScope(...modules: unknown[]): Promise<unknown[]>;
  export function evaluate(code: string, transpiler?: unknown): Promise<{ pattern: Pattern; meta: unknown; mode: string }>;
  export const logger: (message: string, type?: string, data?: unknown) => void;

  export interface Cyclist {
    started: boolean;
    cps: number;
    latency: number;
    num_cycles_at_cps_change: number;
    seconds_at_cps_change: number;
    now(): number;
    start(): void;
    stop(): void;
    pause(): void;
    setCps(cps: number): void;
    setPattern(pat: Pattern, autostart?: boolean): Promise<void>;
  }

  export interface ReplOptions {
    defaultOutput?: (hap: Hap, deadline: number, duration: number, cps: number, t: number) => unknown;
    getTime?: () => number;
    transpiler?: unknown;
    onEvalError?: (err: Error) => void;
    beforeEval?: (o: { code: string }) => void;
    afterEval?: (o: { code: string; pattern: Pattern; meta: unknown }) => void;
    beforeStart?: () => void;
    onToggle?: (started: boolean) => void;
    editPattern?: (pat: Pattern) => Pattern;
    onUpdateState?: (state: Record<string, unknown>) => void;
    sync?: boolean;
    id?: string;
  }

  export interface Repl {
    scheduler: Cyclist;
    evaluate(code: string, autostart?: boolean, shouldHush?: boolean): Promise<Pattern | undefined>;
    start(): void;
    stop(): void;
    pause(): void;
    setCps(cps: number): void;
    setPattern(pat: Pattern, autostart?: boolean): Promise<void>;
    toggle(): void;
    state: Record<string, unknown>;
  }

  export function repl(options: ReplOptions): Repl;
}

declare module "@strudel/mini" {
  import type { Pattern } from "@strudel/core";
  export function mini(...strings: string[]): Pattern;
  export function m(str: string, offset?: number): Pattern;
  export function h(str: string): Pattern;
  export function miniAllStrings(): void;
  export function getLeafLocations(code: string, start?: number): [number, number][];
}

declare module "@strudel/mini/krill.mjs" {
  export interface KrillLocation { offset: number; line: number; column: number }
  export interface KrillSyntaxError extends Error {
    name: "SyntaxError";
    location: { start: KrillLocation; end: KrillLocation };
  }
  export function parse(input: string, options?: Record<string, unknown>): unknown;
}

declare module "@strudel/transpiler" {
  export function transpiler(code: string, options?: Record<string, unknown>): { output: string; miniLocations?: unknown; widgets?: unknown };
}

declare module "@strudel/tonal" {
  const tonal: Record<string, unknown>;
  export = tonal;
}

declare module "@strudel/webaudio" {
  import type { Hap } from "@strudel/core";

  export interface Orbit {
    output: AudioNode;
    summingNode: AudioNode;
    reverbNode?: ConvolverNode;
    [k: string]: unknown;
  }
  export interface SuperdoughAudioController {
    output: { destinationGain: GainNode; channelMerger: AudioNode; [k: string]: unknown };
    nodes: Record<number, Orbit>;
    [k: string]: unknown;
  }

  export function webaudioOutput(hap: Hap, deadline: number, duration: number, cps: number, t: number): Promise<void>;
  export function initAudio(options?: { audioDeviceName?: string; [k: string]: unknown }): Promise<void>;
  export function initAudioOnFirstClick(options?: Record<string, unknown>): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: BaseAudioContext): BaseAudioContext;
  export function getSuperdoughAudioController(): SuperdoughAudioController;
  export function setSuperdoughAudioController(c: SuperdoughAudioController | null): void;
  export function superdough(value: Record<string, unknown>, deadline: number, duration: number, cps?: number, cycle?: number): Promise<void>;
  export function registerSynthSounds(): void;
  export function registerZZFXSounds(): void;
  export function samples(map: string | Record<string, unknown>, baseUrl?: string, options?: Record<string, unknown>): Promise<void>;
  export function registerSamplesPrefix(prefix: string, resolver: (url: string) => Promise<unknown>): void;
  export function loadBuffer(url: string, ctx: BaseAudioContext, s?: string, n?: number): Promise<AudioBuffer>;
  export function registerSound(name: string, onTrigger: (...args: unknown[]) => unknown, data?: Record<string, unknown>): void;
  export const soundMap: { get(): Record<string, unknown>; [k: string]: unknown };
  export const analysers: Record<string, AnalyserNode>;
  export function getAnalyserById(id: string | number, fftSize?: number, smoothingTimeConstant?: number): AnalyserNode;
}

declare module "@strudel/soundfonts" {
  export function registerSoundfonts(): void;
  export function setSoundfontUrl(url: string): void;
}
