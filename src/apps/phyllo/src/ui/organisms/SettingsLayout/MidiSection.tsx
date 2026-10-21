import { PRO_KNOBS } from "@phyllo/model";
import type { Settings } from "@phyllo/model";
import { Button, SettingRow, Switch } from "@phyllo/ui";
import { useId } from "react";
import { useSettings } from "../../../hooks";
import type { MidiPortInfo } from "../../../native/types";
import { DraftField } from "./DraftField";
import { SettingsSection } from "./SettingsSection";
import { useMidiPorts } from "./useMidiPorts";
import styles from "./settings.module.css";

/** First CC of the quick map: eight knobs on CC 13–20 (the Launch Control XL top row). */
const FIRST_MAPPED_CC = 13;
const MAPPED_KNOB_COUNT = 8;

/** Port numbers outside 1–65535 are refused (the settings model would clamp them silently). */
const parsePort = (text: string): number | null => {
  const port = Number(text.trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
};

const VIRTUAL_PORT = /\b(iac|virtual|loopback)\b/i;

function portKind(port: MidiPortInfo): string {
  return VIRTUAL_PORT.test(port.name) ? "Virtual MIDI port" : "MIDI port";
}

type CcMap = Settings["midi"]["ccMap"];

function quickCcMap(): CcMap {
  const map: CcMap = {};
  PRO_KNOBS.slice(0, MAPPED_KNOB_COUNT).forEach((param, index) => {
    const cc = FIRST_MAPPED_CC + index;
    map[String(cc)] = { trackParam: param, cc };
  });
  return map;
}

const ccEntries = (map: CcMap) => Object.values(map).sort((a, b) => a.cc - b.cc);

interface PortRowProps {
  port: MidiPortInfo;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

function PortRow({ port, enabled, onToggle }: PortRowProps) {
  const incoming = port.direction === "in";
  return (
    <tr>
      <td>
        <span className={styles["cellStack"]}>
          <span className={styles["cellName"]}>{port.name}</span>
          <span className={styles["cellSub"]}>{portKind(port)}</span>
        </span>
      </td>
      <td className={styles["cellMuted"]}>{incoming ? "In" : "Out"}</td>
      <td>
        <span className={styles["cellStack"]}>
          <span>{incoming ? "Play the selected track" : "Send patterns to other apps"}</span>
          <span className={styles["cellCode"]}>
            {incoming ? "notes → note() on the selected track" : `.midi("${port.name}")`}
          </span>
        </span>
      </td>
      <td>
        <Switch checked={enabled} onChange={onToggle} label={`Enable ${port.name} (${incoming ? "in" : "out"})`} />
      </td>
    </tr>
  );
}

/** MIDI device table, CC mapping and SuperDirt OSC. */
export function MidiSection() {
  const { settings, set } = useSettings();
  const { ports, loaded, rescanning, rescan } = useMidiPorts();
  const ccId = useId();
  const oscAddressId = useId();
  const { enabledPorts, ccMap } = settings.midi;
  const { osc } = settings;
  const mapped = ccEntries(ccMap);

  function togglePort(id: string, enabled: boolean) {
    const rest = enabledPorts.filter((existing) => existing !== id);
    set("midi", { enabledPorts: enabled ? [...rest, id] : rest });
  }

  return (
    <SettingsSection
      id="midi"
      title="MIDI & OSC"
      description="Devices are read natively, so they work even where the web view has no Web MIDI."
      action={
        <Button variant="secondary" size="sm" loading={rescanning} onClick={() => void rescan()}>
          Rescan devices
        </Button>
      }
    >
      <div className={styles["tableWrap"]}>
        <table className={styles["table"]}>
          <thead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Direction</th>
              <th scope="col">Used for</th>
              <th scope="col">On</th>
            </tr>
          </thead>
          <tbody>
            {ports.length === 0 && loaded ? (
              <tr>
                <td colSpan={4} className={styles["emptyCell"]}>
                  No MIDI devices found. Plug one in and it appears here.
                </td>
              </tr>
            ) : null}
            {ports.map((port) => (
              <PortRow
                key={port.id}
                port={port}
                enabled={enabledPorts.includes(port.id)}
                onToggle={(enabled) => togglePort(port.id, enabled)}
              />
            ))}
            <tr>
              <td>
                <span className={styles["cellStack"]}>
                  <span className={styles["cellName"]}>SuperDirt</span>
                  <span className={styles["cellSub"]}>
                    OSC · {osc.host}:{osc.port}
                  </span>
                </span>
              </td>
              <td className={styles["cellMuted"]}>Out</td>
              <td>
                <span className={styles["cellStack"]}>
                  <span>Play through SuperCollider</span>
                  <span className={styles["cellCode"]}>.osc()</span>
                </span>
              </td>
              <td>
                <Switch checked={osc.enabled} onChange={(enabled) => set("osc", { enabled })} label="Enable SuperDirt OSC" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={styles["group"]}>
        <SettingRow
          id={ccId}
          title="CC mapping"
          help={
            mapped.length > 0
              ? "A controller’s knobs drive the inspector’s knobs on the selected track."
              : "Map a controller’s knobs to the inspector’s knobs on the selected track."
          }
          divider={mapped.length > 0}
          control={
            <div className={styles["controlRow"]}>
              <Button variant="secondary" size="sm" onClick={() => set("midi", { ccMap: quickCcMap() })}>
                Map 8 knobs to the inspector (CC 13–20)
              </Button>
              {mapped.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={() => set("midi", { ccMap: {} })}>
                  Clear
                </Button>
              ) : null}
            </div>
          }
        />
        {mapped.length > 0 ? (
          <ul className={`${styles["mapSummary"]} ${styles["groupPadded"]}`} aria-label="Current CC mapping">
            {mapped.map((entry) => (
              <li key={entry.cc} className={styles["mapChip"]}>
                CC {entry.cc} → {entry.trackParam}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={styles["group"]}>
        <SettingRow
          id={oscAddressId}
          title="SuperDirt address"
          help="Where SuperCollider listens for OSC. Switch SuperDirt on in the table above."
          divider={false}
          control={
            <div className={styles["fieldRow"]}>
              <DraftField
                className={styles["field"]}
                label="OSC host"
                value={osc.host}
                onCommit={(host) => {
                  if (host.trim() !== "") set("osc", { host: host.trim() });
                }}
                spellCheck={false}
              />
              <DraftField
                className={styles["fieldPort"]}
                label="OSC port"
                value={String(osc.port)}
                inputMode="numeric"
                onCommit={(text) => {
                  const port = parsePort(text);
                  if (port !== null) set("osc", { port });
                }}
              />
            </div>
          }
        />
      </div>
    </SettingsSection>
  );
}
