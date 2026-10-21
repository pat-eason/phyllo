import type { Project } from "@phyllo/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStores } from "../../../hooks";

/** Id of the throw-away project that carries an audition, so we only ever restore over our own preview. */
export const AUDITION_PROJECT_ID = "phyllo-starter-audition";

interface Snapshot {
  project: Project;
  filePath: string | null;
  dirty: boolean;
}

export interface Audition {
  auditioning: boolean;
  /** Load `project` as a clean, unsaved preview and play it. Call from a click handler (audio needs a gesture). */
  start(project: Project): Promise<void>;
  /** Swap the previewed program while auditioning (tempo / key / starter changed). No-op otherwise. */
  update(project: Project): void;
  /** Stop playback and put the previous project back. */
  stop(): void;
  /** Stop playback but keep whatever is open now (the user created or opened a project). */
  release(): void;
}

/**
 * Auditions a starter without creating a file. The engine always plays the open project, so the preview is
 * loaded as the open project with `dirty: false` (autosave only files dirty projects, D101), played, and the
 * previous project, path and dirty flag are restored on stop or unmount. Restoring is skipped unless the open
 * project is still the preview, so opening or creating a project elsewhere is never overwritten.
 * Limits: the previous project's undo history is not restored, and loading counts as a `project/load` for tips.
 */
export function useAudition(): Audition {
  const { project, transport, engine } = useAppStores();
  const [auditioning, setAuditioning] = useState(false);
  const previous = useRef<Snapshot | null>(null);

  const finish = useCallback(
    (restore: boolean) => {
      const snapshot = previous.current;
      if (snapshot === null) return;
      previous.current = null;
      setAuditioning(false);
      transport.getState().stop();
      const state = project.getState();
      if (restore && state.project.id === AUDITION_PROJECT_ID) {
        state.loadProject(snapshot.project, { filePath: snapshot.filePath, dirty: snapshot.dirty });
      }
    },
    [project, transport],
  );

  useEffect(() => {
    const off = transport.subscribe((state, before) => {
      if (before.playing && !state.playing) finish(true);
    });
    return () => {
      off();
      finish(true);
    };
  }, [transport, finish]);

  const load = useCallback(
    (preview: Project) => {
      project.getState().loadProject({ ...preview, id: AUDITION_PROJECT_ID }, { filePath: null, dirty: false });
      engine.getState().regenerateNow();
    },
    [project, engine],
  );

  const start = useCallback(
    async (preview: Project) => {
      if (previous.current === null) {
        const { project: current, filePath, dirty } = project.getState();
        previous.current = { project: current, filePath, dirty };
        setAuditioning(true);
      }
      load(preview);
      await transport.getState().play();
      if (!transport.getState().playing) finish(true);
    },
    [project, transport, load, finish],
  );

  const update = useCallback(
    (preview: Project) => {
      if (previous.current !== null && project.getState().project.id === AUDITION_PROJECT_ID) load(preview);
    },
    [project, load],
  );

  const stop = useCallback(() => finish(true), [finish]);
  const release = useCallback(() => finish(false), [finish]);

  return { auditioning, start, update, stop, release };
}
