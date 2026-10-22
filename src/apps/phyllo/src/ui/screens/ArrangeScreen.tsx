import { useEffect, useEffectEvent } from "react";
import type { CSSProperties } from "react";
import { useSelection, useUiMode } from "../../hooks";
import { AppHeader } from "../organisms/AppHeader";
import { CodeDrawer } from "../organisms/CodeDrawer";
import { Inspector } from "../organisms/Inspector";
import { LibraryPanel } from "../organisms/LibraryPanel";
import { StatusBar } from "../organisms/StatusBar";
import { Timeline } from "../organisms/Timeline";
import { TipCoach } from "../organisms/TipCoach";
import { ViewToolbar } from "../organisms/ViewToolbar";
import { useLibraryPanelRef, useShell } from "../shell/shellContext";
import { ScreenTabs } from "./ScreenTabs";
import styles from "./screens.module.css";
import { ARRANGE_PANEL_EVENT, useResizableWidth } from "./useResizableWidth";
import type { ArrangePanelRequest } from "./useResizableWidth";

/**
 * Arrange (`01`, `02`): header, [library 248 | toolbar + timeline + tips + code drawer | inspector 320], status bar.
 * Fixed to the window height; library, timeline and inspector scroll independently, the drawer stays pinned.
 * The library and inspector widths are draggable and both can be collapsed (separators between the columns).
 */
type PanelSize = ReturnType<typeof useResizableWidth>;

/** Column separator: drag grip plus a fold tab. Collapsed, it becomes a slim rail holding just the tab. */
function Splitter({ size, label, side }: { size: PanelSize; label: string; side: "left" | "right" }) {
  const open = !size.collapsed;
  const chevron = (side === "left") === open ? "‹" : "›";
  return (
    <div className={open ? styles["splitter"] : `${styles["splitter"]} ${styles["rail"]}`}>
      {open ? <div className={styles["grip"]} aria-label={`Resize ${label}`} {...size.handleProps} /> : null}
      <button
        type="button"
        className={`${styles["fold"]} ${styles[side === "left" ? "foldLeft" : "foldRight"]}`}
        aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
        aria-expanded={open}
        title={`${open ? "Collapse" : "Expand"} ${label}`}
        onClick={size.toggleCollapsed}
      >
        {chevron}
      </button>
    </div>
  );
}

export function ArrangeScreen() {
  const shell = useShell();
  const { mode } = useUiMode();
  const { select } = useSelection();
  const libraryPanelRef = useLibraryPanelRef();
  const library = useResizableWidth({ initial: 248, min: 200, max: 480, direction: 1, storageKey: "phyllo.arrange.libraryWidth" });
  const inspector = useResizableWidth({ initial: 320, min: 260, max: 560, direction: -1, storageKey: "phyllo.arrange.inspectorWidth" });

  // Shell shortcuts (⌘J, ⇧⌘J, and ⌘K opening the library) reach the panels through `setArrangePanel`.
  const onPanelRequest = useEffectEvent(({ panel, mode }: ArrangePanelRequest) => {
    const target = panel === "library" ? library : inspector;
    if (mode === "toggle" || target.collapsed) target.toggleCollapsed();
  });
  useEffect(() => {
    const listener = (event: Event) => onPanelRequest((event as CustomEvent<ArrangePanelRequest>).detail);
    window.addEventListener(ARRANGE_PANEL_EVENT, listener);
    return () => window.removeEventListener(ARRANGE_PANEL_EVENT, listener);
  }, []);

  const editPattern = (trackId: string) => {
    select(trackId);
    shell.navigate({ screen: "pattern", trackId });
  };

  return (
    <div className={styles["screen"]}>
      <AppHeader className={styles["chrome"]} variant="full" onExport={shell.openExport} onVersionHistory={shell.openHistory} />
      <main
        className={styles["body"]}
        aria-label="Arrange"
        style={
          {
            "--arrange-library-w": library.collapsed ? "0px" : `${library.width}px`,
            "--arrange-inspector-w": inspector.collapsed ? "0px" : `${inspector.width}px`,
          } as CSSProperties
        }
      >
        <h1 className={styles["visuallyHidden"]}>Arrange</h1>
        {/* The library panel's headings are level 3; this keeps the outline h1 → h2 → h3 without gaps. */}
        <h2 className={styles["visuallyHidden"]}>Sound library</h2>
        <LibraryPanel
          ref={libraryPanelRef}
          className={library.collapsed ? `${styles["libraryCol"]} ${styles["collapsed"]}` : styles["libraryCol"]}
        />
        <Splitter size={library} label="sound library" side="left" />
        <div className={styles["center"]}>
          <ViewToolbar
            className={styles["chrome"]}
            tabs={<ScreenTabs current="arrange" />}
            tool={shell.tool}
            onToolChange={shell.setTool}
            snap={shell.snap}
            onSnapChange={shell.setSnap}
          />
          <Timeline tool={mode === "pro" ? shell.tool : "select"} snap={shell.snap} onEditPattern={editPattern} />
          {mode === "guided" ? <TipCoach className={styles["chrome"]} /> : null}
          <CodeDrawer className={styles["chrome"]} />
        </div>
        <Splitter size={inspector} label="inspector" side="right" />
        <Inspector
          onEditPattern={editPattern}
          className={inspector.collapsed ? `${styles["inspectorCol"]} ${styles["collapsed"]}` : styles["inspectorCol"]}
        />
      </main>
      <StatusBar className={styles["chrome"]} />
    </div>
  );
}
