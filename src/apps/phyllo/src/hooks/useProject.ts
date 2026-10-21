import type { Project } from "@phyllo/model";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import type { ProjectStoreState } from "../state/projectStore";

export type UseProject = Pick<
  ProjectStoreState,
  | "project"
  | "dispatch"
  | "undo"
  | "redo"
  | "canUndo"
  | "canRedo"
  | "beginGesture"
  | "endGesture"
  | "newProject"
  | "openProject"
  | "importCode"
  | "applyCode"
>;

/**
 * design-system §5 `useProject()`: the open `.phyllo` model and its reducer, plus undo/redo and gesture grouping
 * (`beginGesture()` on knob drag start, `endGesture()` on release → one undo step). Re-renders on every model
 * change; prefer `useProjectSelector` in organisms that need one slice.
 */
export function useProject(): UseProject {
  const { project } = useAppStores();
  return useStore(
    project,
    useShallow((s) => ({
      project: s.project,
      dispatch: s.dispatch,
      undo: s.undo,
      redo: s.redo,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      beginGesture: s.beginGesture,
      endGesture: s.endGesture,
      newProject: s.newProject,
      openProject: s.openProject,
      importCode: s.importCode,
      applyCode: s.applyCode,
    })),
  );
}

/**
 * One slice of the model; re-renders only when the slice changes (shallow compare, so returning a track
 * object or an array of ids is fine). `useProjectSelector((p) => findTrack(p, id))`.
 */
export function useProjectSelector<T>(selector: (project: Project) => T): T {
  const { project } = useAppStores();
  return useStore(
    project,
    useShallow((s: ProjectStoreState) => selector(s.project)),
  );
}

export type UseProjectFile = Pick<
  ProjectStoreState,
  | "filePath"
  | "dirty"
  | "lastSavedAt"
  | "autosavedAt"
  | "saving"
  | "saveError"
  | "save"
  | "saveAs"
  | "openProject"
  | "openProjectFromText"
  | "newProject"
  | "importCode"
  | "listHistory"
  | "restoreSnapshot"
> & { projectName: string; projectId: string };

/** File state and file actions (status bar, project menu); doesn't re-render on model edits that keep the name. */
export function useProjectFile(): UseProjectFile {
  const { project } = useAppStores();
  return useStore(
    project,
    useShallow((s) => ({
      projectName: s.project.name,
      projectId: s.project.id,
      filePath: s.filePath,
      dirty: s.dirty,
      lastSavedAt: s.lastSavedAt,
      autosavedAt: s.autosavedAt,
      saving: s.saving,
      saveError: s.saveError,
      save: s.save,
      saveAs: s.saveAs,
      openProject: s.openProject,
      openProjectFromText: s.openProjectFromText,
      newProject: s.newProject,
      importCode: s.importCode,
      listHistory: s.listHistory,
      restoreSnapshot: s.restoreSnapshot,
    })),
  );
}
