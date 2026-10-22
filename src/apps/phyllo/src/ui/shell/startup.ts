import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { AppStores } from "../../state/createAppStores";
import { isOpenable, openPath } from "./fileActions";
import { PROJECT_SCREENS, navigate } from "./router";
import type { Route } from "./router";

/** localStorage key holding the path of the project open when the app last ran. */
export const LAST_PROJECT_KEY = "phyllo.lastProject";

type KeyValueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readLastProject(storage: KeyValueStorage | null = defaultStorage()): string | null {
  try {
    return storage?.getItem(LAST_PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeLastProject(path: string | null, storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    if (path === null) storage?.removeItem(LAST_PROJECT_KEY);
    else storage?.setItem(LAST_PROJECT_KEY, path);
  } catch {
    /* private mode / quota: the next launch just opens the Library */
  }
}

export interface StartInput {
  /** Route in the URL at launch (a reload keeps its screen), or null. */
  explicit: Route | null;
  libraryCount: number;
  /** Settings › System › Reopen the last groove on launch. */
  reopenLast: boolean;
  /** Project open last session (localStorage). */
  lastProject: string | null;
}

export interface StartPlan {
  route: Route;
  /** Reopen this project first; on failure fall back to `fallback`. */
  reopen: string | null;
  fallback: Route;
}

/**
 * Launch lands on the Library, or Guided start when the library is empty. Only when Settings › System › "Reopen the
 * last groove" is on does the project from last session reopen first → Arrange (or the project screen in the URL),
 * falling back to the Library. A non-project route in the URL (Library, Settings, Guided start) is kept, and the
 * last project still reopens behind it.
 */
export function planStart({ explicit, libraryCount, reopenLast, lastProject }: StartInput): StartPlan {
  const home: Route = libraryCount === 0 ? { screen: "start" } : { screen: "library" };
  const keepExplicit = explicit !== null && !PROJECT_SCREENS.has(explicit.screen);
  const reopen = reopenLast ? lastProject : null;
  if (keepExplicit) return { route: explicit, reopen, fallback: explicit };
  if (reopen !== null) return { route: explicit ?? { screen: "arrange" }, reopen, fallback: home };
  return { route: home, reopen: null, fallback: home };
}

export interface StartupOptions {
  stores: AppStores;
  /** Route parsed from the URL at launch. */
  initialRoute: Route | null;
  /** Files the OS asked us to open (cold start or while running), already filtered by the D95 setting. */
  onOpenFiles(paths: string[]): void;
  onError(title: string, detail: string): void;
}

export interface StartupState {
  /** A screen has been chosen. */
  ready: boolean;
  /**
   * False while the store only holds the empty placeholder project: startup landed on the Library or Guided start
   * without loading anything (first launch, nothing open last session, or the reopen failed). Becomes true as soon as
   * a project is opened, created or imported. Screens hide the project name and Arrange/Pattern/Mixer while false.
   */
  projectOpen: boolean;
}

interface StartResult {
  route: Route;
  projectOpen: boolean;
}

/**
 * Runs the startup flow once (StrictMode-safe), listens for OS open-file events for the app's lifetime and remembers
 * the open project's path for the next launch. Resolves `ready` once a screen is chosen.
 */
export function useStartup({ stores, initialRoute, onOpenFiles, onError }: StartupOptions): StartupState {
  const [ready, setReady] = useState(false);
  const [projectOpen, setProjectOpen] = useState(true);
  const started = useRef<Promise<StartResult> | null>(null);
  const handleOpenFiles = useEffectEvent((paths: string[]) => onOpenFiles(paths));
  const reportError = useEffectEvent((title: string, detail: string) => onError(title, detail));

  useEffect(() => {
    let live = true;
    started.current ??= runStartup(stores, initialRoute, (paths) => handleOpenFiles(paths), (t, d) => reportError(t, d));
    void started.current.then(({ route, projectOpen: loaded }) => {
      if (!live) return;
      setProjectOpen(loaded);
      navigate(route, { replace: true });
      setReady(true);
    });
    return () => {
      live = false;
    };
    // The flow runs once per app; the initial route is only read at launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  useEffect(
    () =>
      stores.project.subscribe((state, prev) => {
        if (state.filePath !== null && state.filePath !== prev.filePath) writeLastProject(state.filePath);
        // Anything that replaces the project (open, new, import, starter) makes it a real, open project.
        if (state.project.id !== prev.project.id || state.filePath !== prev.filePath) setProjectOpen(true);
      }),
    [stores],
  );

  return { ready, projectOpen };
}

/** Accepted OS open requests: openable extensions, and only while Settings › System allows it (D95). */
export function acceptedOpenFiles(stores: AppStores, paths: readonly string[]): string[] {
  if (!stores.settings.getState().settings.system.fileAssociations) return [];
  return paths.filter(isOpenable);
}

async function runStartup(
  stores: AppStores,
  explicit: Route | null,
  onOpenFiles: (paths: string[]) => void,
  onError: (title: string, detail: string) => void,
): Promise<StartResult> {
  const { native } = stores;
  await stores.start().catch((error: unknown) => onError("Couldn't load settings", String(error)));

  // Listen first, then take what arrived before JS was listening (NativeApi contract).
  await native
    .onOpenFiles((event) => {
      const paths = acceptedOpenFiles(stores, event.paths);
      if (paths.length > 0) onOpenFiles(paths);
    })
    .catch(() => undefined);
  const pending = acceptedOpenFiles(stores, await native.takePendingOpenFiles().catch(() => []));
  const first = pending[0];
  if (first !== undefined) {
    const error = await openPath(stores, first);
    if (error === null) return { route: { screen: "arrange" }, projectOpen: true };
    onError("Couldn't open the file", error);
  }

  const plan = planStart({
    explicit,
    libraryCount: stores.library.getState().grooves.length,
    reopenLast: stores.settings.getState().settings.system.reopenLastProject,
    lastProject: readLastProject(),
  });
  if (plan.reopen !== null) {
    const error = await openPath(stores, plan.reopen);
    if (error !== null) {
      writeLastProject(null);
      return { route: plan.fallback, projectOpen: false };
    }
    return { route: plan.route, projectOpen: true };
  }
  return { route: plan.route, projectOpen: false };
}
