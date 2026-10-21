import { Button } from "@phyllo/ui";
import { SettingsLayout } from "../organisms/SettingsLayout";
import type { SettingsSectionId } from "../organisms/SettingsLayout";
import styles from "./screens.module.css";

export interface SettingsScreenProps {
  /** "Open version history…" (System): leaves Settings and shows the dialog. */
  onOpenHistory(): void;
  /** Shown as "Done": returns to the Arrange view. */
  onDone?: () => void;
  /** Section shown first. The app's Settings button and ⌘, open on Appearance (mockup 07); General stays one scroll above. */
  initialSection?: SettingsSectionId;
}

/**
 * Settings (`07`): a screen of the main window (`#/settings`). The minimal title bar is a drag strip that keeps the
 * layout clear of the macOS traffic lights (overlay title bar); the SettingsLayout carries the "Settings" title.
 */
export function SettingsScreen({ onOpenHistory, onDone, initialSection = "appearance" }: SettingsScreenProps) {
  return (
    <div className={[styles["page"], styles["settingsPage"]].join(" ")}>
      <header className={styles["settingsHeader"]} data-tauri-drag-region="">
        {onDone ? (
          <Button size="sm" onClick={onDone}>
            Done
          </Button>
        ) : null}
      </header>
      <SettingsLayout onOpenHistory={onOpenHistory} initialSection={initialSection} />
    </div>
  );
}
