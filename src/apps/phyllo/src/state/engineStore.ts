import { generate } from "@phyllo/engine";
import type { MeterSnapshot, PreviewSound } from "@phyllo/engine";
import type { CodeScope, EngineError, EngineStatus, GeneratedProgram, LineMap, Project } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { EngineHost } from "./engineHost";
import { createFeed } from "./feed";
import type { FrameScheduler, Unsubscribe } from "./feed";
import type { ProjectStoreState } from "./projectStore";

/** Same contract as `@phyllo/ui`'s `MeterSubscribe`: call `write` per update, return an unsubscribe. */
export type LevelSubscribe = (write: (left: number, right?: number) => void) => () => void;

export interface EngineStoreState {
  /** Display code for the current scope (no `.analyze()` instrumentation; what the code drawer shows and shares). */
  code: string;
  /** Line ranges per track in `code` (code drawer highlight, error underline). */
  lineMap: LineMap;
  scope: CodeScope;
  /** Bar whose section the `section` scope renders: the playhead's while playing, else the loop start / last position. */
  sectionBar: number;
  /** Mirrors `engine.status`. */
  status: EngineStatus;
  /** Errors by track id (TrackHeader red dot). Empty while the program is healthy. */
  trackErrors: Readonly<Record<string, EngineError>>;
  /** `engine.init()` finished. */
  audioReady: boolean;
  /** Message when audio couldn't start. */
  audioError: string | null;

  setScope(scope: CodeScope): void;
  /** Start audio. Call it synchronously inside a click/key handler (WebAudio needs a user gesture). Idempotent. */
  ensureAudio(): Promise<void>;
  /** Audition a sound (library rows, starter cards). Starts audio first. */
  preview(sound: PreviewSound, durationSec?: number): Promise<void>;
  /** ~30 Hz meter snapshots, pushed outside React. Receives a snapshot immediately on subscribe. */
  subscribeMeters(callback: (meters: MeterSnapshot) => void): Unsubscribe;
  /** Stable per-track subscription for `<Meter subscribe>` / `<TrackHeader meterSubscribe>`. */
  meterFor(trackId: string): LevelSubscribe;
  /** Stable per-orbit (bus strip) subscription. */
  orbitMeterFor(orbit: number): LevelSubscribe;
  /** Master strip subscription. */
  masterMeter: LevelSubscribe;
  /** Skip the debounce (tests, "evaluate now"). */
  regenerateNow(): void;
}

export interface EngineStoreDeps {
  host: EngineHost;
  project: StoreApi<ProjectStoreState>;
  scheduler: FrameScheduler;
  /** Debounce between a model change and regeneration/evaluation (SPEC §4.1: ~50–100 ms). */
  regenerateMs: number;
  onError?: (message: string, error: unknown) => void;
}

export interface EngineStoreHandle {
  store: StoreApi<EngineStoreState>;
  /** Called by the transport wiring when the playhead enters another section. */
  setSectionBar(bar: number): void;
  dispose(): void;
}

export const SILENT_METERS: MeterSnapshot = Object.freeze({
  tracks: Object.freeze({}) as MeterSnapshot["tracks"],
  orbits: Object.freeze({}) as MeterSnapshot["orbits"],
  master: [0, 0] as const,
});
const NO_ERRORS: Readonly<Record<string, EngineError>> = Object.freeze({});
const METER_INTERVAL_MS = 33;

function trackErrorsOf(status: EngineStatus): Readonly<Record<string, EngineError>> {
  const error = status.error;
  if (status.ok || !error?.trackId) return NO_ERRORS;
  return { [error.trackId]: error };
}

function defaultSectionBar(project: Project): number {
  return project.loop.enabled ? project.loop.startBar : 1;
}

function displayProgram(project: Project, scope: CodeScope, sectionBar: number): GeneratedProgram {
  return scope === "section" ? generate(project, { scope, atBar: sectionBar }) : generate(project, { scope });
}

