// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient Strudel declarations for consumers' tsc (V17)
/// <reference path="../types/strudel-runtime.d.ts" />
// Strudel runtime (T1.5): audio init, evaluation + hot-swap, transport clock, previews, master chain,
// meters, offline render / capture, MIDI + OSC outputs.

export { createEngine, DEFAULT_LOOKAHEAD_MS, EngineEvalError } from "./engine";
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
export { DEFAULT_SAMPLE_SOURCES, STRUDEL_CDN } from "./samples";
export { LIMITER } from "./master";
