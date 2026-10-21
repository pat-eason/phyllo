import { findTrack } from "@phyllo/model";
import { MENU_OPEN_RECENT } from "../../native/types";
import type { MenuActionId } from "../../native/types";
import type { AppStores } from "../../state/createAppStores";
import { codeDrawerOpen } from "../../state/settingsModel";
import { importFiles, openPath, pickFile, pickFiles, replacesOpenProject } from "./fileActions";
import { PROJECT_SCREENS } from "./router";
import type { ShellState } from "./shellContext";
import type { ShellActionId } from "./shortcuts";

export const STRUDEL_REFERENCE_URL = "https://strudel.cc/learn/";

export type RunnableAction = ShellActionId | typeof MENU_OPEN_RECENT;

export interface ActionPayload {
  /** `file.openRecent` */
  path?: string;
}

export interface ShellActionEnv {
  /** Opens a URL in the system browser. */
  openUrl(url: string): void;
}

export type RunAction = (id: RunnableAction, payload?: ActionPayload) => void;

/** Native menu ids the action table handles (`app.quit`, `window.main` are Rust-only). */
export function isRunnableMenuId(id: MenuActionId): id is RunnableAction & MenuActionId {
  return id !== "app.quit" && id !== "window.main";
}

/**
 * The one action table behind keyboard shortcuts and native menu items. Reads store state at call time, so the
 * returned function can be called from any listener.
 */
export function createShellActions(stores: AppStores, shell: ShellState, env: ShellActionEnv): RunAction {
  const { native } = stores;
  const transport = () => stores.transport.getState();
  const project = () => stores.project.getState();
  const settings = () => stores.settings.getState();
  const onProjectScreen = () => shell.route !== null && PROJECT_SCREENS.has(shell.route.screen);

  const fail = (title: string, error: string) => shell.notify({ title, detail: error, tone: "error" });

  const openAndShow = (path: string) => {
    shell.guardUnsaved(async () => {
      const error = await openPath(stores, path);
      if (error !== null) fail("Couldn't open the groove", error);
      else shell.navigate({ screen: "arrange" });
    });
  };

  const selectedTrack = () => {
    const p = project().project;
    return findTrack(p, p.ui.selectedTrack);
  };

  const table: Record<RunnableAction, (payload: ActionPayload) => void> = {
    "transport.playPause": () => void transport().togglePlay(),
    "transport.stop": () => transport().stop(),
    "transport.backToStart": () => transport().toStart(),
    "transport.loop": () => transport().toggleLoop(),
    "transport.record": () => transport().toggleRecordArm(),
    "track.mute": () => {
      const track = selectedTrack();
      if (track) project().dispatch({ type: "track/setMute", trackId: track.id, mute: !track.mute });
    },
    "track.solo": () => {
      const track = selectedTrack();
      if (track) project().dispatch({ type: "track/setSolo", trackId: track.id, solo: !track.solo });
    },
    "tool.select": () => shell.setTool("select"),
    "tool.draw": () => shell.setTool("draw"),
    "tool.split": () => shell.setTool("split"),
    "library.search": () => {
      if (!shell.projectOpen) return;
      if (shell.route?.screen !== "arrange") shell.navigate({ screen: "arrange" });
      shell.requestSearchFocus();
    },
    "edit.undo": () => project().undo(),
    "edit.redo": () => project().redo(),
    "app.settings": () => {
      native.openSettingsWindow().catch(() => shell.navigate({ screen: "settings" }));
    },
    "file.new": () => shell.guardUnsaved(() => shell.navigate({ screen: "start" })),
    "file.open": () => {
      void pickFile(stores)
        .then((path) => {
          if (path !== null) openAndShow(path);
        })
        .catch((error: unknown) => fail("Couldn't open the dialog", String(error)));
    },
    [MENU_OPEN_RECENT]: (payload) => {
      if (payload.path) openAndShow(payload.path);
    },
    "file.save": () => {
      void project()
        .save()
        .then((result) => {
          if (!result.ok) fail("Couldn't save", result.error);
        });
    },
    "file.saveAs": () => {
      void project()
        .saveAs()
        .then((result) => {
          if (!result.ok && !result.cancelled) fail("Couldn't save", result.error);
        });
    },
    "file.history": () => shell.openHistory(),
    "file.import": () => void runImport(stores, shell),
    "file.export": () => {
      // Export renders the open project; Guided start and Settings have none on screen.
      if (onProjectScreen() || shell.route?.screen === "library") shell.openExport();
    },
    "file.recent.clear": () => shell.clearRecent(),
    // With no open project these would show an empty phantom project; Library / New groove come first.
    "view.arrange": () => {
      if (shell.projectOpen) shell.navigate({ screen: "arrange" });
    },
    "view.pattern": () => {
      if (shell.projectOpen) shell.navigate({ screen: "pattern", trackId: null });
    },
    "view.mixer": () => {
      if (shell.projectOpen) shell.navigate({ screen: "mixer" });
    },
    "view.library": () => shell.navigate({ screen: "library" }),
    "view.codeDrawer": () => {
      settings().set("codeDrawer", { open: !codeDrawerOpen(settings().settings) });
    },
    "view.uiMode": () => settings().setUiMode(settings().settings.uiMode === "guided" ? "pro" : "guided"),
    "view.theme.dark": () => settings().set("appearance", { mode: "dark" }),
    "view.theme.light": () => settings().set("appearance", { mode: "light" }),
    "view.theme.system": () => settings().set("appearance", { mode: "system" }),
    "help.shortcuts": () => shell.openShortcuts(),
    "help.strudel": () => env.openUrl(STRUDEL_REFERENCE_URL),
  };

  return (id, payload = {}) => table[id](payload);
}

/** Import… : pick files, guard the open project when it will be replaced, import, then show the result. */
export async function runImport(stores: AppStores, shell: ShellState): Promise<void> {
  let paths: string[];
  try {
    paths = await pickFiles(stores);
  } catch (error) {
    shell.notify({ title: "Couldn't open the dialog", detail: String(error), tone: "error" });
    return;
  }
  if (paths.length === 0) return;
  const go = async () => {
    const { imported, errors } = await importFiles(stores, paths);
    for (const { path, error } of errors) shell.notify({ title: "Couldn't import", detail: `${path}: ${error}`, tone: "error" });
    if (imported.length === 0) return;
    if (imported.length === 1 && paths.length === 1) {
      const only = imported[0]!;
      // A copied .phyllo still has to be opened; an imported .strudel already is the open project.
      if (stores.project.getState().filePath !== only) {
        const error = await openPath(stores, only);
        if (error !== null) {
          shell.notify({ title: "Couldn't open the groove", detail: error, tone: "error" });
          return;
        }
      }
      shell.navigate({ screen: "arrange" });
      return;
    }
    shell.notify({ title: `Imported ${imported.length} ${imported.length === 1 ? "groove" : "grooves"}` });
  };
  if (replacesOpenProject(paths)) shell.guardUnsaved(go);
  else await go();
}
