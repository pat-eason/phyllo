import { describe, expect, it, vi } from 'vitest';

import { NativeError } from './errors';
import { type AudioBufferLike, formatExportNotification, interleave, streamAudioBuffer } from './export';
import type { ExportBeginOptions, ExportResult } from './types';

function buffer(channels: Float32Array[], sampleRate = 48000): AudioBufferLike {
  return { numberOfChannels: channels.length, sampleRate, getChannelData: (i) => channels[i]! };
}

const ramp = (n: number, offset = 0) => Float32Array.from({ length: n }, (_, i) => offset + i);

const RESULT: ExportResult = { path: '/x/mix.wav', durationSec: 3, peakDbfs: -1, bytes: 10 };

function fakeNative(overrides: { chunk?: (id: string, frames: Float32Array) => Promise<void> } = {}) {
  const chunks: Float32Array[] = [];
  const begun: ExportBeginOptions[] = [];
  const native = {
    exportBegin: vi.fn(async (o: ExportBeginOptions) => {
      begun.push(o);
      return { sessionId: 'sess' };
    }),
    exportChunk: vi.fn(async (id: string, frames: Float32Array) => {
      if (overrides.chunk) return overrides.chunk(id, frames);
      chunks.push(frames);
    }),
    exportFinish: vi.fn(async () => RESULT),
    exportCancel: vi.fn(async () => undefined),
  };
  return { native, chunks, begun };
}

describe('interleave', () => {
  it('interleaves stereo frames [start, end)', () => {
    const l = Float32Array.from([1, 2, 3, 4]);
    const r = Float32Array.from([-1, -2, -3, -4]);
    expect(Array.from(interleave([l, r], 1, 3))).toEqual([2, -2, 3, -3]);
  });

  it('copies mono and returns an independent array', () => {
    const m = Float32Array.from([1, 2, 3]);
    const out = interleave([m], 0, 3);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    out[0] = 99;
    expect(m[0]).toBe(1);
  });

  it('is empty for an empty or inverted range', () => {
    expect(interleave([ramp(4), ramp(4)], 2, 2)).toHaveLength(0);
    expect(interleave([ramp(4), ramp(4)], 3, 1)).toHaveLength(0);
  });
});

