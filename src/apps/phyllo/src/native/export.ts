import type { NativeApi } from './api';
import { NativeError } from './errors';
import type { ExportBeginOptions, ExportBitDepth, ExportFormat, ExportResult } from './types';

/** The subset of `AudioBuffer` the exporter reads; a real `AudioBuffer` satisfies it. */
export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface ExportProgress {
  framesSent: number;
  totalFrames: number;
  /** 0..1 of the PCM handed over (encoding in `exportFinish` follows). */
  fraction: number;
}

export interface StreamExportOptions {
  path: string;
  format: ExportFormat;
  bitDepth: ExportBitDepth;
  normalizeDbfs?: number | null;
  /** If set, must equal `buffer.sampleRate`: there is no resampler, so a mismatch is an error. */
  sampleRate?: number;
  /** Seconds of audio per chunk (default 1). */
  chunkSeconds?: number;
  onProgress?: (progress: ExportProgress) => void;
  /** Aborting cancels the native session and rejects with the signal's reason. */
  signal?: AbortSignal;
}

export const DEFAULT_CHUNK_SECONDS = 1;

/** Interleave frames `[start, end)` of `channels` into one `Float32Array` (L R L R...). */
export function interleave(channels: readonly Float32Array[], start: number, end: number): Float32Array {
  const count = channels.length;
  const frames = Math.max(0, end - start);
  const out = new Float32Array(frames * count);
  if (count === 1) {
    out.set(channels[0]!.subarray(start, end));
    return out;
  }
  for (let c = 0; c < count; c += 1) {
    const channel = channels[c]!;
    for (let i = 0; i < frames; i += 1) out[i * count + c] = channel[start + i]!;
  }
  return out;
}

/**
 * Hand a rendered buffer to the native exporter in ~1 s chunks: begin, chunk..., finish. Any failure (including an
 * abort) cancels the session so no partial file or spool is left behind.
 */
export async function streamAudioBuffer(
  native: Pick<NativeApi, 'exportBegin' | 'exportChunk' | 'exportFinish' | 'exportCancel'>,
  buffer: AudioBufferLike,
  opts: StreamExportOptions,
): Promise<ExportResult> {
  const channelCount = buffer.numberOfChannels;
  if (channelCount !== 1 && channelCount !== 2) {
    throw new NativeError('invalid_argument', `export supports mono or stereo, got ${channelCount} channels`);
  }
  if (opts.sampleRate !== undefined && opts.sampleRate !== buffer.sampleRate) {
    throw new NativeError(
      'invalid_argument',
      `sample rate mismatch: rendered at ${buffer.sampleRate} Hz but ${opts.sampleRate} Hz was requested (no resampler)`,
    );
  }
  const channels = Array.from({ length: channelCount }, (_, i) => buffer.getChannelData(i));
  const totalFrames = channels[0]!.length;
  if (totalFrames === 0) throw new NativeError('invalid_argument', 'nothing to export: the buffer is empty');

  const seconds = opts.chunkSeconds ?? DEFAULT_CHUNK_SECONDS;
  if (!(seconds > 0)) throw new NativeError('invalid_argument', `chunkSeconds must be > 0, got ${seconds}`);
  const chunkFrames = Math.max(1, Math.round(seconds * buffer.sampleRate));

  const begin: ExportBeginOptions = {
    path: opts.path,
    format: opts.format,
    bitDepth: opts.bitDepth,
    sampleRate: buffer.sampleRate,
    channels: channelCount,
    ...(opts.normalizeDbfs === undefined ? {} : { normalizeDbfs: opts.normalizeDbfs }),
  };
  const { sessionId } = await native.exportBegin(begin);
  try {
    for (let start = 0; start < totalFrames; start += chunkFrames) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException('Export aborted', 'AbortError');
      const end = Math.min(totalFrames, start + chunkFrames);
      await native.exportChunk(sessionId, interleave(channels, start, end));
      opts.onProgress?.({ framesSent: end, totalFrames, fraction: end / totalFrames });
    }
    if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException('Export aborted', 'AbortError');
    return await native.exportFinish(sessionId);
  } catch (err) {
    // After a failed finish the session is already gone natively; cancel is idempotent so this is always safe.
    await native.exportCancel(sessionId).catch(() => undefined);
    throw err;
  }
}

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

function depthLabel(format: ExportFormat, bitDepth: ExportBitDepth): string {
  if (format === 'mp3') return '320 kbps';
  return bitDepth === 32 ? '32-bit float' : `${bitDepth}-bit`;
}

/** SPEC §6.5 notification text: `Export finished · <file> · <duration> · <bit depth>`. */
export function formatExportNotification(
  result: Pick<ExportResult, 'path' | 'durationSec'>,
  info: { format: ExportFormat; bitDepth: ExportBitDepth },
): string {
  const total = Math.round(result.durationSec);
  const clock = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  return `Export finished · ${fileName(result.path)} · ${clock} · ${depthLabel(info.format, info.bitDepth)}`;
}
