import { Button, Icon, StatusDot } from "@phyllo/ui";
import { useNative, useSettings } from "../../../hooks";
import { SettingsSection } from "./SettingsSection";
import { useFolderScans } from "./useFolderScans";
import type { FolderScan } from "./useFolderScans";
import { tildify, usePhylloPaths } from "./usePaths";
import styles from "./settings.module.css";

const countText = (scan: FolderScan | undefined): string => {
  if (scan?.status !== "ready") return scan?.status === "missing" ? "" : "…";
  return `${scan.files.toLocaleString("en-US")} ${scan.files === 1 ? "file" : "files"}`;
};

/** Linked sample folders: watched, counted, revealable, unlinkable; plus the native folder picker. */
export function SampleFoldersSection() {
  const { settings, set } = useSettings();
  const native = useNative();
  const paths = usePhylloPaths();
  const folders = settings.sampleFolders;
  const scans = useFolderScans(folders);

  function commit(next: string[]) {
    set("sampleFolders", next);
    // The watcher follows the linked set (replaces it); a failure only means no live updates.
    native.sampleFoldersWatch(next).catch((error: unknown) => console.warn("[phyllo] Watching sample folders failed", error));
  }

  async function linkFolder() {
    try {
      const picked = await native.openDialog({ directory: true, title: "Link a sample folder" });
      const folder = Array.isArray(picked) ? picked[0] : picked;
      if (typeof folder === "string" && folder !== "" && !folders.includes(folder)) commit([...folders, folder]);
    } catch (error) {
      console.warn("[phyllo] Folder dialog failed", error);
    }
  }

  return (
    <SettingsSection
      id="library"
      title="Sample folders"
      description={
        <>
          Linked folders are watched — drop a file in Finder and it shows up in the library, ready as{" "}
          <span className={styles["inlineCode"]}>s(&quot;name&quot;)</span>.
        </>
      }
    >
      <div className={styles["folderList"]}>
        {folders.length === 0 ? <p className={styles["note"]}>No folders linked yet.</p> : null}
        {folders.map((folder) => {
          const scan = scans[folder];
          const missing = scan?.status === "missing";
          const display = tildify(folder, paths);
          return (
            <div key={folder} className={styles["folderRow"]} role="group" aria-label={display}>
              <Icon name="folder" size={18} />
              <span className={styles["folderPath"]}>{display}</span>
              <span className={styles["folderCount"]}>{countText(scan)}</span>
              {missing ? (
                <StatusDot status="warn" label="Not found" />
              ) : (
                <StatusDot status="ok" label="Watching" className={styles["folderStatus"]} />
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void native.revealInFinder(folder).catch((error: unknown) => console.warn("[phyllo] Show in Finder failed", error))}
              >
                Show in Finder
              </Button>
              <Button variant="ghost" size="sm" onClick={() => commit(folders.filter((existing) => existing !== folder))}>
                Unlink
              </Button>
            </div>
          );
        })}
        <Button variant="dashed" iconStart="plus" className={styles["linkButton"]} onClick={() => void linkFolder()}>
          Link a folder…
        </Button>
      </div>
    </SettingsSection>
  );
}
