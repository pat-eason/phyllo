import { Select, SettingRow } from "@phyllo/ui";
import type { SelectOption } from "@phyllo/ui";
import { useId } from "react";
import { useAppStores, useSettings } from "../../../hooks";
import { OfflineSounds } from "./OfflineSounds";
import { SettingsSection } from "./SettingsSection";
import { useOutputDevices } from "./useOutputDevices";
import styles from "./settings.module.css";

export const LOOKAHEAD_DEFAULT_MS = 100;
/** Look-ahead choices (ms), like the mockup's Select; a saved value outside the list is added to it. */
const LOOKAHEAD_CHOICES_MS = [50, 100, 150, 250] as const;

const SYSTEM_DEFAULT = "";

type SampleRateChoice = "match" | "44100" | "48000";

const SAMPLE_RATE_OPTIONS: SelectOption<SampleRateChoice>[] = [
  { value: "match", label: "Match device" },
  { value: "44100", label: "44.1 kHz" },
  { value: "48000", label: "48 kHz" },
];

function lookaheadOptions(current: number): SelectOption<string>[] {
  const values: number[] = [...LOOKAHEAD_CHOICES_MS];
  if (!values.includes(current)) values.push(current);
  return values
    .sort((a, b) => a - b)
    .map((ms) => ({ value: String(ms), label: ms === LOOKAHEAD_DEFAULT_MS ? `${ms} ms (default)` : `${ms} ms` }));
}

interface AudioSectionProps {
  /** Replaces the engine's list of built-in sound URLs (stories, tests). */
  listSoundUrls?: () => Promise<string[]>;
}

/** Output device, sample rate, scheduling look-ahead and the offline sound cache. */
export function AudioSection({ listSoundUrls }: AudioSectionProps) {
  const { settings, set } = useSettings();
  const { engineHost } = useAppStores();
  const { devices, canSwitch } = useOutputDevices();
  const deviceId = useId();
  const rateId = useId();
  const lookaheadId = useId();

  const current = settings.audio.outputDevice;
  const deviceOptions: SelectOption<string>[] = [{ value: SYSTEM_DEFAULT, label: "System default" }];
  for (const device of devices) deviceOptions.push({ value: device.id, label: device.label });
  // A saved device that isn't plugged in stays visible so the Select doesn't silently show something else.
  if (current !== null && !devices.some((device) => device.id === current)) {
    deviceOptions.push({ value: current, label: "Saved device (not connected)" });
  }

  const rate = settings.audio.sampleRate;
  const rateChoice: SampleRateChoice = rate === 44100 ? "44100" : rate === 48000 ? "48000" : "match";
  const lookahead = settings.audio.lookaheadMs;
  // The audio context is created once with its rate; a different choice only takes effect on the next launch.
  const rateAppliesAfterRestart = rate !== null && rate !== engineHost.peek()?.sampleRate;

  return (
    <SettingsSection
      id="audio"
      title="Audio"
      description="Sound runs in the system web view’s audio engine; Phyllo picks the device and keeps timing tight."
    >
      <div className={styles["group"]}>
        <SettingRow
          id={deviceId}
          title="Output device"
          help={
            canSwitch
              ? "Follows the system default unless you pick one."
              : "This web view can’t switch output devices, so sound follows the system default. Change it in your system’s sound settings."
          }
          control={
            <Select
              options={deviceOptions}
              value={current ?? SYSTEM_DEFAULT}
              onChange={(next) => set("audio", { outputDevice: next === SYSTEM_DEFAULT ? null : next })}
              label="Output device"
              aria-labelledby={deviceId}
              minWidth={220}
              disabled={!canSwitch}
            />
          }
        />
        <SettingRow
          id={rateId}
          title="Sample rate"
          help={rateAppliesAfterRestart ? "Applies after restart. Exports can resample." : "Matches the device. Exports can resample."}
          control={
            <Select
              options={SAMPLE_RATE_OPTIONS}
              value={rateChoice}
              onChange={(next) => set("audio", { sampleRate: next === "match" ? null : Number(next) })}
              label="Sample rate"
              aria-labelledby={rateId}
              minWidth={220}
            />
          }
        />
        <SettingRow
          id={lookaheadId}
          title="Scheduling look-ahead"
          help="Higher is steadier, lower feels more immediate."
          divider={false}
          control={
            <Select
              options={lookaheadOptions(lookahead)}
              value={String(lookahead)}
              onChange={(next) => set("audio", { lookaheadMs: Number(next) })}
              label="Scheduling look-ahead"
              aria-labelledby={lookaheadId}
              minWidth={220}
            />
          }
        />
      </div>
      <OfflineSounds listSoundUrls={listSoundUrls} />
    </SettingsSection>
  );
}
