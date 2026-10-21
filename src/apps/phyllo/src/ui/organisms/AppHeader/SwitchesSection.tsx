import type { UiMode } from "@phyllo/model";
import { Button, IconButton, SegmentedControl, useTheme } from "@phyllo/ui";
import type { SegmentedOption } from "@phyllo/ui";
import { useSettings, useTips, useUiMode } from "../../../hooks";
import styles from "./AppHeader.module.css";
import { useOpenSettings } from "./useOpenSettings";

const MODE_OPTIONS: SegmentedOption<UiMode>[] = [
  { value: "guided", label: "Guided" },
  { value: "pro", label: "Pro" },
];

export interface SwitchesSectionProps {
  onExport?: () => void;
}

/** Guided | Pro, theme toggle, Settings and Export (right side of the full header). */
export function SwitchesSection({ onExport }: SwitchesSectionProps) {
  const { mode, setMode } = useUiMode();
  const { set } = useSettings();
  const { theme } = useTheme();
  const openSettings = useOpenSettings();
  const { highlight } = useTips();

  // On "Match system" the toggle still picks the opposite of what is showing now, and stores it explicitly.
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <div className={styles["switchesSection"]} data-tauri-drag-region="">
      <SegmentedControl
        label="Interface depth"
        tone="accent"
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
      />
      <IconButton
        icon={theme === "dark" ? "sun" : "moon"}
        label={`Switch to ${nextTheme} theme`}
        size={38}
        onClick={() => set("appearance", { mode: nextTheme })}
      />
      <IconButton icon="settings" label="Settings" size={38} onClick={openSettings} />
      <Button
        className={styles["exportButton"]}
        variant="primary"
        tone="inverse"
        iconStart="export"
        data-tip-target="header-export"
        data-tip-highlight={highlight === "header-export" ? "" : undefined}
        onClick={onExport}
      >
        Export
      </Button>
    </div>
  );
}
