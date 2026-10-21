import { positionFromCycle } from "@phyllo/model";
import type { Project, TransportPosition } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { EngineHost } from "./engineHost";
import type { EngineStoreState } from "./engineStore";
import { createFeed } from "./feed";
import type { FrameScheduler, Unsubscribe } from "./feed";
import type { ProjectStoreState } from "./projectStore";

export type LoopRegion = Project["loop"];

export interface TransportStoreState {
  playing: boolean;
  /**
   * NOT live: a snapshot refreshed on play/pause/stop/seek/toStart. Live position comes from
   * `subscribePosition` (one shared rAF loop; design-system §5 perf rule).
   */
  position: TransportPosition;
  bpm: number;
  beatsPerBar: number;
  /** Synced from the project; edits go through `setLoop`/`toggleLoop` (undoable `loop/set`). */
  loop: LoopRegion;
  metronome: boolean;
  /** Record arm flag only; MIDI recording isn't implemented yet (SPEC §6.1 "proposed"). */
  recordArmed: boolean;

  /** Starts audio (user gesture) and plays. Errors land in `useEngine().audioError`. */
  play(): Promise<void>;
  pause(): void;
  togglePlay(): Promise<void>;
  /** Stop and return to the loop start (loop on) or bar 1. */
  stop(): void;
  /** Back to bar 1 without stopping. */
  toStart(): void;
  /** Move the playhead to a 1-based (fractional) bar without stopping. */
  seek(bar: number): void;
  setLoop(patch: Partial<LoopRegion>): void;
  toggleLoop(): void;
  setBpm(bpm: number): void;
  setMetronome(on: boolean): void;
  toggleMetronome(): void;
  setRecordArmed(on: boolean): void;
  toggleRecordArm(): void;
  /** Live position every animation frame while playing (and once on subscribe / stop / seek). */
  subscribePosition(callback: (position: TransportPosition) => void): Unsubscribe;
  /** Reads the current position now (no subscription). */
  getPosition(): TransportPosition;
}

export interface TransportStoreDeps {
  host: EngineHost;
  project: StoreApi<ProjectStoreState>;
  engine: StoreApi<EngineStoreState>;
  scheduler: FrameScheduler;
}

export interface TransportStoreHandle {
  store: StoreApi<TransportStoreState>;
  dispose(): void;
}

export function createTransportStore(deps: TransportStoreDeps): TransportStoreHandle {
  const { host } = deps;
  const cleanups: Unsubscribe[] = [];
  const projectNow = () => deps.project.getState().project;
  /** Position before the engine exists. */
  let idleCycle = 0;

  const read = (): TransportPosition => {
    const engine = host.peek();
    return positionFromCycle(engine ? engine.getCycle() : idleCycle, projectNow().tempo.beatsPerBar);
  };
  const feed = createFeed<TransportPosition>({ scheduler: deps.scheduler, read });

  const p0 = projectNow();
  const store = createStore<TransportStoreState>()((set, get) => {
    const snapshot = () => {
      set({ position: read() });
      feed.emit();
    };
    return {
      playing: false,
      position: read(),
      bpm: p0.tempo.bpm,
      beatsPerBar: p0.tempo.beatsPerBar,
      loop: p0.loop,
      metronome: false,
      recordArmed: false,
      async play() {
        try {
          await deps.engine.getState().ensureAudio();
        } catch {
          return;
        }
        host.get().play();
        snapshot();
      },
      pause() {
        host.peek()?.pause();
        snapshot();
      },
      togglePlay() {
        if (get().playing) {
          get().pause();
          return Promise.resolve();
        }
        return get().play();
      },
      stop() {
        const engine = host.peek();
        if (engine) engine.stop();
        else {
          const loop = projectNow().loop;
          idleCycle = loop.enabled ? loop.startBar - 1 : 0;
        }
        snapshot();
      },
      toStart() {
        const engine = host.peek();
        if (engine) engine.toStart();
        else idleCycle = 0;
        snapshot();
      },
      seek(bar) {
        const cycle = Math.max(0, Math.min(projectNow().lengthBars, bar - 1));
        const engine = host.peek();
        if (engine) engine.seek(cycle);
        else idleCycle = cycle;
        snapshot();
      },
      setLoop(patch) {
        deps.project.getState().dispatch({ type: "loop/set", ...patch });
      },
      toggleLoop() {
        deps.project.getState().dispatch({ type: "loop/set", enabled: !projectNow().loop.enabled });
      },
      setBpm(bpm) {
        deps.project.getState().dispatch({ type: "tempo/set", bpm });
      },
      setMetronome: (on) => set({ metronome: on }),
      toggleMetronome: () => set({ metronome: !get().metronome }),
      setRecordArmed: (on) => set({ recordArmed: on }),
      toggleRecordArm: () => set({ recordArmed: !get().recordArmed }),
      subscribePosition: (callback) => feed.subscribe(callback),
      getPosition: read,
    };
  });

  const pushToEngine = (project: Project) => {
    const engine = host.peek();
    if (!engine) return;
    engine.setLoop(project.loop);
    engine.setSongLength(project.lengthBars);
  };

  cleanups.push(
    deps.project.subscribe((state, prev) => {
      const p = state.project;
      const q = prev.project;
      if (p === q) return;
      if (p.id !== q.id) {
        const engine = host.peek();
        if (engine?.playing) engine.stop();
        idleCycle = 0;
      }
      if (p.loop !== q.loop || p.tempo !== q.tempo || p.lengthBars !== q.lengthBars) {
        store.setState({ bpm: p.tempo.bpm, beatsPerBar: p.tempo.beatsPerBar, loop: p.loop });
        pushToEngine(p);
      }
    }),
  );

  cleanups.push(
    host.onCreate((engine) => {
      pushToEngine(projectNow());
      // A seek/stop before the engine existed moved only the idle position; hand it over.
      if (idleCycle !== 0) engine.seek(idleCycle);
      const off = engine.onTransport(({ playing }) => {
        feed.setActive(playing);
        store.setState({ playing, position: read() });
        if (!playing) feed.emit();
      });
      store.setState({ playing: engine.playing });
      feed.setActive(engine.playing);
      return off;
    }),
  );

  return {
    store,
    dispose() {
      for (const cleanup of cleanups.splice(0)) cleanup();
      feed.dispose();
    },
  };
}
