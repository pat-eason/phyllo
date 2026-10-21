import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserApi } from './browser';
import { NativeError } from './errors';
import { buildMidiFile, downloadName } from './exportBrowser';
import { streamAudioBuffer } from './export';
import type { MidiFileSpec } from './types';

interface Downloaded {
  name: string;
  blob: Blob;
}

function rig() {
  const downloads: Downloaded[] = [];
  const api = createBrowserApi({
    storage: null,
    log: () => undefined,
    requestMidiAccess: null,
    download: (name, blob) => void downloads.push({ name, blob }),
  });
  return { api, downloads };
}

const bytesOf = async (blob: Blob) => new DataView(await blob.arrayBuffer());
const tagAt = (v: DataView, o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

async function exportWav(bitDepth: 16 | 24 | 32, samples: number[], normalizeDbfs?: number) {
  const { api, downloads } = rig();
  const { sessionId } = await api.exportBegin({
    path: '/Users/me/mix',
    format: 'wav',
    bitDepth,
    sampleRate: 44100,
    channels: 2,
    ...(normalizeDbfs === undefined ? {} : { normalizeDbfs }),
  });
  await api.exportChunk(sessionId, Float32Array.from(samples));
  const result = await api.exportFinish(sessionId);
  return { result, view: await bytesOf(downloads[0]!.blob), downloads };
}

describe('browser export: WAV', () => {
  it('writes a 16-bit PCM RIFF header and samples, and downloads as <name>.wav', async () => {
    const { result, view, downloads } = await exportWav(16, [0.5, -0.5, 0.25, -0.25]);
    expect(downloads[0]!.name).toBe('mix.wav');
    expect(tagAt(view, 0)).toBe('RIFF');
    expect(tagAt(view, 8)).toBe('WAVE');
    expect(tagAt(view, 12)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(4); // block align
    expect(view.getUint16(34, true)).toBe(16);
    expect(tagAt(view, 36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(8);
    // TPDF dither moves each sample by at most 1 LSB.
    const want = [0.5, -0.5, 0.25, -0.25].map((v) => v * 32767);
    want.forEach((w, i) => expect(Math.abs(view.getInt16(44 + 2 * i, true) - w)).toBeLessThanOrEqual(2));
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8);
    expect(result).toEqual({ path: 'mix.wav', durationSec: 2 / 44100, peakDbfs: 20 * Math.log10(0.5), bytes: 52 });
  });

  it('writes 24-bit samples as three little-endian bytes', async () => {
    const { view } = await exportWav(24, [1, -1, 0, 0.5]);
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint32(40, true)).toBe(12);
    const s24 = (o: number) => {
      const v = view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getUint8(o + 2) << 16);
      return v & 0x800000 ? v - 0x1000000 : v;
    };
    expect([0, 1, 2, 3].map((i) => s24(44 + 3 * i))).toEqual([8388607, -8388607, 0, 4194304]);
  });

  it('writes 32-bit float with format tag 3 and a fact chunk, samples verbatim', async () => {
    const { view } = await exportWav(32, [0.5, -0.25, 1.5, 0]);
    expect(view.getUint16(20, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(32);
    expect(tagAt(view, 38)).toBe('fact');
    expect(view.getUint32(46, true)).toBe(2); // frames
    expect(tagAt(view, 50)).toBe('data');
    expect([0, 1, 2, 3].map((i) => view.getFloat32(58 + 4 * i, true))).toEqual([0.5, -0.25, 1.5, 0]);
  });

  it('normalizes the peak to the target in both directions', async () => {
    const target = 10 ** (-1 / 20);
    for (const amp of [0.1, 1]) {
      const { view, result } = await exportWav(32, [amp, -amp, amp / 2, 0], -1);
      expect(view.getFloat32(58, true)).toBeCloseTo(target, 5);
      expect(result.peakDbfs).toBeCloseTo(-1, 6);
    }
  });

  it('leaves silence alone and reports a null peak', async () => {
    const { result, view } = await exportWav(32, [0, 0, 0, 0], -1);
    expect(result.peakDbfs).toBeNull();
    expect(view.getFloat32(58, true)).toBe(0);
  });

  it('chunked streaming equals single-shot', async () => {
    const frames = Float32Array.from({ length: 30_000 }, (_, i) => Math.sin(i / 7) * 0.8);
    const run = async (chunkSeconds: number) => {
      const { api, downloads } = rig();
      await streamAudioBuffer(
        api,
        { numberOfChannels: 2, sampleRate: 8000, getChannelData: () => frames },
        { path: 'a.wav', format: 'wav', bitDepth: 24, chunkSeconds },
      );
      return new Uint8Array(await downloads[0]!.blob.arrayBuffer());
    };
    expect(await run(0.3)).toEqual(await run(100));
    expect(await run(0.3)).not.toEqual(new Uint8Array(0));
  });

  it('rejects FLAC and MP3 as unsupported_format but invalid combinations as invalid_argument', async () => {
    const { api } = rig();
    const base = { path: 'a', bitDepth: 16, sampleRate: 48000, channels: 2 } as const;
    for (const format of ['flac', 'mp3'] as const) {
      const err = await api.exportBegin({ ...base, format }).catch((e: unknown) => e);
      expect((err as NativeError).code).toBe('unsupported_format');
    }
    const bad = [
      { ...base, format: 'wav', channels: 3 },
      { ...base, format: 'wav', bitDepth: 8 },
      { ...base, format: 'wav', normalizeDbfs: 2 },
      { ...base, format: 'wav', sampleRate: 100 },
    ];
    for (const options of bad) {
      const err = await api.exportBegin(options as never).catch((e: unknown) => e);
      expect((err as NativeError).code).toBe('invalid_argument');
    }
  });

  it('cancel discards the session; unknown sessions are not_found; nothing is downloaded', async () => {
    const { api, downloads } = rig();
    const { sessionId } = await api.exportBegin({ path: 'a.wav', format: 'wav', bitDepth: 16, sampleRate: 48000, channels: 1 });
    await api.exportChunk(sessionId, new Float32Array([0.1]));
    await api.exportCancel(sessionId);
    await api.exportCancel(sessionId);
    const err = await api.exportFinish(sessionId).catch((e: unknown) => e);
    expect((err as NativeError).code).toBe('not_found');
    expect(downloads).toHaveLength(0);
  });

  it('rejects partial frames and empty exports', async () => {
    const { api } = rig();
    const { sessionId } = await api.exportBegin({ path: 'a.wav', format: 'wav', bitDepth: 16, sampleRate: 48000, channels: 2 });
    const partial = await api.exportChunk(sessionId, new Float32Array(3)).catch((e: unknown) => e);
    expect((partial as NativeError).code).toBe('invalid_argument');
    const empty = await api.exportFinish(sessionId).catch((e: unknown) => e);
    expect((empty as NativeError).code).toBe('invalid_argument');
  });
});

describe('browser export: file names', () => {
  it('keeps the last path component and adds the extension only when missing', () => {
    expect(downloadName('/a/b/Mix', 'wav')).toBe('Mix.wav');
    expect(downloadName('C:\\x\\Mix.flac', 'wav')).toBe('Mix.flac');
    expect(downloadName('Mix', 'mid')).toBe('Mix.mid');
    expect(() => downloadName('/', 'wav')).toThrow(NativeError);
  });
});

/** Minimal SMF reader for the assertions: header + tracks as raw events. */
function parseSmf(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(tagAt(v, 0)).toBe('MThd');
  expect(v.getUint32(4)).toBe(6);
  const header = { format: v.getUint16(8), tracks: v.getUint16(10), ppq: v.getUint16(12) };
  let o = 14;
  const tracks: { tempo?: number; name?: string; notes: [number, boolean, number, number, number][] }[] = [];
  for (let t = 0; t < header.tracks; t += 1) {
    expect(tagAt(v, o)).toBe('MTrk');
    const end = o + 8 + v.getUint32(o + 4);
    o += 8;
    const track: (typeof tracks)[number] = { notes: [] };
    let tick = 0;
    const readVlq = () => {
      let n = 0;
      for (;;) {
        const b = v.getUint8(o++);
        n = n * 128 + (b & 0x7f);
        if (!(b & 0x80)) return n;
      }
    };
    while (o < end) {
      tick += readVlq();
      const status = v.getUint8(o++);
      if (status === 0xff) {
        const type = v.getUint8(o++);
        const len = readVlq();
        if (type === 0x51) track.tempo = (v.getUint8(o) << 16) | (v.getUint8(o + 1) << 8) | v.getUint8(o + 2);
        if (type === 0x03) track.name = new TextDecoder().decode(bytes.subarray(o, o + len));
        o += len;
      } else {
        track.notes.push([tick, (status & 0xf0) === 0x90, status & 0x0f, v.getUint8(o), v.getUint8(o + 1)]);
        o += 2;
      }
    }
    tracks.push(track);
  }
  return { header, tracks };
}

describe('browser export: MIDI file', () => {
  const spec: MidiFileSpec = {
    bpm: 120,
    tracks: [
      {
        name: 'Drums',
        channel: 10,
        notes: [
          { startSec: 1, durationSec: 0.5, note: 38, velocity: 90 },
          { startSec: 0, durationSec: 0.25, note: 36, velocity: 100 },
        ],
      },
      { name: 'Bass', channel: 2, notes: [{ startSec: 0.5, durationSec: 1, note: 40, velocity: 127 }] },
    ],
  };

  it('writes a type-1 SMF with the tempo, names, channels and tick positions (480 ppq)', () => {
    const { header, tracks } = parseSmf(buildMidiFile(spec));
    expect(header).toEqual({ format: 1, tracks: 3, ppq: 480 });
    expect(tracks[0]!.tempo).toBe(500_000);
    expect(tracks[1]!.name).toBe('Drums');
    expect(tracks[1]!.notes).toEqual([
      [0, true, 9, 36, 100],
      [240, false, 9, 36, 64],
      [960, true, 9, 38, 90],
      [1440, false, 9, 38, 64],
    ]);
    expect(tracks[2]!.name).toBe('Bass');
    expect(tracks[2]!.notes).toEqual([
      [480, true, 1, 40, 127],
      [1440, false, 1, 40, 64],
    ]);
  });

  it('orders a note-off before the next note-on at the same tick and gives short notes one tick', () => {
    const { tracks } = parseSmf(
      buildMidiFile({
        bpm: 120,
        ppq: 96,
        tracks: [
          {
            name: 'T',
            channel: 1,
            notes: [
              { startSec: 0, durationSec: 0.5, note: 60, velocity: 100 },
              { startSec: 0.5, durationSec: 0.5, note: 60, velocity: 100 },
              { startSec: 2, durationSec: 1e-9, note: 61, velocity: 50 },
            ],
          },
        ],
      }),
    );
    expect(tracks[1]!.notes).toEqual([
      [0, true, 0, 60, 100],
      [96, false, 0, 60, 64],
      [96, true, 0, 60, 100],
      [192, false, 0, 60, 64],
      [384, true, 0, 61, 50],
      [385, false, 0, 61, 64],
    ]);
  });

  it('encodes multi-byte delta times', () => {
    const { tracks } = parseSmf(
      buildMidiFile({
        bpm: 120,
        tracks: [{ name: 'T', channel: 1, notes: [{ startSec: 100, durationSec: 1, note: 60, velocity: 1 }] }],
      }),
    );
    expect(tracks[1]!.notes.map((n) => n[0])).toEqual([96_000, 96_960]);
  });

  it('rejects invalid input with invalid_argument', () => {
    const note = { startSec: 0, durationSec: 1, note: 60, velocity: 100 };
    const track = (over: object) => ({ name: 't', channel: 1, notes: [{ ...note, ...over }] });
    const bad: MidiFileSpec[] = [
      { bpm: 0, tracks: [] },
      { bpm: Number.NaN, tracks: [] },
      { bpm: 1000, tracks: [] },
      { bpm: 120, ppq: 0, tracks: [] },
      { bpm: 120, tracks: [{ name: 't', channel: 0, notes: [] }] },
      { bpm: 120, tracks: [{ name: 't', channel: 17, notes: [] }] },
      { bpm: 120, tracks: [track({ note: 128 })] },
      { bpm: 120, tracks: [track({ velocity: 0 })] },
      { bpm: 120, tracks: [track({ startSec: -1 })] },
      { bpm: 120, tracks: [track({ durationSec: 0 })] },
    ];
    for (const s of bad) {
      let code = '';
      try {
        buildMidiFile(s);
      } catch (e) {
        code = (e as NativeError).code;
      }
      expect(code).toBe('invalid_argument');
    }
  });

  it('midiFileWrite downloads <name>.mid and reports its size', async () => {
    const { api, downloads } = rig();
    const result = await api.midiFileWrite('/x/beat', spec);
    expect(downloads[0]!.name).toBe('beat.mid');
    expect(result.path).toBe('beat.mid');
    expect(downloads[0]!.blob.size).toBe(result.bytes);
    expect(result.bytes).toBe(buildMidiFile(spec).length);
  });
});

describe('browser export: default download', () => {
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  afterEach(() => {
    Object.assign(URL, { createObjectURL: realCreate, revokeObjectURL: realRevoke });
    vi.restoreAllMocks();
  });

  it('fails clearly (internal) when the environment cannot create blob URLs', async () => {
    const api = createBrowserApi({ storage: null, log: () => undefined, requestMidiAccess: null });
    Object.assign(URL, { createObjectURL: undefined });
    const err = await api.midiFileWrite('a', { bpm: 120, tracks: [] }).catch((e: unknown) => e);
    expect((err as NativeError).code).toBe('internal');
  });

  it('clicks an a[download] pointing at a blob URL, then removes it', async () => {
    const api = createBrowserApi({ storage: null, log: () => undefined, requestMidiAccess: null });
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
    const seen: { download: string; href: string | null }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ download: this.download, href: this.getAttribute('href') });
    });
    await api.midiFileWrite('a', { bpm: 120, tracks: [] });
    expect(seen).toEqual([{ download: 'a.mid', href: 'blob:fake' }]);
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
