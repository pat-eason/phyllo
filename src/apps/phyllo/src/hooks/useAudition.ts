import type { Project } from "@phyllo/model";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAppStores } from "../state/context";

/** Id of the throw-away project that carries an audition, so we only ever restore over our own preview. */
export const AUDITION_PROJECT_ID = "phyllo-audition";

/** A program to audition, or an async way to get it (reading a groove file). */
export type AuditionSource = Project | (() => Promise<Project>);

export interface AuditionOptions {
  /**
   * 1-based bar to start playing from (e.g. a groove's first section), or a function of the loaded program for sources
   * that are only known after reading. Default: where the transport is.
   */
  startBar?: number | ((preview: Project) => number | undefined);
}

export interface Audition {
  /** Key of the audition in progress (the card, row or starter being heard), or null. Shared by every `useAudition()` user. */
  auditioning: string | null;
  /**
   * Load the program as a clean, unsaved preview and play it; any audition already running is replaced (only one at a
   * time). Call from a click handler (audio needs a gesture). Rejects when an async source fails, after putting the
   * previous project back.
   */
  audition(key: string, source: AuditionSource, options?: AuditionOptions): Promise<void>;
  /** Swap the previewed program while this hook's audition is running (tempo / key / starter changed). No-op otherwise. */
  update(project: Project): void;
  /** Stop playback and put the previous project back. */
  stop(): void;
  /** Stop playback but keep whatever is open now (the user created or opened a project). */
  release(): void;
}

interface Snapshot {
  project: Project;
  filePath: string | null;
  dirty: boolean;
}

interface Session {
  key: string;
  snapshot: Snapshot;
  /** The hook instance that started it; only it restores on unmount. */
  owner: object;
}

/** One audition slot per app: every `useAudition()` shares it, so two surfaces can never audition at once. */
interface Slot {
  subscribe(listener: () => void): () => void;
  key(): string | null;
  session(): Session | null;
  /** Make `session` the running audition; returns a generation for `isCurrent`. */
  begin(session: Session): number;
  /** Clear the running audition and return it. */
  end(): Session | null;
  /** False once the audition that returned `generation` was replaced or ended (an async start must then bail out). */
  isCurrent(generation: number): boolean;
}

function createSlot(): Slot {
  let current: Session | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    key: () => current?.key ?? null,
    session: () => current,
    begin(session) {
      current = session;
      generation += 1;
      notify();
      return generation;
    },
    end() {
      const ended = current;
      current = null;
      generation += 1;
      notify();
      return ended;
    },
    isCurrent: (value) => value === generation,
  };
}

const slots = new WeakMap<object, Slot>();

function slotFor(scope: object): Slot {
  const existing = slots.get(scope);
  if (existing) return existing;
  const created = createSlot();
  slots.set(scope, created);
  return created;
}

/**
 * Auditions another program without creating a file (B6): the engine always plays the open project, so the audition is
 * loaded as the open project with `dirty: false` (autosave only files dirty projects, D101), played, and the previous
 * project, path and dirty flag are put back on stop, when the transport stops, or on unmount. Restoring is skipped unless
 * the open project is still the audition, so opening or creating a project elsewhere is never overwritten.
 * Limits: the previous project's undo history is not restored, and loading counts as a `project/load` for tips.
 */
export function useAudition(): Audition {
  const { project, transport, engine, flush } = useAppStores();
  const [slot] = useState(() => slotFor(project));
  const owner = useRef<object>({});
  const auditioning = useSyncExternalStore(slot.subscribe, slot.key, slot.key);

  const finish = useCallback(
    (restore: boolean) => {
      const ended = slot.end();
      if (ended === null) return;
      transport.getState().stop();
      const state = project.getState();
      if (restore && state.project.id === AUDITION_PROJECT_ID) {
        const { snapshot } = ended;
        state.loadProject(snapshot.project, { filePath: snapshot.filePath, dirty: snapshot.dirty });
      }
    },
    [slot, project, transport],
  );

  useEffect(() => {
    const me = owner.current;
    const off = transport.subscribe((state, before) => {
      if (before.playing && !state.playing && slot.session()?.owner === me) finish(true);
    });
    return () => {
      off();
      if (slot.session()?.owner === me) finish(true);
    };
  }, [transport, slot, finish]);

  const load = useCallback(
    (preview: Project) => {
      project.getState().loadProject({ ...preview, id: AUDITION_PROJECT_ID }, { filePath: null, dirty: false });
      engine.getState().regenerateNow();
    },
    [project, engine],
  );

  const audition = useCallback(
    async (key: string, source: AuditionSource, options: AuditionOptions = {}) => {
      // Start audio inside the gesture, before any await below.
      const audioReady = engine
        .getState()
        .ensureAudio()
        .then(
          () => true,
          () => false, // surfaced by the engine store as `audioError`; the audition just doesn't start
        );
      const current = project.getState();
      // Replacing a running audition keeps the original snapshot: that is what stop() must put back.
      const running = slot.session();
      const snapshot: Snapshot = running?.snapshot ?? {
        project: current.project,
        filePath: current.filePath,
        dirty: current.dirty,
      };
      const generation = slot.begin({ key, snapshot, owner: owner.current });
      const superseded = () => !slot.isCurrent(generation);

      let preview: Project;
      try {
        // Loading drops the open project's pending autosave, so write it out first.
        if (running === null && snapshot.dirty) await flush();
        preview = typeof source === "function" ? await source() : source;
      } catch (error) {
        if (!superseded()) finish(true);
        throw error;
      }
      if (superseded()) return;

      load(preview);
      if (!(await audioReady) || superseded()) {
        if (!superseded()) finish(true);
        return;
      }
      const startBar = typeof options.startBar === "function" ? options.startBar(preview) : options.startBar;
      if (startBar !== undefined) transport.getState().seek(startBar);
      await transport.getState().play();
      if (!superseded() && !transport.getState().playing) finish(true);
    },
    [engine, project, transport, flush, slot, load, finish],
  );

  const update = useCallback(
    (preview: Project) => {
      if (slot.session()?.owner === owner.current && project.getState().project.id === AUDITION_PROJECT_ID) load(preview);
    },
    [slot, project, load],
  );

  const stop = useCallback(() => finish(true), [finish]);
  const release = useCallback(() => finish(false), [finish]);

  return { auditioning, audition, update, stop, release };
}
