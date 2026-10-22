import type { Project, Section } from "@phyllo/model";
import { memo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useContextMenu, useContextMenuTrigger } from "../../../hooks";
import { usePointerDrag } from "./pointerDrag";
import { SectionChips } from "./SectionChips";
import type { SectionChipsHandle } from "./SectionChips";
import styles from "./Timeline.module.css";
import { isPrimaryPress, snapDelta, snapPosition, wholeBarStep } from "./timelineModel";
import type { Snap } from "./timelineModel";
import type { TimelineActions } from "./useTimelineActions";
import { useTimelineMenus } from "./useTimelineMenus";

type Loop = Project["loop"];
type LoopRange = { startBar: number; endBar: number };

export interface RulerProps {
  lengthBars: number;
  barWidth: number;
  sections: Section[];
  loop: Loop;
  snap: Snap;
  /** Left cell text: "7 tracks · 32 bars". */
  summary: string;
  /** Playhead marker (moved by the Timeline's position subscription). */
  marker: RefObject<HTMLDivElement | null>;
  actions: TimelineActions;
}

/** Bar-number spacing: every 4 bars, doubled until labels are at least 28 px apart. */
function numberStep(barWidth: number): number {
  let step = 4;
  while (step * barWidth < 28 && step < 64) step *= 2;
  return step;
}

function clampRange(start: number, end: number, lengthBars: number): LoopRange {
  const startBar = Math.min(lengthBars, Math.max(1, start));
  return { startBar, endBar: Math.min(lengthBars, Math.max(startBar, end)) };
}

/**
 * Ruler (Timeline doc): section chips, loop band, bar numbers. A click (no movement) anywhere on it seeks
 * (snapped), inside the loop band too, and dragging over it scrubs; ⇧-drag draws a new loop region. Only the
 * band's top border strip (drag to move) and its edge handles (drag to resize) edit the loop (snapped, one undo
 * step); the rest of the band lets pointer events through to the ruler. The band is also a button: ←/→ move
 * it, ⇧←/→ change its length. Right-click on the ruler opens a menu for the bar under the pointer (play from there,
 * loop start/end, add section, song end); the loop band has its own menu (also Shift+F10 on the band).
 */
