import { NativeError } from './errors';
import type { MidiDirection, MidiMessageEvent, MidiOutMessage, MidiPortInfo, Unsubscribe } from './types';

/**
 * Web MIDI backed MIDI for the browser implementation of `NativeApi` (Chromium dev builds). The pure helpers
 * mirror `src-tauri/src/midi.rs` so both implementations produce identical ids and events.
 */

export type RequestMidiAccess = () => Promise<MIDIAccess>;

/** `navigator.requestMIDIAccess` when the runtime has it. */
export function defaultMidiAccess(): RequestMidiAccess | null {
  const nav = (globalThis as { navigator?: Partial<Navigator> }).navigator;
  const request = nav?.requestMIDIAccess;
  return typeof request === 'function' ? () => request.call(nav) : null;
}

/** `<in|out>:<name>:<index among ports with the same name>`, in enumeration order. */
export function assignPortIds(direction: MidiDirection, names: readonly string[]): MidiPortInfo[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const index = seen.get(name) ?? 0;
    seen.set(name, index + 1);
    return { id: `${direction}:${name}:${index}`, name, direction };
  });
}

/** Same rules as the Rust `parse_message`; `null` for clock, active sensing, SysEx and other system messages. */
export function parseMidiMessage(
  portId: string,
  timestampUs: number,
  bytes: ArrayLike<number>,
): MidiMessageEvent | null {
  const status = bytes[0];
  if (status === undefined) return null;
  const make = (kind: MidiMessageEvent['kind'], channel: number, data1: number, data2: number): MidiMessageEvent => ({
    portId,
    kind,
    channel,
    data1,
    data2,
    status,
    timestampUs,
  });
  if (status >= 0x80 && status <= 0xef) {
    const first = bytes[1];
    if (first === undefined) return null;
    const channel = (status & 0x0f) + 1;
    const d1 = first & 0x7f;
    const d2 = (bytes[2] ?? 0) & 0x7f;
    switch (status & 0xf0) {
      case 0x80:
        return make('noteoff', channel, d1, d2);
      case 0x90:
        return d2 === 0 ? make('noteoff', channel, d1, 0) : make('noteon', channel, d1, d2);
      case 0xb0:
        return make('cc', channel, d1, d2);
      case 0xe0:
        return make('pitchbend', channel, (d2 << 7) | d1, 0);
      default:
        return make('other', channel, d1, d2);
    }
  }
  if (status >= 0xfa && status <= 0xfc) return make('other', 0, 0, 0);
  return null;
}

function validateBytes(bytes: readonly number[]): void {
  const first = bytes[0];
  if (first === undefined) throw new NativeError('invalid_argument', 'empty MIDI message');
  if (first < 0x80) {
    throw new NativeError('invalid_argument', `MIDI message must start with a status byte (>= 0x80), got ${first}`);
  }
  if (bytes.length > 1024) throw new NativeError('invalid_argument', 'MIDI message longer than 1024 bytes');
  if (!bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) {
    throw new NativeError('invalid_argument', 'MIDI bytes must be integers in 0..255');
  }
}

const delayMs = (atMs: number | undefined): number => {
  if (atMs === undefined) return 0;
  if (Number.isNaN(atMs)) throw new NativeError('invalid_argument', 'atMs is not a number');
  return Math.min(Math.max(atMs, 0), 60_000);
};

export interface WebMidiBridge {
  listPorts(): Promise<MidiPortInfo[]>;
  /** Like `listPorts`, and tells `onPortsChanged` listeners if the list moved. */
  rescan(): Promise<MidiPortInfo[]>;
  openInput(id: string): Promise<void>;
  closeInput(id: string): Promise<void>;
  openOutput(id: string): Promise<void>;
  closeOutput(id: string): Promise<void>;
  send(id: string, messages: MidiOutMessage[]): Promise<void>;
  panic(id: string): Promise<void>;
  onMessage(callback: (message: MidiMessageEvent) => void): Unsubscribe;
  onPortsChanged(callback: (ports: MidiPortInfo[]) => void): Unsubscribe;
}

/**
 * Lazily asks for MIDI access on first use. Without Web MIDI (`request === null`) every list is empty and
 * opening a port rejects `not_found`.
 */
