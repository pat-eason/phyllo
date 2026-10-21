import { fromShareUrl, parse } from "@phyllo/engine";
import {
  DEFAULT_PROJECT_NAME,
  buildStarterProject,
  createProject,
  parseProjectFile,
  projectReducer,
  serializeProject,
} from "@phyllo/model";
import type { Project, ProjectAction, StarterId } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { NativeApi } from "../native/api";
import type { SnapshotInfo } from "../native/types";
import type { Unsubscribe } from "./feed";
import { emptyHistory, record, redo as redoStep, undo as undoStep, withCurrentUi } from "./history";
import type { HistoryEntry, UndoHistory } from "./history";

// ── results ─────────────────────────────────────────────────────────────────

export type OpResult<T = object> = ({ ok: true; warnings?: string[] } & T) | OpError;

export interface OpError {
  ok: false;
  error: string;
  /** The user dismissed a dialog; show nothing. */
  cancelled?: boolean;
  /** 1-based location of a code syntax error (importCode / applyCode). */
  line?: number;
  column?: number;
}

export type SaveResult = OpResult<{ path: string }>;

export interface NewProjectOptions {
  name?: string;
  bpm?: number;
  key?: string;
}

// ── state ───────────────────────────────────────────────────────────────────

export interface ProjectStoreState {
  project: Project;
  /** File on disk; null until first saved. */
  filePath: string | null;
  /** Unsaved changes (selection changes never make a project dirty). */
  dirty: boolean;
  /** epoch ms of the last successful write (manual or auto). */
  lastSavedAt: number | null;
  /** epoch ms of the last successful autosave (status bar "Autosaved 12:41"). */
  autosavedAt: number | null;
  saving: boolean;
  /** Message of the last failed write; cleared by the next successful one. */
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;

  /** Applies a model action through `projectReducer`. Undoable unless it is a `ui/*` action. */
  dispatch(action: ProjectAction): void;
  undo(): void;
  redo(): void;
  /** Group every change until the matching `endGesture()` into one undo step (knob drags, fader moves). Nestable. */
  beginGesture(): void;
  endGesture(): void;

  /** Fresh project from a starter (`buildStarterProject`) or blank. Starts dirty so autosave files it. */
  newProject(starterId?: StarterId | null, options?: NewProjectOptions): Project;
  /** Replace the open project (history reset). */
  loadProject(project: Project, options?: { filePath?: string | null; dirty?: boolean }): void;
  /** `.phyllo` (validated) or `.strudel` (imported as a new unsaved project). Flushes a pending autosave first. */
  openProject(path: string): Promise<OpResult>;
  openProjectFromText(text: string, path?: string | null): OpResult;
  /**
   * New project from Strudel code or a strudel.cc `#` link. Parse errors return `{ ok: false, line, column }`
   * and leave the open project untouched.
   */
  importCode(input: string, options?: { name?: string }): OpResult;
  /** Replace the open project's tracks from edited code (`code/replace`, undoable). Errors leave the model untouched. */
  applyCode(code: string): OpResult;
  /** Write to `filePath` (a new project gets `native.projectNewPath(name)`). */
  save(): Promise<SaveResult>;
  /** Write to `path`, or ask with the native save dialog. A copy at a new path gets a new project id. */
  saveAs(path?: string): Promise<SaveResult>;
  /** Version history of the open project, newest first. */
  listHistory(): Promise<SnapshotInfo[]>;
  /** Restore a snapshot as an undoable change. */
  restoreSnapshot(snapshotId: string): Promise<OpResult>;
}

export interface ProjectStoreDeps {
  native: NativeApi;
  now: () => number;
  newId: (prefix: string) => string;
  /** Settings `system.autosave` (autosave and version history). */
  autosaveEnabled: () => boolean;
  autosaveMs: number;
  initialProject?: Project;
  initialFilePath?: string | null;
  /** Background write failures that have no store state to land in. */
  onError?: (message: string, error: unknown) => void;
}

export interface ProjectStoreHandle {
  store: StoreApi<ProjectStoreState>;
  /** Every applied action (after the reducer), for the tips curriculum and analytics. */
  onAction(callback: (action: ProjectAction, project: Project) => void): Unsubscribe;
  /** Writes now if an autosave is pending. */
  flushAutosave(): Promise<void>;
  /** Re-check after the autosave setting changes. */
  autosaveSettingChanged(): void;
  dispose(): void;
}

