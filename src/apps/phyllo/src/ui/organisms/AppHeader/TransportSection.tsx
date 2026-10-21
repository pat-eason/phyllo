import { formatPosition } from "@phyllo/model";
import type { TransportPosition } from "@phyllo/model";
import { IconButton, Readout, TransportControls } from "@phyllo/ui";
import type { ReadoutCell, ReadoutSubscribe } from "@phyllo/ui";
import { useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useProjectSelector, useSettings, useTransport, useUiMode } from "../../../hooks";
import styles from "./AppHeader.module.css";
import { addTap, bpmFromTaps, clampBpm } from "./tapTempo";

type PositionSubscribe = ReturnType<typeof useTransport>["subscribePosition"];

/** Adapts the transport's position feed to a Readout cell feed; the cell writes straight to its DOM node. */
function readoutFeed(subscribe: PositionSubscribe, text: (position: TransportPosition) => string): ReadoutSubscribe {
  return (write) => subscribe((position) => write(text(position)));
}

const positionText = (position: TransportPosition) => formatPosition(position);
const cycleText = (position: TransportPosition) => position.cycle.toFixed(2);

/** Transport keys, the position/BPM/key/cycle readout and the metronome toggle (centre of the full header). */
export function TransportSection() {
  const transport = useTransport();
  const { mode } = useUiMode();
  const { settings } = useSettings();
  const key = useProjectSelector((project) => project.key);
  const taps = useRef<number[]>([]);

  const { bpm, beatsPerBar, position, subscribePosition, setBpm } = transport;
  const pro = mode === "pro";
  // Stable feeds: a Readout cell re-subscribes whenever its feed identity changes.
  const positionFeed = useMemo(() => readoutFeed(subscribePosition, positionText), [subscribePosition]);
  const cycleFeed = useMemo(() => readoutFeed(subscribePosition, cycleText), [subscribePosition]);
  const bpmCaption = pro ? `BPM · setcpm(${formatCycles(bpm / beatsPerBar)})` : "BPM · TAP";

  function tap() {
    taps.current = addTap(taps.current, Date.now());
    const tapped = bpmFromTaps(taps.current);
    if (tapped !== null) setBpm(tapped);
  }

  function commitBpm(text: string) {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) setBpm(clampBpm(parsed));
  }

  // Tap tempo lives on the BPM cell: its "BPM · TAP" caption button (Guided) or T while the cell has focus.
  function onReadoutKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target;
    if (event.key.toLowerCase() !== "t" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (!(target instanceof HTMLButtonElement) || !target.closest('[data-cell="bpm"]')) return;
    event.preventDefault();
    tap();
  }

  const cells: ReadoutCell[] = [
    {
      id: "position",
      value: formatPosition(position),
      caption: "BAR · BEAT · 16TH",
      mono: true,
      minWidth: 112,
      subscribe: positionFeed,
    },
    {
      id: "bpm",
      value: String(bpm),
      caption: bpmCaption,
      mono: true,
      label: `Tempo ${bpm} BPM, edit`,
      onEdit: commitBpm,
      onCaptionClick: pro ? undefined : tap,
      captionLabel: "Tap tempo",
      onNudge: (delta) => setBpm(clampBpm(bpm + delta)),
    },
    { id: "key", value: key, caption: `KEY · ${beatsPerBar}/4` },
    {
      id: "cycle",
      value: position.cycle.toFixed(2),
      caption: "CYCLE",
      mono: true,
      subscribe: cycleFeed,
    },
  ];

  return (
    <div className={styles["transportSection"]} data-tauri-drag-region="">
      <TransportControls
        playing={transport.playing}
        recording={transport.recordArmed}
        loop={transport.loop.enabled}
        showRecord={settings.midi.enabledPorts.length > 0}
        onToStart={transport.toStart}
        onPlayPause={() => void transport.togglePlay()}
        onStop={transport.stop}
        onRecord={transport.toggleRecordArm}
        onLoopChange={transport.toggleLoop}
      />
      <Readout cells={cells} onKeyDown={onReadoutKeyDown} />
      <IconButton
        icon="metronome"
        label="Metronome"
        size={38}
        pressed={transport.metronome}
        tone="accent"
        onClick={transport.toggleMetronome}
      />
    </div>
  );
}

/** `setcpm(30)`, `setcpm(32.5)`: at most two decimals, no trailing zeros. */
function formatCycles(cyclesPerMinute: number): string {
  return String(Math.round(cyclesPerMinute * 100) / 100);
}