export function createWebMidiBridge(
  request: RequestMidiAccess | null,
  now: () => number = () => performance.now(),
): WebMidiBridge {
  const messageListeners = new Set<(m: MidiMessageEvent) => void>();
  const portListeners = new Set<(ports: MidiPortInfo[]) => void>();
  const openInputs = new Map<string, MIDIInput>();
  const openOutputs = new Map<string, MIDIOutput>();
  let access: Promise<MIDIAccess | null> | null = null;
  let known: string | null = null;

  const getAccess = (): Promise<MIDIAccess | null> => {
    access ??= (request ? request() : Promise.resolve(null)).then(
      (a) => {
        if (a) a.onstatechange = () => void notifyIfChanged();
        return a;
      },
      (err: unknown) => {
        access = null; // permission may be granted later
        throw new NativeError('midi', `Web MIDI unavailable: ${err instanceof Error ? err.message : String(err)}`);
      },
    );
    return access;
  };

  const enumerate = (a: MIDIAccess) => {
    const ins = [...a.inputs.values()];
    const outs = [...a.outputs.values()];
    const inInfo = assignPortIds('in', ins.map((p) => p.name ?? 'Unknown port'));
    const outInfo = assignPortIds('out', outs.map((p) => p.name ?? 'Unknown port'));
    return {
      ports: [...inInfo, ...outInfo],
      inputs: new Map(inInfo.map((info, i) => [info.id, ins[i]!])),
      outputs: new Map(outInfo.map((info, i) => [info.id, outs[i]!])),
    };
  };

  async function listPorts(): Promise<MidiPortInfo[]> {
    const a = await getAccess();
    return a ? enumerate(a).ports : [];
  }

  async function notifyIfChanged(): Promise<void> {
    const a = await getAccess().catch(() => null);
    if (!a) return;
    const { ports, inputs, outputs } = enumerate(a);
    const key = JSON.stringify(ports);
    if (known === null) {
      known = key;
      return;
    }
    if (key === known) return;
    known = key;
    for (const id of [...openInputs.keys()]) if (!inputs.has(id)) closeInputSync(id);
    for (const id of [...openOutputs.keys()]) if (!outputs.has(id)) openOutputs.delete(id);
    for (const listener of [...portListeners]) listener(ports);
  }

  function closeInputSync(id: string): void {
    const input = openInputs.get(id);
    if (input) input.onmidimessage = null;
    openInputs.delete(id);
  }

  const outputOrThrow = (id: string): MIDIOutput => {
    const out = openOutputs.get(id);
    if (!out) throw new NativeError('not_found', `MIDI output not open: ${id}`);
    return out;
  };

  return {
    listPorts: async () => {
      const ports = await listPorts();
      if (known === null) known = JSON.stringify(ports);
      return ports;
    },

    rescan: async () => {
      await notifyIfChanged();
      const ports = await listPorts();
      if (known === null) known = JSON.stringify(ports);
      return ports;
    },

    openInput: async (id) => {
      if (openInputs.has(id)) return;
      const a = await getAccess();
      const input = a ? enumerate(a).inputs.get(id) : undefined;
      if (!input) throw new NativeError('not_found', `MIDI input not found: ${id}`);
      input.onmidimessage = (event) => {
        if (!event.data) return;
        const message = parseMidiMessage(id, Math.round(event.timeStamp * 1000), event.data);
        if (message) for (const listener of [...messageListeners]) listener(message);
      };
      openInputs.set(id, input);
    },
    closeInput: async (id) => {
      closeInputSync(id);
    },

    openOutput: async (id) => {
      if (openOutputs.has(id)) return;
      const a = await getAccess();
      const output = a ? enumerate(a).outputs.get(id) : undefined;
      if (!output) throw new NativeError('not_found', `MIDI output not found: ${id}`);
      openOutputs.set(id, output);
    },
    closeOutput: async (id) => {
      const output = openOutputs.get(id);
      if (!output) return;
      for (let ch = 0; ch < 16; ch += 1) output.send([0xb0 | ch, 123, 0]);
      openOutputs.delete(id);
    },

    send: async (id, messages) => {
      const output = outputOrThrow(id);
      const checked = messages.map((m) => {
        validateBytes(m.bytes);
        return { bytes: m.bytes, delay: delayMs(m.atMs) };
      });
      const base = now();
      for (const { bytes, delay } of checked) output.send(bytes, base + delay);
    },
    panic: async (id) => {
      const output = outputOrThrow(id);
      // `clear()` (drop queued sends) is in the spec but not in lib.dom.
      (output as MIDIOutput & { clear?: () => void }).clear?.();
      for (let ch = 0; ch < 16; ch += 1) output.send([0xb0 | ch, 123, 0]);
    },

    onMessage: (callback) => {
      messageListeners.add(callback);
      return () => {
        messageListeners.delete(callback);
      };
    },
    onPortsChanged: (callback) => {
      portListeners.add(callback);
      return () => {
        portListeners.delete(callback);
      };
    },
  };
}
