import { Button, SettingRow } from "@phyllo/ui";
import { useId } from "react";
import { formatBytes } from "./formatBytes";
import { useSoundCache } from "./useSoundCache";
import type { OfflineDownload } from "./useSoundCache";
import styles from "./settings.module.css";

interface OfflineSoundsProps {
  listSoundUrls?: (() => Promise<string[]>) | undefined;
}

function cacheLine(files: number, bytes: number): string {
  if (files === 0) return "Nothing downloaded yet.";
  return `${files.toLocaleString("en-US")} ${files === 1 ? "file" : "files"} · ${formatBytes(bytes)} on disk.`;
}

function progressText(download: OfflineDownload): string | null {
  switch (download.phase) {
    case "listing":
      return "Finding sounds…";
    case "downloading": {
      const { done, total, failed } = download.progress;
      return `Downloading ${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}${failed > 0 ? ` · ${failed} failed` : ""}`;
    }
    case "done": {
      const { total, failed } = download.progress;
      return failed > 0
        ? `Done. ${failed.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} couldn’t be downloaded; try again later.`
        : `Done. ${total.toLocaleString("en-US")} files are ready offline.`;
    }
    case "idle":
    case "error":
      return null;
    default: {
      const unreachable: never = download;
      return unreachable;
    }
  }
}

/** "Download built-in sounds for offline use": progress while it runs, cache size, Clear cache. */
export function OfflineSounds({ listSoundUrls }: OfflineSoundsProps) {
  const { status, download, start, clear } = useSoundCache(listSoundUrls);
  const titleId = useId();
  const running = download.phase === "listing" || download.phase === "downloading";
  const text = progressText(download);
  const progress = download.phase === "downloading" ? download.progress : null;

  return (
    <div className={styles["group"]}>
      <SettingRow
        id={titleId}
        title="Offline sounds"
        help={`The built-in drum machines, synths and instruments load from the internet. Download them once to keep them working offline. ${
          status ? cacheLine(status.files, status.bytes) : ""
        }`.trim()}
        divider={false}
        control={
          <div className={styles["controlRow"]}>
            <Button variant="secondary" size="sm" loading={running} onClick={() => void start()}>
              Download built-in sounds for offline use
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={running || status === null || status.files === 0}
              onClick={() => void clear()}
            >
              Clear cache
            </Button>
          </div>
        }
      />
      {download.phase === "error" ? (
        <p className={`${styles["error"]} ${styles["groupPadded"]}`} role="alert">
          {download.message}
        </p>
      ) : null}
      {text !== null ? (
        <div className={`${styles["progress"]} ${styles["groupPadded"]}`}>
          {progress !== null ? (
            <div
              className={styles["progressTrack"]}
              role="progressbar"
              aria-label="Offline sound download"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-valuetext={text}
            >
              <div
                className={styles["progressFill"]}
                style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
              />
            </div>
          ) : null}
          <span className={styles["note"]} role="status">
            {text}
          </span>
        </div>
      ) : null}
    </div>
  );
}
