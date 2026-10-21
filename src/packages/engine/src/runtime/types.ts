import type { EngineStatus, GeneratedProgram, MeterLevel } from "@phyllo/model";

export type Unsubscribe = () => void;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type EngineLogger = (message: string, level: LogLevel) => void;

export interface MidiOutMessage {
  /** Raw MIDI bytes, status byte first. */
  bytes: number[];
  /** Delay in ms from now (when the bridge receives it). Missing = now. */
  atMs?: number;
}

export interface OscOutMessage {
  address: string;
  args: (number | string)[];
  atMs?: number;
}

/** Native side (Tauri, T6.2). The app maps port names to its port ids. */
export interface NativeBridge {
  /** `portName` is the `.midi("<name>")` argument, or null for "the default enabled output". */
  midiSend(portName: string | null, messages: MidiOutMessage[]): void;
  oscSend(messages: OscOutMessage[]): void;
}

export interface EngineOptions {
  bridge?: NativeBridge;
  logger?: EngineLogger;
  /** Load Strudel's default drum machines / piano / VCSL maps from the CDN at init (default true; DECISIONS V15). */
  loadDefaultSamples?: boolean;
  /** Scheduler look-ahead in ms (default 100, Strudel's fixed value; DECISIONS V16). */
  lookaheadMs?: number;
}

/** Bars are 1-based and inclusive, like `Project.loop`. */
export interface LoopSettings {
  enabled: boolean;
  startBar: number;
  endBar: number;
}

export interface TransportState {
  playing: boolean;
}

export interface MeterSnapshot {
  tracks: Record<string, MeterLevel>;
  orbits: Record<number, MeterLevel>;
  master: MeterLevel;
}

export interface PreviewSound {
  s: string;
  bank?: string | null;
  note?: string | number;
  n?: number;
}

export interface RenderOptions {
  /** Song cycles, 0-based; `toCycle` exclusive. */
  fromCycle: number;
  toCycle: number;
  /** Extra seconds rendered after `toCycle` for release/reverb/delay tails. */
  tailSec: number;
  sampleRate: number;
  /** Render only these tracks (stems): every other track's `$:` gets the `_` mute prefix. */
  soloTrackIds?: string[];
}

export interface OutputDevice {
  id: string;
  label: string;
}

export interface PhylloEngine {
  /** Call from a user gesture. Idempotent; resumes the AudioContext (DECISIONS V14). */
  init(): Promise<void>;
  readonly ready: boolean;

  /**
   * Hot-swaps the program without stopping. On any error the last good program keeps playing and the
   * status names the track (DECISIONS V8). Before `init` the program is kept and evaluated by `init`.
   */
  evaluate(program: GeneratedProgram): Promise<EngineStatus>;
  readonly status: EngineStatus;
  onStatus(cb: (status: EngineStatus) => void): Unsubscribe;

  play(): void;
  pause(): void;
  /** Stops and returns to the loop start (loop on) or cycle 0. */
  stop(): void;
  /** Moves to cycle 0 without stopping. */
  toStart(): void;
  /** Moves to a song cycle without stopping. */
  seek(cycle: number): void;
  setLoop(loop: LoopSettings): void;
  /** With loop off, playback stops (and returns to 0) when the playhead reaches the song end. 0 = no end. */
  setSongLength(bars: number): void;
  readonly playing: boolean;
  onTransport(cb: (state: TransportState) => void): Unsubscribe;
  /** Heard position in song cycles (0-based), already wrapped by the loop. Pull this from rAF. */
  getCycle(): number;
  getCps(): number;
  /** Scheduler look-ahead (DECISIONS V16). Applies immediately; a running transport restarts in place. */
  setLookahead(ms: number): void;
  getLookahead(): number;

  preview(sound: PreviewSound, durationSec?: number): Promise<void>;
  /** Registers `{ name: [url, …] }` (e.g. convertFileSrc URLs) and preloads every buffer. */
  registerSamples(map: Record<string, string[]>, baseUrl?: string): Promise<void>;
  setLimiter(on: boolean): void;
  /** Linear peaks 0–1, [left, right]. All zero while stopped. Pull this from rAF. */
  getMeters(): MeterSnapshot;
  /** `AudioContext.setSinkId` when supported; false otherwise (SPEC §10 Q2). null = system default. */
  setOutputDevice(deviceId: string | null): Promise<boolean>;
  listOutputDevices(): Promise<OutputDevice[]>;
  readonly sampleRate: number;

  /** Faster-than-real-time render on an OfflineAudioContext (DECISIONS V11). */
  renderOffline(program: GeneratedProgram, opts: RenderOptions): Promise<AudioBuffer>;
  /** Real-time master tap (after the limiter). Returns a stop function. */
  startCapture(onChunk: (pcm: Float32Array[], sampleRate: number) => void): () => void;
  dispose(): void;
}
