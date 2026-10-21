import { Button, SegmentedControl, SettingRow, Switch } from "@phyllo/ui";
import type { SegmentedOption } from "@phyllo/ui";
import type { UiMode } from "@phyllo/model";
import { useId } from "react";
import { useNative, useSettings, useTips } from "../../../hooks";
import { SettingsSection } from "./SettingsSection";
import { usePhylloPaths } from "./usePaths";
import styles from "./settings.module.css";

const UI_MODE_OPTIONS: SegmentedOption<UiMode>[] = [
  { value: "guided", label: "Guided" },
  { value: "pro", label: "Pro" },
];

/** Default interface depth, the Guided tips, and where projects live. */
export function GeneralSection() {
  const { settings, setUiMode } = useSettings();
  const tips = useTips();
  const native = useNative();
  const projectsFolder = usePhylloPaths()?.root ?? null;
  const uiModeId = useId();
  const tipsId = useId();
  const folderId = useId();

  return (
    <SettingsSection id="general" title="General" description="How Phyllo starts, and where your projects live.">
      <div className={styles["group"]}>
        <SettingRow
          id={uiModeId}
          title="Default interface"
          help="Guided uses plain words and step tips. Pro shows Strudel names and the code drawer. It only changes what you see, never the project."
          control={
            <SegmentedControl
              options={UI_MODE_OPTIONS}
              value={settings.uiMode}
              onChange={setUiMode}
              label="Default interface"
              aria-labelledby={uiModeId}
              tone="accent"
            />
          }
        />
        <SettingRow
          id={tipsId}
          title="Show tips in Guided mode"
          help="A five-step tour that points at real controls."
          control={
            <div className={styles["controlRow"]}>
              <Button variant="secondary" size="sm" onClick={() => tips.reset()}>
                Restart tips
              </Button>
              <Switch
                checked={!settings.tips.hidden}
                onChange={(on) => tips.setEnabled(on)}
                label="Show tips in Guided mode"
                aria-labelledby={tipsId}
              />
            </div>
          }
        />
        <SettingRow
          id={folderId}
          title="Projects folder"
          help="Where .phyllo files and Exports are kept."
          divider={false}
          control={
            <div className={styles["controlRow"]}>
              <span className={styles["pathText"]} title={projectsFolder ?? undefined}>
                {projectsFolder ?? "…"}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={projectsFolder === null}
                onClick={() => {
                  if (projectsFolder !== null) void native.revealInFinder(projectsFolder).catch((error: unknown) => console.warn("[phyllo] Show in Finder failed", error));
                }}
              >
                Show in Finder
              </Button>
            </div>
          }
        />
      </div>
    </SettingsSection>
  );
}
