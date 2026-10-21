import { Toast } from "@phyllo/ui";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useAppStores } from "../../state/context";
import type { LibraryPanelHandle } from "../organisms/LibraryPanel";
import { DEFAULT_SNAP } from "../organisms/Timeline";
import type { EditTool, Snap } from "../organisms/Timeline";
import {
  ArrangeScreen,
  GuidedStartScreen,
  LibraryScreen,
  MixerScreen,
  PatternEditorScreen,
  SettingsScreen,
} from "../screens";
import screenStyles from "../screens/screens.module.css";
import { createShellActions } from "./actions";
import type { RunAction, ShellActionEnv } from "./actions";
import styles from "./AppShell.module.css";
import { ShortcutsDialog, UnsavedChangesDialog, VersionHistoryDialog } from "./dialogs";
import type { UnsavedChoice } from "./dialogs";
import { ExportSlot } from "./ExportSlot";
import { NativeBridge } from "./nativeBridge";
import { navigate, useHashRoute } from "./router";
import type { Route } from "./router";
import { LibraryPanelRefContext, ShellContext } from "./shellContext";
import type { ShellState, ShellToast } from "./shellContext";
import { detectMac } from "./shortcuts";
import { useStartup } from "./startup";
import { useGlobalShortcuts } from "./useGlobalShortcuts";

const SEARCH_FOCUS_FRAMES = 12;
const RECENT_CLEARED_KEY = "phyllo.recentClearedAt";

