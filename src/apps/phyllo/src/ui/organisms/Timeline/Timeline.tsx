import { isAudible } from "@phyllo/model";
import { EmptyState } from "@phyllo/ui";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentPropsWithoutRef, CSSProperties, DragEvent, FocusEvent, KeyboardEvent } from "react";
import { useStore } from "zustand";
import { useAppStores, useMeters, useProjectSelector, useUiMode } from "../../../hooks";
import { AddTrackRow } from "./AddTrackRow";
import { Lane } from "./Lane";
import { Ruler } from "./Ruler";
import { isSoundDrag, readSoundRef } from "./soundDrop";
import styles from "./Timeline.module.css";
import { barWidthFor, DEFAULT_SNAP, zoomIn, zoomOut } from "./timelineModel";
import type { EditTool, Snap } from "./timelineModel";
import { usePlayhead } from "./usePlayhead";
import { LANE_ROW_PX, renderedLaneIndexes, useLaneRange, VIRTUALIZE_AFTER } from "./useLaneRange";
import { useTimelineActions } from "./useTimelineActions";

/** Stands in for `lanes` unrendered lanes so the scroll height stays the same. */
function LaneGap({ lanes }: { lanes: number }) {
  return <li aria-hidden="true" className={styles["laneGap"]} style={{ height: lanes * LANE_ROW_PX }} />;
}

/** `--ph-track-header-w`; needed in px for ⌘-scroll zoom anchoring. */
const HEADER_PX = 208;
/** Timeline doc: inner `min-width: 760px`. */
const MIN_CONTENT_PX = 760;

export interface TimelineProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** Pointer mode from the ViewToolbar (Pro). Guided always uses `select`. Default `select`. */
  tool?: EditTool;
  /** Grid for seeking, clip edits and the loop. Default `1` (one bar). */
  snap?: Snap;
  /** Double-click or Enter on a clip: open the Pattern editor for that track. */
  onEditPattern?: (trackId: string) => void;
}

/**
 * Arrange timeline (Timeline doc, SPEC §6.1): ruler with sections, loop band and bar numbers; one lane per
 * track (TrackHeader + clips); an Add-track row; a playhead that moves outside React. Scrolls on both axes
 * with the header column sticky left and the ruler sticky top. Zoom is `project.ui.zoom` (⌘/Ctrl-scroll too).
 * While playing nothing here re-renders: the playhead, section highlight and meters subscribe on their own.
 *
 * Past `VIRTUALIZE_AFTER` tracks only the lanes in view (plus overscan, plus the lane that holds focus) are
 * rendered; spacers keep the scroll height. ↑/↓ on a track header selects the previous/next track and moves focus
 * to its header, scrolling it into view.
 */
