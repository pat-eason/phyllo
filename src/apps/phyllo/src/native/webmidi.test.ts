import { describe, expect, it, vi } from 'vitest';

import { createBrowserApi } from './browser';
import { NativeError } from './errors';
import type { MidiMessageEvent, MidiPortInfo } from './types';
import { assignPortIds, createWebMidiBridge, defaultMidiAccess, parseMidiMessage } from './webmidi';

describe('assignPortIds', () => {
  it('uses direction, name and index among same-named ports', () => {
    const ports = assignPortIds('in', ['KeyStep 37', 'Pad', 'Pad']);
    expect(ports.map((p) => p.id)).toEqual(['in:KeyStep 37:0', 'in:Pad:0', 'in:Pad:1']);
    expect(assignPortIds('out', ['Pad'])[0]).toEqual({ id: 'out:Pad:0', name: 'Pad', direction: 'out' });
  });
});

describe('parseMidiMessage (mirrors Rust parse_message)', () => {
  const parse = (bytes: number[]) => parseMidiMessage('p', 7, bytes);

  it('note on/off, with velocity-0 note-on as note-off', () => {
    expect(parse([0x93, 60, 100])).toEqual({
      portId: 'p',
      kind: 'noteon',
      channel: 4,
      data1: 60,
      data2: 100,
      status: 0x93,
      timestampUs: 7,
    });
    expect(parse([0x83, 60, 64])).toMatchObject({ kind: 'noteoff', data2: 64 });
    expect(parse([0x90, 61, 0])).toMatchObject({ kind: 'noteoff', channel: 1, data1: 61, data2: 0 });
  });

  it('cc and 14-bit pitch bend', () => {
    expect(parse([0xbf, 13, 127])).toMatchObject({ kind: 'cc', channel: 16, data1: 13, data2: 127 });
    expect(parse([0xe0, 0x00, 0x40])).toMatchObject({ kind: 'pitchbend', data1: 8192, data2: 0 });
    expect(parse([0xe2, 0x7f, 0x7f])).toMatchObject({ channel: 3, data1: 16383 });
  });

  it('other channel messages and transport pass through; clock, sysex, junk are dropped', () => {
    expect(parse([0xc2, 5])).toMatchObject({ kind: 'other', channel: 3, status: 0xc2, data1: 5, data2: 0 });
    expect(parse([0xfa])).toMatchObject({ kind: 'other', channel: 0, status: 0xfa });
    expect(parse([0xf8])).toBeNull();
    expect(parse([0xfe])).toBeNull();
    expect(parse([0xf0, 1, 0xf7])).toBeNull();
    expect(parse([])).toBeNull();
    expect(parse([0x90])).toBeNull();
    expect(parse([0x40, 1])).toBeNull();
  });
});

// ── a fake MIDIAccess ──

class FakeInput {
  onmidimessage: ((e: { data: Uint8Array; timeStamp: number }) => void) | null = null;
  constructor(readonly name: string) {}
  emit(bytes: number[], timeStamp = 1) {
    this.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp });
  }
}

class FakeOutput {
  readonly sent: { bytes: number[]; at: number | undefined }[] = [];
  cleared = 0;
  constructor(readonly name: string) {}
  send(bytes: number[], at?: number) {
    this.sent.push({ bytes, at });
  }
  clear() {
    this.cleared += 1;
  }
}

function fakeAccess(inputs: FakeInput[], outputs: FakeOutput[]) {
  return {
    inputs: new Map(inputs.map((p, i) => [`i${i}`, p])),
    outputs: new Map(outputs.map((p, i) => [`o${i}`, p])),
    onstatechange: null as (() => void) | null,
  };
}

const asAccess = (a: ReturnType<typeof fakeAccess>) => () => Promise.resolve(a as unknown as MIDIAccess);

