import type { PhylloEngine } from "@phyllo/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioBufferLike } from "../native/export";
import { useAppStores } from "../state/context";
import type { AppStores } from "../state/createAppStores";
import { isAbortError, runExport } from "../state/exportPipeline";
import type { ExportDeps, ExportJobResult, ExportOptions, RealtimeCapture } from "../state/exportPipeline";

export type ExportJobState = "idle" | "rendering" | "encoding" | "done" | "error";

export interface UseExport {
  state: ExportJobState;
  /** 0–1 over the whole job. */
  progress: number;
  /** The options of the running / last job (Try again re-runs them). */
  options?: ExportOptions;
  result?: ExportJobResult;
  error?: string;
  /** Call from the click handler: audio exports start the AudioContext inside the gesture. */
  start(options: ExportOptions): void;
  /** Cancels a running job (back to idle); no-op otherwise. */
  cancel(): void;
  /** Clears a finished / failed job back to idle. */
  reset(): void;
}

export interface UseExportOptions {
  /** Overrides for the pipeline's deps (tests, stories). */
  deps?: Partial<Omit<ExportDeps, "onProgress" | "signal">>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return String(error);
}

/** Real-time fallback (SPEC §6.5 "proposed" pipeline): plays the range and taps the master bus. */
export function createRealtimeCapture(engine: PhylloEngine, stores: Pick<AppStores, "project">): RealtimeCapture {
  return ({ fromCycle, durationSec, signal, onProgress }) =>
    new Promise<AudioBufferLike>((resolve, reject) => {
      const chunks: Float32Array[][] = [];
      let frames = 0;
      let rate = engine.sampleRate || 48000;
      let target = Math.ceil(durationSec * rate);
      const loop = stores.project.getState().project.loop;
      const finish = (error?: unknown) => {
        stopCapture();
        engine.stop();
        engine.setLoop({ enabled: loop.enabled, startBar: loop.startBar, endBar: loop.endBar });
        signal?.removeEventListener("abort", onAbort);
        if (error !== undefined) {
          reject(error);
          return;
        }
        const channels = [0, 1].map((c) => {
          const out = new Float32Array(target);
          let at = 0;
          for (const chunk of chunks) {
            const data = chunk[c] ?? chunk[0]!;
            const take = Math.min(data.length, target - at);
            if (take <= 0) break;
            out.set(data.subarray(0, take), at);
            at += take;
          }
          return out;
        });
        resolve({ numberOfChannels: 2, sampleRate: rate, getChannelData: (c) => channels[c]! });
      };
      const onAbort = () => finish(signal?.reason ?? new DOMException("Export cancelled", "AbortError"));
      signal?.addEventListener("abort", onAbort);
      engine.setLoop({ enabled: false, startBar: loop.startBar, endBar: loop.endBar });
      engine.seek(fromCycle);
      const stopCapture = engine.startCapture((pcm, sampleRate) => {
        if (sampleRate !== rate) {
          rate = sampleRate;
          target = Math.ceil(durationSec * rate);
        }
        chunks.push(pcm);
        frames += pcm[0]?.length ?? 0;
        onProgress?.(Math.min(1, frames / target));
        if (frames >= target) finish();
      });
      engine.play();
    });
}

/**
 * Runs one export job at a time (SPEC §6.5): `{ state, progress, result, error, start, cancel }`. The job keeps
 * running if the dialog closes. Completing a job finishes tip step 5 (DECISIONS D105).
 */
export function useExport(options: UseExportOptions = {}): UseExport {
  const stores = useAppStores();
  const [job, setJob] = useState<Pick<UseExport, "state" | "progress" | "options" | "result" | "error">>({
    state: "idle",
    progress: 0,
  });
  const controller = useRef<AbortController | null>(null);
  const depsRef = useRef(options.deps);
  useEffect(() => {
    depsRef.current = options.deps;
  });

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const start = useCallback(
    (exportOptions: ExportOptions) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const audio = exportOptions.kind === "mixdown" || exportOptions.kind === "stems";
      // inside the click: WebAudio needs the gesture (DECISIONS D102)
      const audioReady = audio ? stores.engine.getState().ensureAudio() : Promise.resolve();
      setJob({ state: "rendering", progress: 0, options: exportOptions });

      void (async () => {
        try {
          await audioReady;
          const engine = stores.engineHost.get();
          const overrides = depsRef.current ?? {};
          const result = await runExport(stores.project.getState().project, exportOptions, {
            native: stores.native,
            engine,
            capture: createRealtimeCapture(engine, stores),
            copyText: (text) => navigator.clipboard.writeText(text),
            ...overrides,
            signal: abort.signal,
            onProgress: ({ phase, fraction }) => {
              if (controller.current !== abort) return;
              setJob((j) => ({ ...j, state: phase, progress: Math.max(0, Math.min(1, fraction)) }));
            },
          });
          if (controller.current !== abort) return;
          controller.current = null;
          setJob({ state: "done", progress: 1, options: exportOptions, result });
          stores.tips.getState().complete(5);
        } catch (error) {
          if (controller.current !== abort) return;
          controller.current = null;
          if (isAbortError(error)) setJob({ state: "idle", progress: 0, options: exportOptions });
          else setJob({ state: "error", progress: 0, options: exportOptions, error: errorMessage(error) });
        }
      })();
    },
    [stores],
  );

  const cancel = useCallback(() => {
    const running = controller.current;
    if (!running) return;
    controller.current = null;
    running.abort(new DOMException("Export cancelled", "AbortError"));
    setJob((j) => ({ state: "idle", progress: 0, ...(j.options ? { options: j.options } : {}) }));
  }, []);

  const reset = useCallback(() => {
    if (controller.current) return;
    setJob((j) => ({ state: "idle", progress: 0, ...(j.options ? { options: j.options } : {}) }));
  }, []);

  return { ...job, start, cancel, reset };
}