export function createEngineStore(deps: EngineStoreDeps): EngineStoreHandle {
  const { host } = deps;
  const report = (message: string, error: unknown) => deps.onError?.(message, error);
  let regenTimer: ReturnType<typeof setTimeout> | undefined;
  let lastEvaluated: string | null = null;
  let initPromise: Promise<void> | undefined;
  const cleanups: Unsubscribe[] = [];

  const meterFeed = createFeed<MeterSnapshot>({
    scheduler: deps.scheduler,
    read: () => host.peek()?.getMeters() ?? SILENT_METERS,
    minIntervalMs: METER_INTERVAL_MS,
  });

  const project0 = deps.project.getState().project;
  const sectionBar0 = defaultSectionBar(project0);
  let initial: GeneratedProgram = { code: "", lines: {}, scope: "song" };
  try {
    initial = displayProgram(project0, "song", sectionBar0);
  } catch (error) {
    report("Couldn't generate code", error);
  }

  const store = createStore<EngineStoreState>()((set, get) => {
    const trackMeters = new Map<string, LevelSubscribe>();
    const orbitMeters = new Map<number, LevelSubscribe>();
    return {
      code: initial.code,
      lineMap: initial.lines,
      scope: "song",
      sectionBar: sectionBar0,
      status: { ok: true, evaluatedAt: null },
      trackErrors: NO_ERRORS,
      audioReady: false,
      audioError: null,
      setScope(scope) {
        if (scope === get().scope) return;
        set({ scope });
        regenerateDisplay();
      },
      ensureAudio() {
        if (!initPromise) {
          const engine = host.get();
          initPromise = engine.init().then(
            () => set({ audioReady: true, audioError: null }),
            (error: unknown) => {
              initPromise = undefined;
              set({ audioError: error instanceof Error ? error.message : String(error) });
              throw error;
            },
          );
        }
        return initPromise;
      },
      async preview(sound, durationSec) {
        await get().ensureAudio();
        await host.get().preview(sound, durationSec);
      },
      subscribeMeters: (callback) => meterFeed.subscribe(callback),
      meterFor(trackId) {
        let subscribe = trackMeters.get(trackId);
        if (!subscribe) {
          subscribe = (write) =>
            meterFeed.subscribe((m) => {
              const level = m.tracks[trackId];
              write(level?.[0] ?? 0, level?.[1] ?? 0);
            });
          trackMeters.set(trackId, subscribe);
        }
        return subscribe;
      },
      orbitMeterFor(orbit) {
        let subscribe = orbitMeters.get(orbit);
        if (!subscribe) {
          subscribe = (write) =>
            meterFeed.subscribe((m) => {
              const level = m.orbits[orbit];
              write(level?.[0] ?? 0, level?.[1] ?? 0);
            });
          orbitMeters.set(orbit, subscribe);
        }
        return subscribe;
      },
      masterMeter: (write) => meterFeed.subscribe((m) => write(m.master[0], m.master[1])),
      regenerateNow() {
        clearTimeout(regenTimer);
        regenTimer = undefined;
        regenerate();
      },
    };
  });

  function regenerateDisplay() {
    const { scope, sectionBar } = store.getState();
    try {
      const program = displayProgram(deps.project.getState().project, scope, sectionBar);
      const state = store.getState();
      if (program.code !== state.code || JSON.stringify(program.lines) !== JSON.stringify(state.lineMap)) {
        store.setState({ code: program.code, lineMap: program.lines });
      }
    } catch (error) {
      report("Couldn't generate code", error);
    }
  }

  function regenerate() {
    regenerateDisplay();
    let program: GeneratedProgram;
    try {
      program = generate(deps.project.getState().project, { scope: "song", instrument: true });
    } catch (error) {
      report("Couldn't generate code", error);
      return;
    }
    if (program.code === lastEvaluated) return;
    lastEvaluated = program.code;
    host
      .get()
      .evaluate(program)
      .catch((error: unknown) => report("Evaluation failed", error));
  }

  const schedule = () => {
    clearTimeout(regenTimer);
    regenTimer = setTimeout(() => {
      regenTimer = undefined;
      regenerate();
    }, deps.regenerateMs);
  };

  cleanups.push(
    deps.project.subscribe((state, prev) => {
      if (state.project === prev.project) return;
      if (state.project.id !== prev.project.id) {
        store.setState({ sectionBar: defaultSectionBar(state.project) });
      }
      schedule();
    }),
  );

  cleanups.push(
    host.onCreate((engine) => {
      const status = engine.status;
      store.setState({ status, trackErrors: trackErrorsOf(status), audioReady: engine.ready });
      const offStatus = engine.onStatus((next) => {
        store.setState({ status: next, trackErrors: trackErrorsOf(next) });
      });
      const offTransport = engine.onTransport(({ playing }) => {
        meterFeed.setActive(playing);
        if (!playing) meterFeed.emit();
      });
      meterFeed.setActive(engine.playing);
      return () => {
        offStatus();
        offTransport();
      };
    }),
  );

  // First evaluation: the engine keeps the program until `init()` (it is created here, cheaply, without audio).
  schedule();

  return {
    store,
    setSectionBar(bar) {
      if (store.getState().sectionBar === bar) return;
      store.setState({ sectionBar: bar });
      if (store.getState().scope === "section") regenerateDisplay();
    },
    dispose() {
      clearTimeout(regenTimer);
      for (const cleanup of cleanups.splice(0)) cleanup();
      meterFeed.dispose();
    },
  };
}
