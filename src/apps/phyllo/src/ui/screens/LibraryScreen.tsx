import { Button } from "@phyllo/ui";
import { useRef, useState } from "react";
import { useAppStores } from "../../state/context";
import { AppHeader } from "../organisms/AppHeader";
import { GrooveBrowser } from "../organisms/GrooveBrowser";
import { runImport } from "../shell/actions";
import { useShell } from "../shell/shellContext";
import { ScreenTabs } from "./ScreenTabs";
import styles from "./screens.module.css";

/** Groove library (`08`–`08d`): compact header (Library tab first, Import…, New groove) over the GrooveBrowser. */
export function LibraryScreen() {
  const shell = useShell();
  const stores = useAppStores();
  const [importing, setImporting] = useState(false);
  const inFlight = useRef(false);

  const startImport = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setImporting(true);
    try {
      await runImport(stores, shell);
    } finally {
      inFlight.current = false;
      setImporting(false);
    }
  };
  const newGroove = () => shell.guardUnsaved(() => shell.navigate({ screen: "start" }));

  return (
    <div className={styles["screen"]}>
      <AppHeader
        className={styles["chrome"]}
        variant="compact"
        hideProjectName={!shell.projectOpen}
        viewTabs={shell.projectOpen ? <ScreenTabs current="library" withLibrary /> : <h1 className={styles["libraryTitle"]}>Library</h1>}
        actions={
          <div className={styles["headerActions"]}>
            <Button loading={importing} onClick={() => void startImport()}>
              Import…
            </Button>
            <Button variant="primary" iconStart="plus" onClick={newGroove}>
              New groove
            </Button>
          </div>
        }
      />
      <main className={styles["library"]} aria-label="Groove library">
        {shell.projectOpen ? <h1 className={styles["visuallyHidden"]}>Library</h1> : null}
        <GrooveBrowser
          onOpenGroove={() => shell.navigate({ screen: "arrange" })}
          onNewGroove={newGroove}
          onImport={() => void startImport()}
          onBulkExport={() => shell.openExport()}
        />
      </main>
    </div>
  );
}
