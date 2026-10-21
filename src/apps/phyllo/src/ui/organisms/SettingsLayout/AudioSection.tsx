import { Button, Select, SettingRow, Slider } from "@phyllo/ui";
import type { SelectOption } from "@phyllo/ui";
import { useId } from "react";
import { useSettings } from "../../../hooks";
import { OfflineSounds } from "./OfflineSounds";
import { SettingsSection } from "./SettingsSection";
import { useOutputDevices } from "./useOutputDevices";
import styles from "./settings.module.css";

export const LOOKAHEAD_MIN_MS = 20;
export const LOOKAHEAD_MAX_MS = 500;
export const LOOKAHEAD_DEFAULT_MS = 100;
const LOOKAHEAD_STEP_MS = 10;

const SYSTEM_DEFAULT = "";

type SampleRateChoice = "match" | "44100" | "48000";

const SAMPLE_RATE_OPTIONS: SelectOption<SampleRateChoice>[] = [
  { value: "match", label: "Match device" },
  { value: "44100", label: "44.1 kHz" },
  { value: "48000", label: "48 kHz" },
];

interface AudioSectionProps {
  /** Replaces the engine's list of built-in sound URLs (stories, tests). */
  listSoundUrls?: () => Promise<string[]>;
}

/** Output device, sample rate, scheduling look-ahead and the offline sound cache. */
export function AudioSection({ listSoundUrls }: AudioSectionProps) {
  const { settings, set } = useSettings();
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
          help="Matches the device. Exports can resample."
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
            <div className={styles["controlRow"]}>
              <Slider
                value={lookahead}
                onChange={(next) => set("audio", { lookaheadMs: next })}
                min={LOOKAHEAD_MIN_MS}
                max={LOOKAHEAD_MAX_MS}
                step={LOOKAHEAD_STEP_MS}
                label="Scheduling look-ahead"
                aria-labelledby={lookaheadId}
                valueText={(value) => `${value} milliseconds`}
                width={200}
              />
              <span className={styles["readout"]} aria-hidden="true">
                {lookahead} ms
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={lookahead === LOOKAHEAD_DEFAULT_MS}
                onClick={() => set("audio", { lookaheadMs: LOOKAHEAD_DEFAULT_MS })}
              >
                Reset
              </Button>
            </div>
          }
        />
      </div>
      <OfflineSounds listSoundUrls={listSoundUrls} />
    </SettingsSection>
  );
}
