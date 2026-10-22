import { formatPosition } from "@phyllo/model";
import type { TransportPosition } from "@phyllo/model";
import { IconButton, Readout, TransportControls } from "@phyllo/ui";
import type { ReadoutCell, ReadoutSubscribe } from "@phyllo/ui";
import { useMemo, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { isContextMenuKey, useCanRecord, useContextMenu, useProject, useProjectSelector, useTransport, useUiMode } from "../../../hooks";
import type { ContextMenuRequest } from "../../../hooks";
import styles from "./AppHeader.module.css";
import { addTap, bpmFromTaps, clampBpm } from "./tapTempo";
import { bpmMenuEntries, keyMenuEntries, positionMenuEntries } from "./transportMenus";

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
  const canRecord = useCanRecord();
  const key = useProjectSelector((project) => project.key);
  const taps = useRef<number[]>([]);
  const sectionRef = useRef<HTMLDivElement>(null);
  const { dispatch } = useProject();
  const contextMenu = useContextMenu();

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

  /** Right-click menu of a readout cell; the cycle cell has none. */
  function cellMenu(cellId: string): ContextMenuRequest | null {
    switch (cellId) {
      case "position":
        return { label: "Position", entries: positionMenuEntries(transport.loop.enabled, { toStart: transport.toStart, toggleLoop: transport.toggleLoop }) };
      case "bpm":
        return { label: "Tempo", entries: bpmMenuEntries(bpm, { tapTempo: tap, setBpm: (next) => setBpm(clampBpm(next)) }) };
      case "key":
        return {
          label: "Key and time signature",
          entries: keyMenuEntries(key, beatsPerBar, {
            setKey: (next) => dispatch({ type: "project/setKey", key: next }),
            setBeatsPerBar: (next) => dispatch({ type: "tempo/set", beatsPerBar: next }),
          }),
        };
      default:
        return null;
    }
  }

  // The key cell has no other action, so a click (or Enter/Space) opens its menu: the only place key and time
  // signature can be changed, so it must be reachable without a right-click.
  function openKeyMenu() {
    const cell = sectionRef.current?.querySelector<HTMLElement>('[data-cell="key"]');
    const request = cellMenu("key");
    if (cell && request) contextMenu.openAtElement(cell, request);
  }

  function openCellMenu(event: MouseEvent<HTMLElement>, cellId: string) {
    const request = cellMenu(cellId);
    if (request) contextMenu.openFromEvent(event, request);
  }

  // Shift+F10 on a focused cell button opens that cell's menu.
  function openCellMenuFromKey(event: KeyboardEvent<HTMLDivElement>): boolean {
    const cell = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cell]") : null;
    const request = cell?.dataset["cell"] ? cellMenu(cell.dataset["cell"]) : null;
    if (!cell || !request) return false;
    event.preventDefault();
    contextMenu.openAtElement(cell, request);
    return true;
  }

  // Tap tempo lives on the BPM cell: its "BPM · TAP" caption button (Guided) or T while the cell has focus.
  function onReadoutKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isContextMenuKey(event) && openCellMenuFromKey(event)) return;
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
      onContextMenu: (event) => openCellMenu(event, "position"),
    },
    {
      id: "bpm",
      value: String(bpm),
      caption: bpmCaption,
      mono: true,
      label: pro ? `${bpm} ${bpmCaption}, edit tempo` : `${bpm} BPM, edit tempo`,
      onEdit: commitBpm,
      onCaptionClick: pro ? undefined : tap,
      captionLabel: `${bpmCaption}, tap tempo`,
      onNudge: (delta) => setBpm(clampBpm(bpm + delta)),
      onContextMenu: (event) => openCellMenu(event, "bpm"),
    },
    {
      id: "key",
      value: key,
      caption: `KEY · ${beatsPerBar}/4`,
      label: `${key}, ${beatsPerBar}/4, change key or time signature`,
      onActivate: openKeyMenu,
      onContextMenu: (event) => openCellMenu(event, "key"),
    },
    {
      id: "cycle",
      value: position.cycle.toFixed(2),
      caption: "CYCLE",
      mono: true,
      subscribe: cycleFeed,
    },
  ];

  return (
    <div ref={sectionRef} className={styles["transportSection"]} data-tauri-drag-region="">
      <TransportControls
        playing={transport.playing}
        recording={transport.recordArmed}
        loop={transport.loop.enabled}
        showRecord={canRecord}
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
