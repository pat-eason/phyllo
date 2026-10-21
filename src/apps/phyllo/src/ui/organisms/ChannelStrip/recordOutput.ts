// "● Rec output" (SPEC §6.4): records the master in real time through the export pipeline (WAV 24-bit to Exports/).
import type { PhylloEngine } from "@phyllo/engine";
import type { NativeApi } from "../../../native/api";
import type { ExportResult } from "../../../native/types";

export type RecordNative = Pick<NativeApi, "exportBegin" | "exportChunk" | "exportFinish" | "exportCancel">;

export interface OutputRecording {
  /** epoch ms when capture started */
  readonly startedAt: number;
  /** Stop capturing and write the file. Rejects (and cancels the session) when nothing was recorded or IO failed. */
  stop(): Promise<ExportResult>;
  /** Stop and discard. */
  cancel(): Promise<void>;
}

export interface StartRecordingOptions {
  engine: Pick<PhylloEngine, "startCapture" | "sampleRate">;
  native: RecordNative;
  /** Where to write: an unused absolute path in `Exports/` (from `native.exportUniquePath`). */
  fileName: string;
  now?: () => number;
  /** Time to let the capture tap flush its last chunk after stop. Default 80 ms. */
  drainMs?: number;
}

/** Interleave stereo frames (mono input is duplicated). */
function interleaveStereo(pcm: readonly Float32Array[]): Float32Array {
  const left = pcm[0] ?? new Float32Array(0);
  const right = pcm[1] ?? left;
  const out = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i += 1) {
    out[i * 2] = left[i] ?? 0;
    out[i * 2 + 1] = right[i] ?? 0;
  }
  return out;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Opens a WAV 24-bit export session and streams the master capture tap into it until `stop()`. */
export async function startOutputRecording(options: StartRecordingOptions): Promise<OutputRecording> {
  const { engine, native, fileName } = options;
  const now = options.now ?? Date.now;
  const drainMs = options.drainMs ?? 80;
  const sampleRate = engine.sampleRate > 0 ? engine.sampleRate : 48000;
  const { sessionId } = await native.exportBegin({ path: fileName, format: "wav", bitDepth: 24, sampleRate, channels: 2 });

  let accepting = true;
  let failure: unknown = null;
  let queue: Promise<void> = Promise.resolve();
  const stopCapture = engine.startCapture((pcm) => {
    if (!accepting || failure) return;
    const frames = interleaveStereo(pcm);
    if (frames.length === 0) return;
    queue = queue
      .then(() => native.exportChunk(sessionId, frames))
      .catch((error: unknown) => {
        failure ??= error;
      });
  });
  const startedAt = now();
  let done = false;

  const close = async () => {
    if (done) throw new Error("This recording has already stopped");
    done = true;
    stopCapture();
    if (drainMs > 0) await wait(drainMs);
    accepting = false;
    await queue;
  };

  return {
    startedAt,
    async stop() {
      await close();
      if (failure) {
        await native.exportCancel(sessionId).catch(() => undefined);
        throw failure;
      }
      return native.exportFinish(sessionId);
    },
    async cancel() {
      await close().catch(() => undefined);
      await native.exportCancel(sessionId).catch(() => undefined);
    },
  };
}

/**
 * `<project> take.wav`, the name to ask `native.exportUniquePath` for: it returns an absolute, unused path in
 * Exports/ (`<project> take 2.wav` when the first exists), so takes never replace each other, across relaunches too.
 */
export function takeFileName(projectName: string): string {
  const base = projectName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Untitled Groove";
  return `${base} take.wav`;
}