describe('streamAudioBuffer', () => {
  it('sends ~1 s chunks that interleave back to the whole buffer, then finishes', async () => {
    const { native, chunks, begun } = fakeNative();
    const left = ramp(2500);
    const right = ramp(2500, 10_000);
    const progress: number[] = [];
    const res = await streamAudioBuffer(native, buffer([left, right], 1000), {
      path: 'mix.wav',
      format: 'wav',
      bitDepth: 24,
      normalizeDbfs: -1,
      onProgress: (p) => progress.push(p.fraction),
    });
    expect(res).toBe(RESULT);
    expect(begun).toEqual([
      { path: 'mix.wav', format: 'wav', bitDepth: 24, sampleRate: 1000, channels: 2, normalizeDbfs: -1 },
    ]);
    // 1000 + 1000 + 500 frames, 2 channels each
    expect(chunks.map((c) => c.length)).toEqual([2000, 2000, 1000]);
    const all = Float32Array.from(chunks.flatMap((c) => Array.from(c)));
    for (let i = 0; i < 2500; i += 1) {
      expect(all[2 * i]).toBe(left[i]);
      expect(all[2 * i + 1]).toBe(right[i]);
    }
    expect(progress).toEqual([0.4, 0.8, 1]);
    expect(native.exportFinish).toHaveBeenCalledWith('sess');
    expect(native.exportCancel).not.toHaveBeenCalled();
  });

  it('honours chunkSeconds and handles mono; omits normalizeDbfs when not given', async () => {
    const { native, chunks, begun } = fakeNative();
    await streamAudioBuffer(native, buffer([ramp(1000)], 1000), {
      path: '/a/b.flac',
      format: 'flac',
      bitDepth: 16,
      chunkSeconds: 0.25,
    });
    expect(chunks.map((c) => c.length)).toEqual([250, 250, 250, 250]);
    expect(begun[0]).toEqual({ path: '/a/b.flac', format: 'flac', bitDepth: 16, sampleRate: 1000, channels: 1 });
    expect('normalizeDbfs' in begun[0]!).toBe(false);
  });

  it('rejects a sample-rate mismatch before opening a session', async () => {
    const { native } = fakeNative();
    const err = await streamAudioBuffer(native, buffer([ramp(10), ramp(10)], 44100), {
      path: 'a.wav',
      format: 'wav',
      bitDepth: 16,
      sampleRate: 48000,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NativeError);
    expect((err as NativeError).code).toBe('invalid_argument');
    expect(native.exportBegin).not.toHaveBeenCalled();
  });

  it('rejects empty buffers and unsupported channel counts', async () => {
    const { native } = fakeNative();
    const base = { path: 'a.wav', format: 'wav', bitDepth: 16 } as const;
    for (const b of [buffer([new Float32Array(0), new Float32Array(0)]), buffer([ramp(4), ramp(4), ramp(4)]), buffer([])]) {
      const err = await streamAudioBuffer(native, b, base).catch((e: unknown) => e);
      expect((err as NativeError).code).toBe('invalid_argument');
    }
    expect(native.exportBegin).not.toHaveBeenCalled();
  });

  it('cancels the session and rethrows when a chunk fails', async () => {
    let n = 0;
    const { native } = fakeNative({
      chunk: async () => {
        n += 1;
        if (n === 2) throw new NativeError('io', 'disk full');
      },
    });
    const err = await streamAudioBuffer(native, buffer([ramp(3000)], 1000), {
      path: 'a.wav',
      format: 'wav',
      bitDepth: 16,
    }).catch((e: unknown) => e);
    expect((err as NativeError).code).toBe('io');
    expect(native.exportCancel).toHaveBeenCalledWith('sess');
    expect(native.exportFinish).not.toHaveBeenCalled();
  });

  it('cancels when finish fails', async () => {
    const { native } = fakeNative();
    native.exportFinish.mockRejectedValueOnce(new NativeError('encode', 'boom'));
    const err = await streamAudioBuffer(native, buffer([ramp(10)]), { path: 'a.wav', format: 'wav', bitDepth: 16 }).catch(
      (e: unknown) => e,
    );
    expect((err as NativeError).code).toBe('encode');
    expect(native.exportCancel).toHaveBeenCalledWith('sess');
  });

  it('aborts between chunks, cancels natively and rejects with the reason', async () => {
    const controller = new AbortController();
    const { native, chunks } = fakeNative();
    const err = await streamAudioBuffer(native, buffer([ramp(5000)], 1000), {
      path: 'a.wav',
      format: 'wav',
      bitDepth: 16,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.framesSent >= 2000) controller.abort(new Error('user cancelled'));
      },
    }).catch((e: unknown) => e);
    expect((err as Error).message).toBe('user cancelled');
    expect(chunks).toHaveLength(2);
    expect(native.exportCancel).toHaveBeenCalledWith('sess');
    expect(native.exportFinish).not.toHaveBeenCalled();
  });
});

describe('formatExportNotification', () => {
  it('follows SPEC §6.5', () => {
    expect(formatExportNotification({ path: '/m/Exports/Groove.wav', durationSec: 68.2 }, { format: 'wav', bitDepth: 24 })).toBe(
      'Export finished · Groove.wav · 1:08 · 24-bit',
    );
    expect(formatExportNotification({ path: 'C:\\x\\a.wav', durationSec: 9.6 }, { format: 'wav', bitDepth: 32 })).toBe(
      'Export finished · a.wav · 0:10 · 32-bit float',
    );
    expect(formatExportNotification({ path: '/a.mp3', durationSec: 3600 }, { format: 'mp3', bitDepth: 16 })).toBe(
      'Export finished · a.mp3 · 60:00 · 320 kbps',
    );
  });
});
