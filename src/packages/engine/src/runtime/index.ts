// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient Strudel declarations for consumers' tsc (V17)
/// <reference path="../types/strudel-runtime.d.ts" />
// Strudel runtime (T1.5): audio init, evaluation + hot-swap, transport clock, previews, master chain,
// meters, offline render / capture, MIDI + OSC outputs.

export { createEngine, DEFAULT_LOOKAHEAD_MS, EngineEvalError, MAX_SAMPLE_RATE, MIN_SAMPLE_RATE, requestedSampleRate } from "./engine";
export type {
  EngineLogger,
  EngineOptions,
  LogLevel,
  LoopSettings,
  MeterSnapshot,
  MidiOutMessage,
  NativeBridge,
  OscOutMessage,
  OutputDevice,
  PhylloEngine,
  PreviewSound,
  RenderOptions,
  TransportState,
  Unsubscribe,
} from "./types";

// Pure helpers (also used by the app and export pipeline)
export { positionFromCycle, loopToCycles } from "./transport";
export { soloTracks } from "./stems";
export { hapToMidiMessages } from "./midi";
export { oscControlsFromHap, oscArgs } from "./osc";
export { trackAtLine } from "./errors";
export type { PhylloEngineError } from "./errors";
export { DEFAULT_SAMPLE_SOURCES, STRUDEL_CDN, SOUNDFONT_BASE, listBuiltInSoundUrls, sampleMapFileUrls } from "./samples";
export type { BuiltInSoundOptions, UrlResolver } from "./samples";
export { LIMITER } from "./master";
export { clickPattern, METRONOME_ORBIT } from "./metronome";
export type { MetronomeSettings } from "./metronome";
export { DEFAULT_VELOCITY, GM_DRUM_NOTES, midiNoteOf, midiVelocityOf, queryNoteEvents } from "./notes";
export type { NoteEvent, NoteQueryOptions } from "./notes";
