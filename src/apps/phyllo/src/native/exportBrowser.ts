/**
 * Plain-browser export: WAV encoding and a Standard MIDI File writer in JS, plus the download trigger. FLAC and MP3
 * are native-only (`unsupported_format` here). Mirrors `src-tauri/src/{encode,export,midifile}.rs` semantics so the
 * two implementations produce interchangeable results.
 */
import { NativeError } from './errors';
import type { ExportBeginOptions, ExportResult, MidiFileSpec } from './types';

export type Download = (fileName: string, blob: Blob) => void;

/** Blob + `a[download]`. Needs a DOM. */
export const defaultDownload: Download = (fileName, blob) => {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new NativeError('internal', 'downloads are not available in this environment');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/**
 * True for a path the app wrote as export output rather than a virtual library file: inside the exports folder, or a
 * bare file name (the export pipeline puts `.strudel` next to the downloaded audio, whose "path" is just its name).
 */
export function isExportOutputPath(path: string, exportsDir: string): boolean {
  return path.startsWith(`${exportsDir}/`) || !/[\\/]/.test(path);
}

/** Delivers Strudel code as a `.strudel` download; returns the file name. */
export function downloadStrudel(download: Download, path: string, code: string): string {
  const name = downloadName(path, 'strudel');
  download(name, new Blob([code], { type: 'text/plain;charset=utf-8' }));
  return name;
}

/** Last path component, with `ext` appended when it has no extension. */
export function downloadName(path: string, ext: string): string {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? '';
  if (name === '' || name === '.' || name === '..') throw new NativeError('invalid_argument', `export path is empty: ${path}`);
  return /\.[^./\\]+$/.test(name) ? name : `${name}.${ext}`;
}

const SILENCE_PEAK = 1e-6;

/** Throws the same errors the Rust side does for impossible combinations. */
export function validateBegin(options: ExportBeginOptions): void {
  if (options.format !== 'wav' && options.format !== 'flac' && options.format !== 'mp3') {
    throw new NativeError('invalid_argument', `unknown export format: ${String(options.format)}`);
  }
  if (options.channels !== 1 && options.channels !== 2) {
    throw new NativeError('invalid_argument', `channels must be 1 or 2, got ${String(options.channels)}`);
  }
  if (![16, 24, 32].includes(options.bitDepth)) {
    throw new NativeError('invalid_argument', `bit depth must be 16, 24 or 32, got ${String(options.bitDepth)}`);
  }
  if (!Number.isInteger(options.sampleRate) || options.sampleRate < 8000 || options.sampleRate > 384000) {
    throw new NativeError('invalid_argument', `sample rate out of range: ${options.sampleRate}`);
  }
  const db = options.normalizeDbfs;
  if (db !== undefined && db !== null && !(Number.isFinite(db) && db >= -60 && db <= 0)) {
    throw new NativeError('invalid_argument', `normalizeDbfs must be between -60 and 0, got ${db}`);
  }
  if (options.format !== 'wav') {
    throw new NativeError(
      'unsupported_format',
      `${options.format.toUpperCase()} export needs the desktop app; the browser can only write WAV`,
    );
  }
}

export function normalizeGain(peak: number, targetDbfs: number): number {
  return peak < SILENCE_PEAK ? 1 : 10 ** (targetDbfs / 20) / peak;
}

/** Accumulates chunks; `finish` encodes a WAV. */
export class BrowserExportSession {
  private readonly chunks: Float32Array[] = [];
  private frames = 0;
  private peak = 0;

  constructor(readonly options: ExportBeginOptions) {}

  push(frames: Float32Array): void {
    const channels = this.options.channels;
    if (frames.length === 0 || frames.length % channels !== 0) {
      throw new NativeError(
        'invalid_argument',
        `chunk of ${frames.length} samples is not a whole number of ${channels}-channel frames`,
      );
    }
    for (const v of frames) {
      const a = Number.isFinite(v) ? Math.abs(v) : 0;
      if (a > this.peak) this.peak = a;
    }
    this.chunks.push(frames.slice());
    this.frames += frames.length / channels;
  }

  finish(download: Download): ExportResult {
    if (this.frames === 0) throw new NativeError('invalid_argument', 'nothing to export: no audio was received');
    const target = this.options.normalizeDbfs;
    const gain = target === undefined || target === null ? 1 : normalizeGain(this.peak, target);
    const blob = encodeWav(this.chunks, this.options, gain);
    const name = downloadName(this.options.path, 'wav');
    download(name, blob);
    const outPeak = this.peak * gain;
    return {
      path: name,
      durationSec: this.frames / this.options.sampleRate,
      peakDbfs: outPeak > 0 ? 20 * Math.log10(outPeak) : null,
      bytes: blob.size,
    };
  }
}

/** Deterministic PRNG (mulberry32) so dithered output is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RIFF/WAVE writer: 16/24-bit PCM (16 with TPDF dither) or 32-bit IEEE float (with `fact`). Samples scaled by `gain`. */
export function encodeWav(chunks: readonly Float32Array[], options: ExportBeginOptions, gain: number): Blob {
  const { channels, sampleRate, bitDepth } = options;
  const float = bitDepth === 32;
  const bytesPerSample = bitDepth / 8;
  let samples = 0;
  for (const c of chunks) samples += c.length;
  const dataBytes = samples * bytesPerSample;
  const fmtSize = float ? 18 : 16;
  const headerBytes = 12 + (8 + fmtSize) + (float ? 12 : 0) + 8;
  const buffer = new ArrayBuffer(headerBytes + dataBytes + (dataBytes % 2));
  const view = new DataView(buffer);
  let o = 0;
  const tag = (s: string) => {
    for (let i = 0; i < 4; i += 1) view.setUint8(o + i, s.charCodeAt(i));
    o += 4;
  };
  const u32 = (v: number) => {
    view.setUint32(o, v, true);
    o += 4;
  };
  const u16 = (v: number) => {
    view.setUint16(o, v, true);
    o += 2;
  };
  tag('RIFF');
  u32(buffer.byteLength - 8);
  tag('WAVE');
  tag('fmt ');
  u32(fmtSize);
  u16(float ? 3 : 1);
  u16(channels);
  u32(sampleRate);
  u32(sampleRate * channels * bytesPerSample);
  u16(channels * bytesPerSample);
  u16(bitDepth);
  if (float) {
    u16(0);
    tag('fact');
    u32(4);
    u32(samples / channels);
  }
  tag('data');
  u32(dataBytes);

  const rand = mulberry32(0x9e3779b9);
  const max = 2 ** (bitDepth - 1) - 1;
  const min = -(2 ** (bitDepth - 1));
  for (const chunk of chunks) {
    for (const raw of chunk) {
      const s = (Number.isFinite(raw) ? raw : 0) * gain;
      if (float) {
        view.setFloat32(o, s, true);
        o += 4;
        continue;
      }
      const dither = bitDepth === 16 ? rand() - rand() : 0;
      const q = Math.max(min, Math.min(max, Math.round(Math.max(-1, Math.min(1, s)) * max + dither)));
      if (bitDepth === 16) {
        view.setInt16(o, q, true);
        o += 2;
      } else {
        view.setUint8(o, q & 0xff);
        view.setUint8(o + 1, (q >> 8) & 0xff);
        view.setUint8(o + 2, (q >> 16) & 0xff);
        o += 3;
      }
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

// ── Standard MIDI File ──────────────────────────────────────────────────────

const MIN_BPM = 20;
const MAX_BPM = 999;
const DEFAULT_PPQ = 480;

function bad(message: string): NativeError {
  return new NativeError('invalid_argument', message);
}

function validateMidi(spec: MidiFileSpec): number {
  if (!(Number.isFinite(spec.bpm) && spec.bpm >= MIN_BPM && spec.bpm <= MAX_BPM)) {
    throw bad(`bpm must be between ${MIN_BPM} and ${MAX_BPM}, got ${spec.bpm}`);
  }
  const ppq = spec.ppq ?? DEFAULT_PPQ;
  if (!Number.isInteger(ppq) || ppq < 1 || ppq > 0x7fff) throw bad(`ppq must be 1..=32767, got ${ppq}`);
  for (const t of spec.tracks) {
    if (!Number.isInteger(t.channel) || t.channel < 1 || t.channel > 16) {
      throw bad(`track "${t.name}": channel must be 1..=16, got ${t.channel}`);
    }
    for (const n of t.notes) {
      if (!Number.isInteger(n.note) || n.note < 0 || n.note > 127) throw bad(`note out of range: ${n.note}`);
      if (!Number.isInteger(n.velocity) || n.velocity < 1 || n.velocity > 127) {
        throw bad(`velocity must be 1..=127, got ${n.velocity}`);
      }
      if (!(Number.isFinite(n.startSec) && n.startSec >= 0)) throw bad(`startSec must be >= 0, got ${n.startSec}`);
      if (!(Number.isFinite(n.durationSec) && n.durationSec > 0)) throw bad(`durationSec must be > 0, got ${n.durationSec}`);
    }
  }
  return ppq;
}

function vlq(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = Math.floor(value / 128);
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return bytes;
}

const be32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
const text = (s: string) => Array.from(new TextEncoder().encode(s));
const meta = (type: number, data: number[]) => [0x00, 0xff, type, ...vlq(data.length), ...data];
const endOfTrack = [0x00, 0xff, 0x2f, 0x00];
const chunk = (id: string, body: number[]) => [...text(id), ...be32(body.length), ...body];

/** Type-1 SMF bytes: a tempo track, then one track per entry. Same ordering rules as the Rust writer. */
export function buildMidiFile(spec: MidiFileSpec): Uint8Array {
  const ppq = validateMidi(spec);
  const ticks = (sec: number) => {
    const t = Math.round((sec * spec.bpm * ppq) / 60);
    if (t > 0x0fffffff) throw bad(`time out of range: ${sec} s`);
    return t;
  };
  const micros = Math.round(60_000_000 / spec.bpm);
  const tracks: number[][] = [
    [
      ...meta(0x03, text('Phyllo')),
      ...meta(0x51, [(micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff]),
      ...endOfTrack,
    ],
  ];
  for (const t of spec.tracks) {
    // [tick, isOn, note, velocity]; at equal ticks note-offs sort first so repeated notes retrigger.
    const events: [number, number, number, number][] = [];
    for (const n of t.notes) {
      const on = ticks(n.startSec);
      const off = Math.max(on + 1, ticks(n.startSec + n.durationSec));
      events.push([on, 1, n.note, n.velocity], [off, 0, n.note, 64]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const body = [...meta(0x03, text(t.name))];
    let last = 0;
    for (const [tick, on, note, vel] of events) {
      body.push(...vlq(tick - last), (on ? 0x90 : 0x80) | (t.channel - 1), note, vel);
      last = tick;
    }
    body.push(...endOfTrack);
    tracks.push(body);
  }
  const header = chunk('MThd', [0, 1, ...[(tracks.length >> 8) & 0xff, tracks.length & 0xff], (ppq >> 8) & 0xff, ppq & 0xff]);
  return Uint8Array.from([...header, ...tracks.flatMap((body) => chunk('MTrk', body))]);
}
