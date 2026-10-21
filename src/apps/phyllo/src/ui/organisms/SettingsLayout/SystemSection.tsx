import { Button, SettingRow, Switch } from "@phyllo/ui";
import type { Settings } from "@phyllo/model";
import { useId } from "react";
import { useSettings } from "../../../hooks";
import { SettingsSection } from "./SettingsSection";
import styles from "./settings.module.css";

type SystemKey = keyof Settings["system"];

interface SystemSwitch {
  key: SystemKey;
  title: string;
  help: string;
}

const SYSTEM_SWITCHES: readonly SystemSwitch[] = [
  {
    key: "mediaKeys",
    title: "Media keys control playback",
    help: "Play/pause and skip work even when Phyllo is in the background.",
  },
  {
    key: "menuBar",
    title: "Keep playing from the menu bar",
    help: "Closing the window leaves a small transport in the menu bar.",
  },
  {
    key: "fileAssociations",
    title: "Open .phyllo and .strudel files with Phyllo",
    // D95: the OS association itself is fixed when Phyllo is installed.
    help: "Double-click a file in Finder to open it here. Your system sets the association when Phyllo is installed; this switch decides whether Phyllo opens the files it is handed.",
  },
  {
    key: "autosave",
    title: "Autosave and version history",
    help: "Saves every change; restore earlier versions from File › History.",
  },
];

interface SystemRowProps {
  item: SystemSwitch;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SystemRow({ item, checked, onChange }: SystemRowProps) {
  const id = useId();
  return (
    <SettingRow
      id={id}
      title={item.title}
      help={item.help}
      control={<Switch checked={checked} onChange={onChange} label={item.title} aria-labelledby={id} />}
    />
  );
}

interface SystemSectionProps {
  /** Opens the version history of the current project (the Settings window asks the main window). */
  onOpenHistory?: (() => void) | undefined;
}

/** Media keys, menu-bar transport, file opening, autosave. */
export function SystemSection({ onOpenHistory }: SystemSectionProps) {
  const { settings, set } = useSettings();
  const historyId = useId();

  return (
    <SettingsSection id="system" title="System">
      <div className={styles["group"]}>
        {SYSTEM_SWITCHES.map((item) => (
          <SystemRow
            key={item.key}
            item={item}
            checked={settings.system[item.key]}
            onChange={(checked) => set("system", { [item.key]: checked })}
          />
        ))}
        <SettingRow
          id={historyId}
          title="Version history"
          help="Browse and restore earlier versions of the open project."
          divider={false}
          control={
            <Button variant="secondary" size="sm" disabled={onOpenHistory === undefined} onClick={() => onOpenHistory?.()}>
              Open version history…
            </Button>
          }
        />
      </div>
    </SettingsSection>
  );
}
