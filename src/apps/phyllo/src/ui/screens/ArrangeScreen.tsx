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

/**
 * Arrange (`01`, `02`): header, [library 248 | toolbar + timeline + tips + code drawer | inspector 320], status bar.
 * Fixed to the window height; library, timeline and inspector scroll independently, the drawer stays pinned.
 */
export function ArrangeScreen() {
  const shell = useShell();
  const { mode } = useUiMode();
  const { select } = useSelection();
  const libraryPanelRef = useLibraryPanelRef();

  const editPattern = (trackId: string) => {
    select(trackId);
    shell.navigate({ screen: "pattern", trackId });
  };

  return (
    <div className={styles["screen"]}>
      <AppHeader className={styles["chrome"]} variant="full" onExport={shell.openExport} onVersionHistory={shell.openHistory} />
      <main className={styles["body"]} aria-label="Arrange">
        <h1 className={styles["visuallyHidden"]}>Arrange</h1>
        {/* The library panel's headings are level 3; this keeps the outline h1 → h2 → h3 without gaps. */}
        <h2 className={styles["visuallyHidden"]}>Sound library</h2>
        <LibraryPanel ref={libraryPanelRef} />
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
        <Inspector onEditPattern={editPattern} />
      </main>
      <StatusBar className={styles["chrome"]} />
    </div>
  );
}
