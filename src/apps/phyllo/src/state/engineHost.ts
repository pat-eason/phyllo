import type { PhylloEngine } from "@phyllo/engine";
import type { Unsubscribe } from "./feed";

/** Owns the single engine instance, created lazily on first use (DECISIONS: audio starts on a user gesture). */
export interface EngineHost {
  /** The engine, created on first call. */
  get(): PhylloEngine;
  /** The engine if it exists yet, without creating it. */
  peek(): PhylloEngine | null;
  /** Runs `callback` once the engine exists (immediately if it already does). Return a cleanup to run on dispose. */
  onCreate(callback: (engine: PhylloEngine) => Unsubscribe | void): Unsubscribe;
  dispose(): void;
}

export function createEngineHost(factory: () => PhylloEngine): EngineHost {
  let engine: PhylloEngine | null = null;
  const listeners = new Set<(engine: PhylloEngine) => Unsubscribe | void>();
  const cleanups: Unsubscribe[] = [];

  const run = (callback: (engine: PhylloEngine) => Unsubscribe | void, target: PhylloEngine) => {
    const cleanup = callback(target);
    if (typeof cleanup === "function") cleanups.push(cleanup);
  };

  return {
    get() {
      if (!engine) {
        engine = factory();
        const created = engine;
        for (const listener of [...listeners]) run(listener, created);
      }
      return engine;
    },
    peek: () => engine,
    onCreate(callback) {
      listeners.add(callback);
      if (engine) run(callback, engine);
      return () => listeners.delete(callback);
    },
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      listeners.clear();
      engine?.dispose();
      engine = null;
    },
  };
}