function readClearedAt(): number {
  try {
    return Number(globalThis.localStorage?.getItem(RECENT_CLEARED_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeClearedAt(at: number) {
  try {
    globalThis.localStorage?.setItem(RECENT_CLEARED_KEY, String(at));
  } catch {
    /* menu still clears for this session */
  }
}

function defaultOpenUrl(url: string) {
  window.open(url, "_blank", "noopener");
}

interface ToastEntry extends ShellToast {
  id: number;
}

type Dialog =
  | { kind: "none" }
  | { kind: "history" }
  | { kind: "shortcuts" }
  | { kind: "unsaved"; proceed: () => void | Promise<void>; saving: boolean };

export interface AppShellProps {
  /** Opens external links (Help › Strudel Reference). Default `window.open`. */
  openUrl?: (url: string) => void;
  /** ⌘ vs Ctrl. Default: detected from the platform. */
  isMac?: boolean;
}

/**
 * The main window: startup flow, hash router, screens, app-level dialogs and toasts, the global shortcut layer and
 * the native menu/media/open-file glue. Must render under `<PhylloProvider>` (and the theme).
 */
export function AppShell({ openUrl = defaultOpenUrl, isMac = detectMac() }: AppShellProps) {
  const stores = useAppStores();
  const hashRoute = useHashRoute();
  const [initialRoute] = useState<Route | null>(() => hashRoute);
  const [tool, setTool] = useState<EditTool>("select");
  const [snap, setSnap] = useState<Snap>(DEFAULT_SNAP);
  const [exportOpen, setExportOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [recentClearedAt, setRecentClearedAt] = useState(readClearedAt);
  const nextToast = useRef(1);
  const libraryPanelRef = useRef<LibraryPanelHandle | null>(null);
  const uiMode = useStore(stores.settings, (s) => s.settings.uiMode);
  const autosaveOn = useStore(stores.settings, (s) => s.settings.system.autosave);
  const projectName = useStore(stores.project, (s) => s.project.name);

  const notify = (toast: ShellToast) => {
    const id = nextToast.current++;
    setToasts((list) => [...list, { ...toast, id }]);
  };

  const shell: ShellState = {
    route: hashRoute,
    navigate,
    tool,
    setTool,
    snap,
    setSnap,
    exportOpen,
    openExport: () => setExportOpen(true),
    closeExport: () => setExportOpen(false),
    openHistory: () => setDialog({ kind: "history" }),
    openShortcuts: () => setDialog({ kind: "shortcuts" }),
    requestSearchFocus: () => {
      let frames = 0;
      const tick = () => {
        const panel = libraryPanelRef.current;
        if (panel) panel.focusSearch();
        else if (frames++ < SEARCH_FOCUS_FRAMES) requestAnimationFrame(tick);
      };
      tick();
    },
    guardUnsaved: (proceed) => {
      const { dirty } = stores.project.getState();
      if (!dirty) {
        void proceed();
        return;
      }
      if (stores.settings.getState().settings.system.autosave) {
        // Autosave is on: write the pending change now instead of asking (nothing can be lost).
        void stores.flush().then(() => proceed());
        return;
      }
      setDialog({ kind: "unsaved", proceed, saving: false });
    },
    notify,
    recentClearedAt,
    clearRecent: () => {
      const at = Date.now();
      writeClearedAt(at);
      setRecentClearedAt(at);
    },
  };

  // Listeners and menu events call the latest shell state through a stable `run`.
  const latest = useRef({ shell, openUrl });
  useLayoutEffect(() => {
    latest.current = { shell, openUrl };
  });
  const run = useCallback<RunAction>(
    (id, payload) => {
      const env: ShellActionEnv = { openUrl: latest.current.openUrl };
      createShellActions(stores, latest.current.shell, env)(id, payload);
    },
    [stores],
  );

  const ready = useStartup({
    stores,
    initialRoute,
    onOpenFiles: (paths) => {
      const first = paths[0];
      if (first !== undefined) run("file.openRecent", { path: first });
    },
    onError: (title, detail) => notify({ title, detail, tone: "error" }),
  });

  useGlobalShortcuts(run, { screen: ready ? (hashRoute?.screen ?? null) : null, uiMode, nativeMenu: stores.native.kind === "tauri", isMac });

  const chooseUnsaved = async (choice: UnsavedChoice) => {
    if (dialog.kind !== "unsaved") return;
    const { proceed } = dialog;
    if (choice === "cancel") {
      setDialog({ kind: "none" });
      return;
    }
    if (choice === "discard") {
      setDialog({ kind: "none" });
      await proceed();
      return;
    }
    setDialog({ kind: "unsaved", proceed, saving: true });
    const result = await stores.project.getState().save();
    if (!result.ok) {
      setDialog({ kind: "unsaved", proceed, saving: false });
      notify({ title: "Couldn't save", detail: result.error, tone: "error" });
      return;
    }
    setDialog({ kind: "none" });
    await proceed();
  };

  return (
    <ShellContext.Provider value={shell}>
      <LibraryPanelRefContext.Provider value={libraryPanelRef}>
        {ready ? <Screen route={hashRoute} onOpenHistory={shell.openHistory} /> : <div className={screenStyles["boot"]} aria-busy="true" />}
        <ExportSlot open={exportOpen} onClose={shell.closeExport} />
        {dialog.kind === "history" ? (
          <VersionHistoryDialog
            historyOff={!autosaveOn}
            onClose={() => setDialog({ kind: "none" })}
            onRestored={() => notify({ title: "Version restored", detail: `Undo with ${isMac ? "⌘Z" : "Ctrl+Z"} to go back.` })}
          />
        ) : null}
        {dialog.kind === "shortcuts" ? <ShortcutsDialog onClose={() => setDialog({ kind: "none" })} /> : null}
        {dialog.kind === "unsaved" ? (
          <UnsavedChangesDialog projectName={projectName} saving={dialog.saving} onChoose={(choice) => void chooseUnsaved(choice)} />
        ) : null}
        {toasts.length > 0 ? (
          <div className={styles["toasts"]}>
            {toasts.map((toast) => (
              <Toast
                key={toast.id}
                title={toast.title}
                detail={toast.detail}
                tone={toast.tone ?? "neutral"}
                duration={toast.tone === "error" ? 0 : 6000}
                onDismiss={() => setToasts((list) => list.filter((entry) => entry.id !== toast.id))}
              />
            ))}
          </div>
        ) : null}
        <NativeBridge stores={stores} run={run} onOpenHistory={shell.openHistory} recentClearedAt={recentClearedAt} />
      </LibraryPanelRefContext.Provider>
    </ShellContext.Provider>
  );
}

interface ScreenProps {
  route: Route | null;
  onOpenHistory(): void;
}

function Screen({ route, onOpenHistory }: ScreenProps) {
  switch (route?.screen) {
    case "start":
      return <GuidedStartScreen />;
    case "library":
      return <LibraryScreen />;
    case "pattern":
      return <PatternEditorScreen trackId={route.trackId} />;
    case "mixer":
      return <MixerScreen />;
    case "settings":
      return (
        <SettingsScreen
          onDone={() => navigate({ screen: "arrange" })}
          onOpenHistory={() => {
            navigate({ screen: "arrange" });
            onOpenHistory();
          }}
        />
      );
    case "arrange":
    case undefined:
      return <ArrangeScreen />;
    default:
      return <ArrangeScreen />;
  }
}
