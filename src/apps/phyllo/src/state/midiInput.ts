import type { PhylloEngine, PreviewSound } from "@phyllo/engine";
import { PARAM_SPECS, findTrack } from "@phyllo/model";
import type { ParamName, Track } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { NativeApi } from "../native/api";
import type { MidiMessageEvent, MidiPortInfo } from "../native/types";
import type { EngineHost } from "./engineHost";
import type { Unsubscribe } from "./feed";
import type { ProjectStoreState } from "./projectStore";
import type { SettingsStoreState } from "./settingsStore";

/**
 * General MIDI percussion (channel 10) → Strudel drum-machine sound names. Pads and drum controllers send these,
 * so a KeyStep or a pad bank plays a drum track's kit and records onto its step pattern.
 */
export const GM_DRUMS: Readonly<Record<number, string>> = Object.freeze({
  35: "bd",
  36: "bd",
  37: "rim",
  38: "sd",
  39: "cp",
  40: "sd",
  41: "lt",
  42: "hh",
  43: "lt",
  44: "hh",
  45: "mt",
  46: "oh",
  47: "mt",
  48: "ht",
  49: "cr",
  50: "ht",
  51: "rd",
  52: "cr",
  53: "rd",
  54: "tb",
  55: "cr",
  56: "cb",
  57: "cr",
  59: "rd",
  69: "sh",
  70: "sh",
  82: "sh",
});

/** Drum sounds in the order recorded rows are written (kick first, like the starters). */
export const DRUM_ROW_ORDER: readonly string[] = ["bd", "sd", "rim", "cp", "lt", "mt", "ht", "hh", "oh", "cr", "rd", "cb", "tb", "sh"];

const PITCH_CLASSES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"] as const;

/** MIDI note → Strudel note name (`60` → `c4`, `61` → `db4`; Strudel's `noteToMidi` puts C4 at 60). */
export function midiNoteName(note: number): string {
  const n = Math.round(note);
  return `${PITCH_CLASSES[((n % 12) + 12) % 12] ?? "c"}${Math.floor(n / 12) - 1}`;
}

/** The sound a sample track plays: its source sound, else the first sound name in its pattern. */
export function sampleSoundOf(track: Track): string | null {
  if (track.source.sound) return track.source.sound;
  return /[A-Za-z][\w.-]*/.exec(track.pattern.replace(/<|>|\[|\]/g, " "))?.[0] ?? null;
}

/** MIDI velocity 1–127 → preview gain 0–1 (two decimals). */
export function velocityToGain(velocity: number): number {
  return Math.round((Math.min(127, Math.max(0, velocity)) / 127) * 100) / 100;
}

/**
 * What a note played on a MIDI keyboard sounds like on `track` (SPEC §6.6 "KeyStep in → play the selected track"):
 * drum → the GM drum sound on the track's bank (unmapped notes are silent); melodic/chord → the track's instrument
 * at that pitch; sample → the track's sample; code → nothing (no single sound to play).
 */
export function previewForNote(track: Track, note: number, velocity: number): PreviewSound | null {
  const gain = velocityToGain(velocity);
  switch (track.kind) {
    case "drum": {
      const s = GM_DRUMS[note];
      return s ? { s, bank: track.source.bank, gain } : null;
    }
    case "melodic":
    case "chord":
      return { s: track.source.sound ?? "triangle", note, gain };
    case "sample": {
      const s = sampleSoundOf(track);
      return s ? { s, gain } : null;
    }
    default:
      return null;
  }
}

export interface MidiInputState {
  /** Enabled input ports that are open right now. */
  openPorts: readonly string[];
  /** One-time hint when notes arrive before audio was started (WebAudio needs a click first). */
  hint: string | null;
  dismissHint(): void;
}

export interface MidiInputTiming {
  /** Minimum ms between CC-driven param writes (≤ 30 Hz). */
  ccIntervalMs: number;
  /** A CC burst (one undo step) ends after this much silence. */
  ccIdleMs: number;
  /** How long a previewed note sounds (previews have no note-off). */
  noteSec: number;
}