const PHYLLO_FILTER = { name: "Phyllo project", extensions: ["phyllo"] };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

function fileStem(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.[^.]+$/, "") || DEFAULT_PROJECT_NAME;
}

/** True when `input` looks like a link rather than code. */
function isLink(input: string): boolean {
  return /^(?:https?:\/\/|strudel\.cc\b)/i.test(input.trim());
}

export function createProjectStore(deps: ProjectStoreDeps): ProjectStoreHandle {
  const { native, now, newId } = deps;
  const actionListeners = new Set<(action: ProjectAction, project: Project) => void>();

  let history: UndoHistory = emptyHistory();
  let nextRev = 1;
  let rev = 0;
  let savedRev = 0;
  let gestureDepth = 0;
  let gestureRecorded = false;
  /** Bumped whenever another project is loaded, so in-flight saves of the previous one don't touch state. */
  let generation = 0;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let saveChain: Promise<unknown> = Promise.resolve();

  const iso = () => new Date(now()).toISOString();
  const stamp = (p: Project): Project => ({ ...p, modified: iso() });
  const emit = (action: ProjectAction, project: Project) => {
    for (const listener of [...actionListeners]) listener(action, project);
  };

  const initial = deps.initialProject ?? createProject({ id: newId("prj_"), now: iso() });

  const store = createStore<ProjectStoreState>()(() => ({
    project: initial,
    filePath: deps.initialFilePath ?? null,
    dirty: false,
    lastSavedAt: null,
    autosavedAt: null,
    saving: false,
    saveError: null,
    canUndo: false,
    canRedo: false,
    dispatch: () => {},
    undo: () => {},
    redo: () => {},
    beginGesture: () => {},
    endGesture: () => {},
    newProject: () => initial,
    loadProject: () => {},
    openProject: async () => ({ ok: false, error: "not ready" }),
    openProjectFromText: () => ({ ok: false, error: "not ready" }),
    importCode: () => ({ ok: false, error: "not ready" }),
    applyCode: () => ({ ok: false, error: "not ready" }),
    save: async () => ({ ok: false, error: "not ready" }),
    saveAs: async () => ({ ok: false, error: "not ready" }),
    listHistory: async () => [],
    restoreSnapshot: async () => ({ ok: false, error: "not ready" }),
  }));
  const get = store.getState;
  const set = store.setState;

  const historyFlags = () => ({ canUndo: history.past.length > 0, canRedo: history.future.length > 0 });

  // ── autosave ──
  const clearAutosave = () => {
    clearTimeout(autosaveTimer);
    autosaveTimer = undefined;
  };
  const scheduleAutosave = () => {
    clearAutosave();
    if (!deps.autosaveEnabled() || !get().dirty) return;
    autosaveTimer = setTimeout(() => {
      autosaveTimer = undefined;
      if (get().dirty) void write("auto");
    }, deps.autosaveMs);
  };

  // ── writes (serialised) ──
  const write = (kind: "manual" | "auto", explicitPath?: string): Promise<SaveResult> => {
    const job = saveChain.then(async (): Promise<SaveResult> => {
      const gen = generation;
      const snapshot = get().project;
      const writtenRev = rev;
      set({ saving: true });
      try {
        const path = explicitPath ?? get().filePath ?? (await native.projectNewPath(snapshot.name));
        const json = serializeProject(snapshot);
        await native.projectWrite(path, json);
        if (deps.autosaveEnabled()) {
          await native.historySnapshot(snapshot.id, json).catch(() => undefined);
        }
        if (gen !== generation) return { ok: true, path };
        savedRev = writtenRev;
        const at = now();
        set({
          filePath: path,
          dirty: rev !== savedRev,
          lastSavedAt: at,
          saving: false,
          saveError: null,
          ...(kind === "auto" ? { autosavedAt: at } : {}),
        });
        return { ok: true, path };
      } catch (error) {
        const message = errorMessage(error);
        if (gen === generation) set({ saving: false, saveError: message });
        return { ok: false, error: message };
      }
    });
    saveChain = job.catch(() => undefined);
    return job;
  };

  // ── commits ──
  const commit = (next: Project, options: { undoable: boolean; dirtying: boolean }) => {
    const current = get().project;
    if (options.undoable) {
      if (gestureDepth === 0 || !gestureRecorded) {
        history = record(history, { project: current, rev });
        if (gestureDepth > 0) gestureRecorded = true;
      }
    }
    let project = next;
    if (options.dirtying) {
      rev = nextRev++;
      project = stamp(next);
    }
    set({ project, dirty: rev !== savedRev, ...historyFlags() });
    if (options.dirtying) scheduleAutosave();
  };

  const restore = (entry: HistoryEntry) => {
    rev = entry.rev;
    const dirty = rev !== savedRev;
    const project = withCurrentUi(entry.project, get().project);
    set({ project, dirty, ...historyFlags() });
    if (dirty) scheduleAutosave();
    else clearAutosave();
  };

  /** Writes a project that is about to be replaced while its autosave was still pending (never drop edits). */
  const writeOutgoing = (snapshot: Project, filePath: string | null) => {
    saveChain = saveChain
      .then(async () => {
        const path = filePath ?? (await native.projectNewPath(snapshot.name));
        const json = serializeProject(snapshot);
        await native.projectWrite(path, json);
        await native.historySnapshot(snapshot.id, json).catch(() => undefined);
      })
      .catch((error: unknown) => deps.onError?.("Autosave before switching projects failed", error));
  };

  const loadProject: ProjectStoreState["loadProject"] = (project, options = {}) => {
    if (autosaveTimer !== undefined && get().dirty && deps.autosaveEnabled()) writeOutgoing(get().project, get().filePath);
    generation += 1;
    clearAutosave();
    history = emptyHistory();
    gestureDepth = 0;
    gestureRecorded = false;
    rev = nextRev++;
    const dirty = options.dirty ?? false;
    savedRev = dirty ? -1 : rev;
    set({
      project,
      filePath: options.filePath ?? null,
      dirty,
      lastSavedAt: null,
      autosavedAt: null,
      saving: false,
      saveError: null,
      ...historyFlags(),
    });
    emit({ type: "project/load", project }, project);
    if (dirty) scheduleAutosave();
  };

  const freshProject = (name?: string): Project =>
    createProject({ id: newId("prj_"), name: name ?? DEFAULT_PROJECT_NAME, now: iso() });

  const parseCode = (code: string, lengthBars: number) =>
    parse(code, { lengthBars, inferBuses: true, newId: () => newId("p") });

  const importCode: ProjectStoreState["importCode"] = (input, options = {}) => {
    let code = input;
    if (isLink(input)) {
      const decoded = fromShareUrl(input.trim().replace(/^strudel\.cc/i, "https://strudel.cc"));
      if (decoded === null) return { ok: false, error: "That doesn't look like a strudel.cc link with code in it." };
      if ("shortId" in decoded) {
        return {
          ok: false,
          error: "Short strudel.cc links (?id) can't be opened offline. In strudel.cc, use Share › Copy link with code.",
        };
      }
      code = decoded.code;
    }
    const base = freshProject(options.name);
    const parsed = parseCode(code, base.lengthBars);
    if (!parsed.ok) {
      const e = parsed.error;
      return { ok: false, error: e?.message ?? "Couldn't read this code.", ...(e ? { line: e.line, column: e.column } : {}) };
    }
    if (parsed.tracks.length === 0) return { ok: false, error: "No $: patterns found in this code." };
    const replaced = projectReducer(base, {
      type: "code/replace",
      tracks: parsed.tracks,
      prelude: parsed.prelude,
      ...(parsed.tempo ? { tempo: parsed.tempo } : {}),
      ...(parsed.buses ? { buses: parsed.buses } : {}),
      ...(parsed.master ? { master: parsed.master } : {}),
      ...(parsed.lengthBars !== undefined ? { lengthBars: parsed.lengthBars } : {}),
    });
    loadProject(replaced, { filePath: null, dirty: true });
    return { ok: true, warnings: parsed.warnings.map((w) => w.message) };
  };

  const openProjectFromText: ProjectStoreState["openProjectFromText"] = (text, path = null) => {
    const parsed = parseProjectFile(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    loadProject(parsed.project, { filePath: path, dirty: false });
    return { ok: true, warnings: parsed.warnings };
  };

  const flushAutosave = async () => {
    if (autosaveTimer === undefined) return;
    clearAutosave();
    if (get().dirty) await write("auto");
  };

  set({
    dispatch(action) {
      const current = get().project;
      const next = projectReducer(current, action);
      if (next === current) return;
      if (action.type === "ui/select") commit(next, { undoable: false, dirtying: false });
      else if (action.type === "ui/setZoom") commit(next, { undoable: false, dirtying: true });
      else commit(next, { undoable: true, dirtying: true });
      emit(action, get().project);
    },
    undo() {
      const step = undoStep(history, { project: get().project, rev });
      if (!step) return;
      history = step.history;
      restore(step.entry);
    },
    redo() {
      const step = redoStep(history, { project: get().project, rev });
      if (!step) return;
      history = step.history;
      restore(step.entry);
    },
    beginGesture() {
      if (gestureDepth === 0) gestureRecorded = false;
      gestureDepth += 1;
    },
    endGesture() {
      gestureDepth = Math.max(0, gestureDepth - 1);
      if (gestureDepth === 0) gestureRecorded = false;
    },
    newProject(starterId, options = {}) {
      const at = iso();
      const project = starterId
        ? {
            ...buildStarterProject(starterId, {
              now: at,
              ...(options.bpm !== undefined ? { bpm: options.bpm } : {}),
              ...(options.key !== undefined ? { key: options.key } : {}),
              ...(options.name !== undefined ? { name: options.name } : {}),
            }),
            id: newId("prj_"),
          }
        : createProject({
            id: newId("prj_"),
            now: at,
            ...(options.name !== undefined ? { name: options.name } : {}),
            ...(options.bpm !== undefined ? { bpm: options.bpm } : {}),
            ...(options.key !== undefined ? { key: options.key } : {}),
          });
      loadProject(project, { filePath: null, dirty: true });
      return project;
    },
    loadProject,
    async openProject(path) {
      await flushAutosave();
      try {
        if (/\.strudel$/i.test(path)) {
          const code = await native.strudelRead(path);
          return importCode(code, { name: fileStem(path) });
        }
        const text = await native.projectRead(path);
        const result = openProjectFromText(text, path);
        if (result.ok) await native.libraryMarkOpened(path).catch(() => undefined);
        return result;
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
    openProjectFromText,
    importCode,
    applyCode(code) {
      const current = get().project;
      const parsed = parseCode(code, current.lengthBars);
      if (!parsed.ok) {
        const e = parsed.error;
        return { ok: false, error: e?.message ?? "Couldn't read this code.", ...(e ? { line: e.line, column: e.column } : {}) };
      }
      get().dispatch({
        type: "code/replace",
        tracks: parsed.tracks,
        prelude: parsed.prelude,
        ...(parsed.tempo ? { tempo: parsed.tempo } : {}),
        ...(parsed.buses ? { buses: parsed.buses } : {}),
        ...(parsed.master ? { master: parsed.master } : {}),
        ...(parsed.lengthBars !== undefined ? { lengthBars: parsed.lengthBars } : {}),
      });
      return { ok: true, warnings: parsed.warnings.map((w) => w.message) };
    },
    save() {
      clearAutosave();
      return write("manual");
    },
    async saveAs(path) {
      let target = path ?? null;
      if (target === null) {
        try {
          target = await native.saveDialog({
            title: "Save groove as",
            defaultPath: `${get().project.name}.phyllo`,
            filters: [PHYLLO_FILTER],
          });
        } catch (error) {
          return { ok: false, error: errorMessage(error) };
        }
        if (target === null) return { ok: false, error: "Cancelled", cancelled: true };
      }
      if (!/\.phyllo$/i.test(target)) target = `${target}.phyllo`;
      const previous = get().filePath;
      if (previous !== null && previous !== target) {
        // A copy is a different groove: give it its own id (library entries and history are per id).
        rev = nextRev++;
        set({ project: { ...get().project, id: newId("prj_"), modified: iso() }, dirty: true });
      }
      clearAutosave();
      return write("manual", target);
    },
    async listHistory() {
      try {
        return await native.historyList(get().project.id);
      } catch {
        return [];
      }
    },
    async restoreSnapshot(snapshotId) {
      try {
        const json = await native.historyRead(get().project.id, snapshotId);
        const parsed = parseProjectFile(json);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        const restored = withCurrentUi({ ...parsed.project, id: get().project.id }, get().project);
        commit(restored, { undoable: true, dirtying: true });
        return { ok: true, warnings: parsed.warnings };
      } catch (error) {
        return { ok: false, error: errorMessage(error) };
      }
    },
  });

  return {
    store,
    onAction(callback) {
      actionListeners.add(callback);
      return () => actionListeners.delete(callback);
    },
    flushAutosave,
    autosaveSettingChanged: scheduleAutosave,
    dispose() {
      clearAutosave();
      actionListeners.clear();
    },
  };
}