describe('web MIDI bridge', () => {
  it('lists inputs then outputs with stable ids', async () => {
    const access = fakeAccess([new FakeInput('Pad'), new FakeInput('Pad')], [new FakeOutput('IAC Driver Bus 1')]);
    const bridge = createWebMidiBridge(asAccess(access));
    expect((await bridge.listPorts()).map((p) => p.id)).toEqual(['in:Pad:0', 'in:Pad:1', 'out:IAC Driver Bus 1:0']);
  });

  it('without Web MIDI there are no ports and opening rejects not_found', async () => {
    const bridge = createWebMidiBridge(null);
    expect(await bridge.listPorts()).toEqual([]);
    await expect(bridge.openInput('in:Pad:0')).rejects.toMatchObject({ code: 'not_found' });
    await expect(bridge.openOutput('out:X:0')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('delivers parsed input only while the input is open', async () => {
    const pad = new FakeInput('Pad');
    const bridge = createWebMidiBridge(asAccess(fakeAccess([pad], [])));
    const got: MidiMessageEvent[] = [];
    const off = bridge.onMessage((m) => got.push(m));
    await bridge.openInput('in:Pad:0');
    await bridge.openInput('in:Pad:0'); // idempotent
    pad.emit([0x90, 60, 100], 2);
    pad.emit([0xf8]); // clock dropped
    expect(got).toEqual([
      { portId: 'in:Pad:0', kind: 'noteon', channel: 1, data1: 60, data2: 100, status: 0x90, timestampUs: 2000 },
    ]);
    await bridge.closeInput('in:Pad:0');
    pad.emit([0x90, 61, 100]);
    expect(got).toHaveLength(1);
    off();
  });

  it('sends with timestamps relative to now, validating the whole batch first', async () => {
    const synth = new FakeOutput('Synth');
    const bridge = createWebMidiBridge(asAccess(fakeAccess([], [synth])), () => 1000);
    await expect(bridge.send('out:Synth:0', [{ bytes: [0x90, 60, 100] }])).rejects.toMatchObject({
      code: 'not_found',
    });
    await bridge.openOutput('out:Synth:0');
    await bridge.send('out:Synth:0', [{ bytes: [0x90, 60, 100], atMs: 25 }, { bytes: [0x80, 60, 0] }]);
    expect(synth.sent).toEqual([
      { bytes: [0x90, 60, 100], at: 1025 },
      { bytes: [0x80, 60, 0], at: 1000 },
    ]);
    const err = await bridge.send('out:Synth:0', [{ bytes: [0x90, 1, 1] }, { bytes: [60] }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NativeError);
    expect((err as NativeError).code).toBe('invalid_argument');
    expect(synth.sent).toHaveLength(2);
  });

  it('panic clears the queue and sends all-notes-off on 16 channels; close does the same minus the clear', async () => {
    const synth = new FakeOutput('Synth');
    const bridge = createWebMidiBridge(asAccess(fakeAccess([], [synth])));
    await bridge.openOutput('out:Synth:0');
    await bridge.panic('out:Synth:0');
    expect(synth.cleared).toBe(1);
    expect(synth.sent).toHaveLength(16);
    expect(synth.sent[15]!.bytes).toEqual([0xbf, 123, 0]);
    await bridge.closeOutput('out:Synth:0');
    expect(synth.sent).toHaveLength(32);
    await expect(bridge.panic('out:Synth:0')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reports hot-plug changes and closes ports that vanished', async () => {
    const pad = new FakeInput('Pad');
    const access = fakeAccess([pad], [new FakeOutput('Synth')]);
    const bridge = createWebMidiBridge(asAccess(access));
    const changes: MidiPortInfo[][] = [];
    bridge.onPortsChanged((p) => changes.push(p));
    await bridge.listPorts();
    await bridge.openInput('in:Pad:0');
    expect(await bridge.rescan()).toHaveLength(2);
    expect(changes).toHaveLength(0);

    access.inputs.clear();
    access.onstatechange?.();
    await vi.waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0]!.map((p) => p.id)).toEqual(['out:Synth:0']);
    const got: MidiMessageEvent[] = [];
    bridge.onMessage((m) => got.push(m));
    pad.emit([0x90, 60, 100]);
    expect(got).toEqual([]);
  });
});

describe('browser native: MIDI and OSC', () => {
  it('without Web MIDI: no ports, OSC calls are no-ops', async () => {
    const api = createBrowserApi({ storage: null, log: () => undefined, requestMidiAccess: null });
    expect(await api.midiListPorts()).toEqual([]);
    expect(await api.midiRescan()).toEqual([]);
    await expect(api.midiOpenOutput('out:X:0')).rejects.toMatchObject({ code: 'not_found' });
    const off = await api.onMidiMessage(() => undefined);
    off();
    await expect(api.oscConfigure({ enabled: true, host: '127.0.0.1', port: 57120 })).resolves.toBeUndefined();
    await expect(api.oscSend([{ address: '/dirt/play', args: ['s', 'bd'] }])).resolves.toBeUndefined();
  });

  it('uses Web MIDI when it is available', async () => {
    const access = fakeAccess([], [new FakeOutput('IAC')]);
    const api = createBrowserApi({ storage: null, log: () => undefined, requestMidiAccess: asAccess(access) });
    expect(await api.midiListPorts()).toEqual([{ id: 'out:IAC:0', name: 'IAC', direction: 'out' }]);
  });

  it('defaultMidiAccess is null when navigator has no requestMIDIAccess', () => {
    expect(defaultMidiAccess()).toBeNull();
  });
});