export const DEFAULT_MIDI_INPUT_TIMING: Readonly<MidiInputTiming> = Object.freeze({ ccIntervalMs: 33, ccIdleMs: 300, noteSec: 0.5 });

export const AUDIO_HINT = "Press Play once to turn on audio, then your MIDI keys will play the selected track.";

export interface MidiInputDeps {
  native: NativeApi;
  settings: StoreApi<SettingsStoreState>;
  project: StoreApi<ProjectStoreState>;
  host: EngineHost;
  /** epoch ms; default `Date.now` (follows fake timers). */
  now?: () => number;
  timing?: Partial<MidiInputTiming>;
  onError?: (message: string, error: unknown) => void;
}

export interface MidiInputHandle {
  store: StoreApi<MidiInputState>;
  /** Every message from an enabled, open input (the recorder listens here). */
  onMessage(callback: (message: MidiMessageEvent) => void): Unsubscribe;
  /** Open the enabled inputs and follow settings + hot-plug. Idempotent. */
  start(): Promise<void>;
  dispose(): void;
}

const isInputId = (id: string) => id.startsWith("in:");

interface PendingParam {
  trackId: string;
  param: ParamName;
  value: number;
}

/**
 * MIDI input → the selected track (B4): opens `settings.midi.enabledPorts` inputs (closing removed ones, re-opening
 * on hot-plug); note-ons preview the selected track's sound with velocity → gain; CCs in `settings.midi.ccMap`
 * (keyed `String(cc)`, D121) set that knob on the selected track, at most ~30 writes/s, one undo step per burst.
 * Nothing touches MIDI until an input is enabled (Web MIDI asks for permission).
 */