export function Timeline({ tool = "select", snap = DEFAULT_SNAP, onEditPattern, className, style, ...rest }: TimelineProps) {
  const stores = useAppStores();
  const actions = useTimelineActions();
  const { meterFor } = useMeters();
  const { mode } = useUiMode();
  const view = useProjectSelector((p) => ({
    tracks: p.tracks,
    sections: p.sections,
    loop: p.loop,
    lengthBars: p.lengthBars,
    zoom: p.ui.zoom,
    selected: p.ui.selectedTrack,
  }));
  const trackErrors = useStore(stores.engine, (s) => s.trackErrors);
  const tipHighlight = useStore(stores.tips, (s) => s.highlight);
  // Re-renders the lanes on play/stop only (meters read 0 when stopped), never per frame.
  const playing = useStore(stores.transport, (s) => s.playing);
  const [dropNew, setDropNew] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLUListElement>(null);
  /** Lane that holds focus or is being navigated to: stays mounted when virtualized. */
  const [keepId, setKeepId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const zoomAnchor = useRef<{ bar: number; offsetX: number } | null>(null);

  const count = view.tracks.length;
  const virtualized = count > VIRTUALIZE_AFTER;
  const laneRange = useLaneRange(scroller, lanesRef, count, virtualized);
  const barWidth = barWidthFor(view.zoom);
  const songWidth = view.lengthBars * barWidth;
  const { line, marker } = usePlayhead(barWidth);
  const activeTool: EditTool = mode === "pro" ? tool : "select";

  const editPattern = useRef(onEditPattern);
  useLayoutEffect(() => {
    editPattern.current = onEditPattern;
  });
  const openEditor = useCallback((trackId: string) => editPattern.current?.(trackId), []);

  // ⌘/Ctrl-scroll zooms around the pointer. Native listener: React's wheel listener is passive.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.deltaY === 0) return;
      event.preventDefault();
      const project = actions.getProject();
      const zoom = project.ui.zoom;
      const next = event.deltaY < 0 ? zoomIn(zoom) : zoomOut(zoom);
      if (next === zoom) return;
      const offsetX = event.clientX - el.getBoundingClientRect().left;
      zoomAnchor.current = { bar: (el.scrollLeft + offsetX - HEADER_PX) / barWidthFor(zoom), offsetX };
      actions.dispatch({ type: "ui/setZoom", zoom: next });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [actions]);

  useLayoutEffect(() => {
    const anchor = zoomAnchor.current;
    const el = scroller.current;
    if (!anchor || !el) return;
    zoomAnchor.current = null;
    el.scrollLeft = Math.max(0, HEADER_PX + anchor.bar * barWidth - anchor.offsetX);
  }, [barWidth]);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!isSoundDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!dropNew) setDropNew(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const to = event.relatedTarget;
    if (to instanceof Node && event.currentTarget.contains(to)) return;
    setDropNew(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!isSoundDrag(event.dataTransfer)) return;
    event.preventDefault();
    setDropNew(false);
    const ref = readSoundRef(event.dataTransfer);
    if (ref) actions.dropSound({ kind: "new" }, ref, event.shiftKey);
  }

  const keepIndex = keepId === null ? null : view.tracks.findIndex((t) => t.id === keepId);
  const laneIndexes = virtualized
    ? renderedLaneIndexes(laneRange, keepIndex, count)
    : view.tracks.map((_, index) => index);

  const trailingLanes = virtualized ? count - 1 - (laneIndexes[laneIndexes.length - 1] ?? -1) : 0;

  // After ↑/↓ the target lane is mounted (kept) by this render; focus its header.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const header = lanesRef.current?.querySelector<HTMLElement>(`[data-track-id="${CSS.escape(id)}"] button`);
    if (!header) return;
    pendingFocus.current = null;
    header.focus();
  });

  function onLanesFocus(event: FocusEvent<HTMLUListElement>) {
    const id = event.target.closest<HTMLElement>("[data-track-id]")?.dataset["trackId"];
    if (id !== undefined) setKeepId(id);
  }

  function onLanesBlur(event: FocusEvent<HTMLUListElement>) {
    // Focus leaving the lanes releases the kept lane; a move between lanes sets the next one on focus.
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setKeepId(null);
  }

  /** ↑/↓ on a track header: select and focus the previous/next track. */
  function onLanesKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target || target instanceof HTMLInputElement || !target.closest("[data-track-header]")) return;
    const id = target.closest<HTMLElement>("[data-track-id]")?.dataset["trackId"];
    const from = view.tracks.findIndex((t) => t.id === id);
    if (from < 0) return;
    event.preventDefault();
    const to = Math.min(count - 1, Math.max(0, from + (event.key === "ArrowDown" ? 1 : -1)));
    const next = view.tracks[to];
    if (to === from || !next) return;
    scrollLaneIntoView(to);
    actions.select(next.id);
    pendingFocus.current = next.id;
    setKeepId(next.id);
  }

  /** Brings lane `index` fully into view below the sticky ruler (the scroll event then updates the virtual range). */
  function scrollLaneIntoView(index: number) {
    const el = scroller.current;
    const list = lanesRef.current;
    if (!el || !list) return;
    const top = list.offsetTop + index * LANE_ROW_PX;
    if (top < el.scrollTop + list.offsetTop) el.scrollTop = top - list.offsetTop;
    else if (top + LANE_ROW_PX > el.scrollTop + el.clientHeight) el.scrollTop = top + LANE_ROW_PX - el.clientHeight;
  }

  const summary = `${count} ${count === 1 ? "track" : "tracks"} · ${view.lengthBars} bars`;
  const rootStyle = {
    ...style,
    "--bar-w": `${barWidth}px`,
    "--song-w": `${songWidth}px`,
  } as CSSProperties;

  return (
    <div
      ref={scroller}
      className={className ? `${styles["root"]} ${className}` : styles["root"]}
      style={rootStyle}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      {...rest}
    >
      <div className={styles["content"]} style={{ minWidth: Math.max(MIN_CONTENT_PX, HEADER_PX + songWidth) }}>
        <Ruler
          lengthBars={view.lengthBars}
          barWidth={barWidth}
          sections={view.sections}
          loop={view.loop}
          snap={snap}
          summary={summary}
          marker={marker}
          actions={actions}
        />
        {count === 0 ? (
          <EmptyState
            className={styles["empty"]}
            compact
            title="No tracks yet"
            body={
              mode === "guided"
                ? "Drag a sound from the library onto the timeline, or add a track below."
                : "Drop a sound, or add a track below."
            }
          />
        ) : (
          // ↑/↓ on a header and focus tracking are delegated here; the headers inside are the interactive elements.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <ul
            ref={lanesRef}
            className={styles["lanes"]}
            aria-label="Tracks"
            onFocus={onLanesFocus}
            onBlur={onLanesBlur}
            onKeyDown={onLanesKeyDown}
          >
            {laneIndexes.map((index, n) => {
              const track = view.tracks[index];
              if (!track) return null;
              const skipped = index - (n === 0 ? -1 : (laneIndexes[n - 1] ?? -1)) - 1;
              return (
                <Fragment key={track.id}>
                  {skipped > 0 ? <LaneGap lanes={skipped} /> : null}
                  <Lane
                    track={track}
                    lengthBars={view.lengthBars}
                    barWidth={barWidth}
                    selected={track.id === view.selected}
                    audible={isAudible(track, view.tracks)}
                    error={trackErrors[track.id]?.message}
                    tool={activeTool}
                    snap={snap}
                    tipAnchors={index === 0}
                    tipHighlight={index === 0 ? tipHighlight : null}
                    meterSubscribe={meterFor(track.id)}
                    meterStopped={!playing}
                    actions={actions}
                    onEditPattern={onEditPattern ? openEditor : undefined}
                    {...(virtualized ? { position: index + 1, setSize: count } : {})}
                  />
                </Fragment>
              );
            })}
            {trailingLanes > 0 ? <LaneGap lanes={trailingLanes} /> : null}
          </ul>
        )}
        <AddTrackRow mode={mode} dropActive={dropNew} actions={actions} onDropActiveChange={setDropNew} />
        <div className={styles["playheadLayer"]} aria-hidden="true">
          <div ref={line} className={styles["playheadLine"]} data-testid="playhead" />
        </div>
      </div>
    </div>
  );
}