export const Ruler = memo(function Ruler({ lengthBars, barWidth, sections, loop, snap, summary, marker, actions }: RulerProps) {
  const track = useRef<HTMLDivElement>(null);
  const chips = useRef<SectionChipsHandle>(null);
  const menu = useContextMenu();
  const menus = useTimelineMenus(actions);
  const renameNewSection = (sectionId: string) => chips.current?.rename(sectionId);
  const loopMenu = useContextMenuTrigger(() => menus.loop(renameNewSection));
  const startDrag = usePointerDrag();
  const [draft, setDraft] = useState<LoopRange | null>(null);
  const step = wholeBarStep(snap);
  const shown = draft ?? loop;
  const showLoop = loop.enabled || draft !== null;

  /** 1-based fractional bar under the pointer. */
  const barAt = (clientX: number) => 1 + (clientX - (track.current?.getBoundingClientRect().left ?? 0)) / barWidth;
  const seekTo = (clientX: number) => {
    const bar = snapPosition(barAt(clientX), snap);
    actions.seek(Math.min(lengthBars + 1, Math.max(1, bar)));
  };

  function onTrackContextMenu(event: MouseEvent<HTMLDivElement>) {
    const bar = barAt(event.clientX);
    const request = menus.ruler({
      bar: Math.min(lengthBars, Math.max(1, Math.floor(bar))),
      seekBar: Math.min(lengthBars + 1, Math.max(1, snapPosition(bar, snap))),
      snap,
      renameNewSection,
    });
    menu.openFromEvent(event, request);
  }

  function onTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isPrimaryPress(event)) return;
    event.preventDefault();
    if (event.shiftKey) {
      // ⇧-drag: draw a loop region from the bar under the pointer.
      const anchor = Math.floor(barAt(event.clientX));
      const gridStart = (bar: number) => 1 + Math.floor((bar - 1) / step) * step;
      const range = (clientX: number) => {
        const bar = Math.floor(barAt(clientX));
        return clampRange(gridStart(Math.min(anchor, bar)), gridStart(Math.max(anchor, bar)) + step - 1, lengthBars);
      };
      setDraft(range(event.clientX));
      startDrag(event, {
        onMove: (_dx, e) => setDraft(range(e.clientX)),
        onEnd: (_dx, _moved, e) => {
          setDraft(null);
          actions.setLoop({ enabled: true, ...range(e.clientX) });
        },
        onCancel: () => setDraft(null),
      });
      return;
    }
    seekTo(event.clientX);
    startDrag(event, {
      onMove: (_dx, e) => seekTo(e.clientX),
      onEnd: () => {},
      onCancel: () => {},
    });
  }

  function onLoopPointerDown(mode: "move" | "start" | "end", event: ReactPointerEvent<HTMLElement>) {
    if (!isPrimaryPress(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const origin = { startBar: loop.startBar, endBar: loop.endBar };
    const len = origin.endBar - origin.startBar;
    const next = (dx: number): LoopRange => {
      const delta = snapDelta(dx / barWidth, step);
      if (mode === "move") {
        const start = Math.min(lengthBars - len, Math.max(1, origin.startBar + delta));
        return { startBar: start, endBar: start + len };
      }
      if (mode === "start") return clampRange(Math.min(origin.endBar, origin.startBar + delta), origin.endBar, lengthBars);
      return clampRange(origin.startBar, Math.max(origin.startBar, origin.endBar + delta), lengthBars);
    };
    startDrag(event, {
      onMove: (dx) => setDraft(next(dx)),
      onEnd: (dx, moved, e) => {
        setDraft(null);
        // A press without movement on a grip is a click on the ruler: seek, like anywhere else.
        if (!moved) {
          seekTo(e.clientX);
          return;
        }
        const range = next(dx);
        if (range.startBar !== loop.startBar || range.endBar !== loop.endBar) actions.setLoop(range);
      },
      onCancel: () => setDraft(null),
    });
  }

  function onLoopKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    loopMenu.onKeyDown(event);
    if (event.defaultPrevented) return;
    const dir = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (dir === 0) return;
    event.preventDefault();
    if (event.shiftKey) {
      const endBar = Math.min(lengthBars, Math.max(loop.startBar, loop.endBar + dir * step));
      if (endBar !== loop.endBar) actions.setLoop({ endBar });
      return;
    }
    const len = loop.endBar - loop.startBar;
    const startBar = Math.min(lengthBars - len, Math.max(1, loop.startBar + dir * step));
    if (startBar !== loop.startBar) actions.setLoop({ startBar, endBar: startBar + len });
  }

  const every = numberStep(barWidth);
  const numbers: number[] = [];
  for (let bar = 1; bar <= lengthBars; bar += every) numbers.push(bar);
  const loopLabel =
    shown.startBar === shown.endBar ? `Loop region, bar ${shown.startBar}` : `Loop region, bars ${shown.startBar} to ${shown.endBar}`;

  return (
    <div className={styles["ruler"]}>
      <div className={styles["rulerCorner"]}>{summary}</div>
      <div ref={track} className={styles["rulerTrack"]} onPointerDown={onTrackPointerDown} onContextMenu={onTrackContextMenu} data-testid="ruler">
        <SectionChips sections={sections} barWidth={barWidth} actions={actions} handle={chips} />
        {showLoop ? (
          <button
            type="button"
            className={styles["loopBand"]}
            data-dragging={draft ? "" : undefined}
            style={{ left: (shown.startBar - 1) * barWidth, width: (shown.endBar - shown.startBar + 1) * barWidth }}
            aria-label={loopLabel}
            aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
            title="Drag the top edge to move the loop, drag a side to resize. Arrow keys move it, ⇧ + arrow keys resize."
            onKeyDown={onLoopKeyDown}
            onContextMenu={loopMenu.onContextMenu}
          >
            <span className={styles["loopGrip"]} aria-hidden="true" data-testid="loop-grip" onPointerDown={(e) => onLoopPointerDown("move", e)} />
            <span className={styles["loopEdge"]} data-edge="start" aria-hidden="true" onPointerDown={(e) => onLoopPointerDown("start", e)} />
            <span className={styles["loopEdge"]} data-edge="end" aria-hidden="true" onPointerDown={(e) => onLoopPointerDown("end", e)} />
          </button>
        ) : null}
        {numbers.map((bar) => (
          <span key={bar} className={styles["barNumber"]} style={{ left: (bar - 1) * barWidth }} aria-hidden="true">
            {bar}
          </span>
        ))}
        <div ref={marker} className={styles["playheadMarker"]} aria-hidden="true" />
      </div>
    </div>
  );
});