export function createMidiInput(deps: MidiInputDeps): MidiInputHandle {
  const { native, host } = deps;
  const now = deps.now ?? (() => Date.now());
  const timing: MidiInputTiming = { ...DEFAULT_MIDI_INPUT_TIMING, ...deps.timing };
  const onError = deps.onError ?? (() => {});
  const listeners = new Set<(message: MidiMessageEvent) => void>();
  const cleanups: Unsubscribe[] = [];
  const open = new Set<string>();
  /** Inputs that exist right now (null until the first listing). */
  let available: Set<string> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;
  let started: Promise<void> | undefined;
  let hinted = false;
  const reported = new Set<string>();

  const store = createStore<MidiInputState>()((set) => ({
    openPorts: [],
    hint: null,
    dismissHint: () => set({ hint: null }),
  }));

  const reportOnce = (key: string, message: string, error: unknown) => {
    if (reported.has(key)) return;
    reported.add(key);
    onError(message, error);
  };
  const publishOpen = () => store.setState({ openPorts: [...open].sort() });
  const wanted = () => deps.settings.getState().settings.midi.enabledPorts.filter(isInputId);

  /** Bring the open set in line with settings and the available ports. Serialized. */
  const reconcile = () => {
    chain = chain.then(async () => {
      if (disposed) return;
      const want = wanted();
      if (want.length && available === null) {
        try {
          available = new Set((await native.midiListPorts()).filter((p) => p.direction === "in").map((p) => p.id));
        } catch (error) {
          reportOnce("list", "Couldn't list MIDI ports", error);
          return;
        }
      }
      for (const id of [...open]) {
        if (want.includes(id) && available?.has(id)) continue;
        open.delete(id);
        await native.midiCloseInput(id).catch(() => undefined);
      }
      for (const id of want) {
        if (open.has(id) || !available?.has(id) || disposed) continue;
        try {
          await native.midiOpenInput(id);
          open.add(id);
        } catch (error) {
          reportOnce(`open:${id}`, `Couldn't open MIDI input ${id}`, error);
        }
      }
      publishOpen();
    });
    return chain;
  };

  const onPorts = (ports: MidiPortInfo[]) => {
    available = new Set(ports.filter((p) => p.direction === "in").map((p) => p.id));
    // Ports that vanished were closed natively; re-plugged ones are opened again.
    for (const id of [...open]) if (!available.has(id)) open.delete(id);
    void reconcile();
  };

  const selectedTrack = (): Track | undefined => {
    const project = deps.project.getState().project;
    const id = project.ui.selectedTrack;
    return id ? findTrack(project, id) : undefined;
  };

  // ── notes ────────────────────────────────────────────────────────────────

  const playNote = (note: number, velocity: number) => {
    const track = selectedTrack();
    if (!track) return;
    const sound = previewForNote(track, note, velocity);
    if (!sound) return;
    const engine: PhylloEngine | null = host.peek();
    if (!engine?.ready) {
      if (!hinted) {
        hinted = true;
        store.setState({ hint: AUDIO_HINT });
      }
      return;
    }
    engine.preview(sound, timing.noteSec).catch((error: unknown) => reportOnce(`preview:${sound.s}`, `Couldn't play ${sound.s}`, error));
  };

  // ── CC → knobs ───────────────────────────────────────────────────────────

  const pending = new Map<string, PendingParam>();
  let inGesture = false;
  let lastFlush = -Infinity;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    if (!pending.size) return;
    lastFlush = now();
    const writes = [...pending.values()];
    pending.clear();
    const { project, dispatch } = deps.project.getState();
    for (const w of writes) {
      if (!findTrack(project, w.trackId)) continue;
      dispatch({ type: "track/setParam", trackId: w.trackId, param: w.param, value: w.value });
    }
  };

  const endBurst = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = undefined;
    flush();
    if (inGesture) {
      inGesture = false;
      deps.project.getState().endGesture();
    }
  };

  const applyCc = (cc: number, value: number) => {
    const entry = deps.settings.getState().settings.midi.ccMap[String(cc)];
    if (!entry) return;
    const spec = PARAM_SPECS[entry.trackParam];
    const track = selectedTrack();
    if (!spec || !track) return;
    pending.set(`${track.id}\u0000${entry.trackParam}`, {
      trackId: track.id,
      param: entry.trackParam,
      value: spec.fromKnob(Math.min(127, Math.max(0, value)) / 127),
    });
    if (!inGesture) {
      inGesture = true;
      deps.project.getState().beginGesture();
    }
    const wait = lastFlush + timing.ccIntervalMs - now();
    if (wait <= 0) flush();
    else flushTimer ??= setTimeout(flush, wait);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(endBurst, timing.ccIdleMs);
  };

  const onMidi = (message: MidiMessageEvent) => {
    if (!open.has(message.portId)) return;
    for (const listener of [...listeners]) listener(message);
    if (message.kind === "noteon") playNote(message.data1, message.data2);
    else if (message.kind === "cc") applyCc(message.data1, message.data2);
  };

  const subscribeNative = async (subscribe: () => Promise<Unsubscribe>, what: string): Promise<void> => {
    try {
      const off = await subscribe();
      if (disposed) off();
      else cleanups.push(off);
    } catch (error) {
      reportOnce(what, `Couldn't listen for ${what}`, error);
    }
  };

  return {
    store,
    onMessage(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    start() {
      started ??= (async () => {
        cleanups.push(
          deps.settings.subscribe((state, prev) => {
            if (state.settings.midi.enabledPorts !== prev.settings.midi.enabledPorts) void reconcile();
          }),
        );
        await subscribeNative(() => native.onMidiMessage(onMidi), "MIDI messages");
        await subscribeNative(() => native.onMidiPortsChanged(onPorts), "MIDI devices");
        await reconcile();
      })();
      return started;
    },
    dispose() {
      if (disposed) return;
      endBurst();
      disposed = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      listeners.clear();
      for (const id of open) void native.midiCloseInput(id).catch(() => undefined);
      open.clear();
    },
  };
}
