// Test doubles for T6.5 (sample folders, MIDI input, recorder): wrap the in-memory browser NativeApi and the fake
// engine instead of editing them. Not exported from the state barrel.
import type { PreviewSound } from "@phyllo/engine";
import type { NativeApi } from "../native/api";
import { NativeError } from "../native/errors";
import type { MidiMessageEvent, MidiMessageKind, MidiPortInfo, SampleFile, SamplesChangedEvent } from "../native/types";
import { createFakeEngine } from "./fakeEngine";
import type { FakeEngine, FakeEngineOptions } from "./fakeEngine";
import { createMockNative } from "./mocks";

export const KEYSTEP: MidiPortInfo = { id: "in:KeyStep 37:0", name: "KeyStep 37", direction: "in" };
export const LAUNCH_CONTROL: MidiPortInfo = { id: "in:Launch Control XL:0", name: "Launch Control XL", direction: "in" };
export const IAC_OUT: MidiPortInfo = { id: "out:IAC Driver Bus 1:0", name: "IAC Driver Bus 1", direction: "out" };

export interface FakeMidiNative {
  native: NativeApi;
  /** Inputs open right now. */
  readonly openInputs: ReadonlySet<string>;
  /** How many times the port list was read. */
  readonly listCalls: number;
  /** Deliver one incoming message to every `onMidiMessage` listener (only if the port is open, like the real side). */
  send(message: { portId: string; kind: MidiMessageKind; data1: number; data2: number; channel?: number }): void;
  noteOn(portId: string, note: number, velocity?: number): void;
  cc(portId: string, controller: number, value: number): void;
  /** Hot-plug: replace the port list and notify `onMidiPortsChanged` (vanished open inputs close, as natively). */
  setPorts(ports: MidiPortInfo[]): void;
}

/** The browser NativeApi with scriptable MIDI ports. */
export function withFakeMidi(ports: MidiPortInfo[], base: NativeApi = createMockNative()): FakeMidiNative {
  let current = [...ports];
  const open = new Set<string>();
  const messageListeners = new Set<(m: MidiMessageEvent) => void>();
  const portListeners = new Set<(p: MidiPortInfo[]) => void>();
  let listCalls = 0;
  let clock = 0;

  const native: NativeApi = {
    ...base,
    midiListPorts: async () => {
      listCalls += 1;
      return [...current];
    },
    midiOpenInput: async (id) => {
      if (!current.some((p) => p.id === id && p.direction === "in")) throw new NativeError("not_found", `not found: ${id}`);
      open.add(id);
    },
    midiCloseInput: async (id) => {
      open.delete(id);
    },
    onMidiMessage: async (callback) => {
      messageListeners.add(callback);
      return () => {
        messageListeners.delete(callback);
      };
    },
    onMidiPortsChanged: async (callback) => {
      portListeners.add(callback);
      return () => {
        portListeners.delete(callback);
      };
    },
  };

  const send: FakeMidiNative["send"] = ({ portId, kind, data1, data2, channel = 1 }) => {
    if (!open.has(portId)) return;
    clock += 1000;
    const status = (kind === "noteon" ? 0x90 : kind === "noteoff" ? 0x80 : 0xb0) | (channel - 1);
    const message: MidiMessageEvent = { portId, kind, channel, data1, data2, status, timestampUs: clock };
    for (const listener of [...messageListeners]) listener(message);
  };

  return {
    native,
    get openInputs() {
      return open;
    },
    get listCalls() {
      return listCalls;
    },
    send,
    noteOn: (portId, note, velocity = 100) => send({ portId, kind: "noteon", data1: note, data2: velocity }),
    cc: (portId, controller, value) => send({ portId, kind: "cc", data1: controller, data2: value }),
    setPorts(next) {
      current = [...next];
      for (const id of [...open]) if (!current.some((p) => p.id === id)) open.delete(id);
      for (const listener of [...portListeners]) listener([...current]);
    },
  };
}

export interface FakeSampleNative {
  native: NativeApi;
  /** Every `sampleFoldersWatch` argument, oldest first. */
  readonly watched: readonly (readonly string[])[];
  /** Replace a folder's contents (a string = the scan fails with that message). */
  setFolder(path: string, files: readonly string[] | string): void;
  /** Fire `samples://changed` for `folder`. */
  changed(folder: string): void;
}

/** `/Samples/vox.wav` → `{ name: "vox", path, ext: "wav" }`; names are given already unique per folder, as Rust does. */
export function sampleFile(path: string, name?: string): SampleFile {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return { name: name ?? base.slice(0, dot).toLowerCase(), path, ext: base.slice(dot + 1).toLowerCase() };
}

/** The browser NativeApi with scriptable sample folders; `convertFileSrc` returns `asset://localhost<path>`. */
export function withFakeSamples(folders: Record<string, readonly string[] | string>, base: NativeApi = createMockNative()): FakeSampleNative {
  const contents = new Map(Object.entries(folders));
  const watched: string[][] = [];
  const listeners = new Set<(e: SamplesChangedEvent) => void>();
  const native: NativeApi = {
    ...base,
    sampleFolderScan: async (path) => {
      const entry = contents.get(path);
      if (entry === undefined) throw new NativeError("not_found", `not found: sample folder ${path}`);
      if (typeof entry === "string") throw new NativeError("io", entry);
      return { path, files: entry.map((p) => sampleFile(p)) };
    },
    sampleFoldersWatch: async (paths) => {
      watched.push([...paths]);
    },
    onSamplesChanged: async (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    convertFileSrc: (path) => `asset://localhost${path}`,
  };
  return {
    native,
    watched,
    setFolder(path, files) {
      contents.set(path, files);
    },
    changed(folder) {
      for (const listener of [...listeners]) listener({ folder });
    },
  };
}

export interface ObservedEngine {
  engine: FakeEngine;
  /** Every `registerSamples` map, oldest first. */
  readonly registered: readonly Record<string, string[]>[];
  readonly previews: readonly PreviewSound[];
  /** Pin the cycle `getCycle()` reports (default: the fake engine's own clock). */
  setCycle(cycle: number | null): void;
}

/** A ready fake engine that records `registerSamples` and can pin `getCycle()`. */
export function observedEngine(options: FakeEngineOptions = {}): ObservedEngine {
  const fake = createFakeEngine({ ready: true, ...options });
  const registered: Record<string, string[]>[] = [];
  let pinned: number | null = null;
  const overrides: Partial<FakeEngine> = {
    async registerSamples(map) {
      registered.push(map);
    },
    getCycle: () => pinned ?? fake.getCycle(),
  };
  const engine = new Proxy(fake, {
    get(target, key, receiver) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key as keyof FakeEngine];
      return Reflect.get(target, key, receiver) as unknown;
    },
  });
  return {
    engine,
    registered,
    get previews() {
      return fake.previews;
    },
    setCycle(cycle) {
      pinned = cycle;
    },
  };
}
