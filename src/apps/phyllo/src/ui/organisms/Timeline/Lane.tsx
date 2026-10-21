import { newId } from "@phyllo/model";
import type { Clip as ClipModel, TipTarget, Track } from "@phyllo/model";
import { Clip, TrackHeader } from "@phyllo/ui";
import type { ClipEdge, MeterSubscribe } from "@phyllo/ui";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { usePointerDrag } from "./pointerDrag";
import { isSoundDrag, readSoundRef } from "./soundDrop";
import styles from "./Timeline.module.css";
import { snapDelta, wholeBarStep } from "./timelineModel";
import type { EditTool, Snap } from "./timelineModel";
import { trackSoundCode, trackViz } from "./trackDisplay";
import type { TimelineActions } from "./useTimelineActions";

export interface LaneProps {
  track: Track;
  lengthBars: number;
  barWidth: number;
  selected: boolean;
  /** False when muted or another track is soloed (`isAudible`). */
  audible: boolean;
  /** Engine error message for this track. */
  error: string | undefined;
  tool: EditTool;
  snap: Snap;
  /** First lane: its Mute/Solo carry the `track-mute` / `track-solo` tip anchors. */
  tipAnchors: boolean;
  /** `useTips().highlight` when `tipAnchors`, else null. */
  tipHighlight: TipTarget | null;
  meterSubscribe: MeterSubscribe;
  /** Transport stopped: the header meter reads 0 (SPEC §6.1). */
  meterStopped: boolean;
  actions: TimelineActions;
  onEditPattern: ((trackId: string) => void) | undefined;
}

type Range = { startBar: number; endBar: number };
/** What a drag shows before it is applied: the clip at its new place, or a ghost for duplicates and drawing. */
type Preview = Range & { clipId: string | null; ghost: boolean };

const CLIP_KEYS = "Delete Backspace Enter ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight";

/** Puts the tip anchors on the first track's Mute/Solo (TrackHeader doesn't forward props to its toggles). */
function useTipAnchors(
  root: RefObject<HTMLDivElement | null>,
  name: string,
  enabled: boolean,
  highlight: TipTarget | null,
) {
  useLayoutEffect(() => {
    const header = root.current;
    if (!header || !enabled) return;
    const anchors: [TipTarget, HTMLElement | null][] = [
      ["track-mute", header.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(`Mute ${name}`)}"]`)],
      ["track-solo", header.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(`Solo ${name}`)}"]`)],
    ];
    for (const [target, button] of anchors) {
      if (!button) continue;
      button.setAttribute("data-tip-target", target);
      if (highlight === target) button.setAttribute("data-tip-active", "");
      else button.removeAttribute("data-tip-active");
    }
    return () => {
      for (const [, button] of anchors) {
        button?.removeAttribute("data-tip-target");
        button?.removeAttribute("data-tip-active");
      }
    };
  }, [root, name, enabled, highlight]);
}

/** One track row: TrackHeader plus the clip lane (clip editing, drawing, splitting, sound drops). */
export const Lane = memo(function Lane({
  track,
  lengthBars,
  barWidth,
  selected,
  audible,
  error,
  tool,
  snap,
  tipAnchors,
  tipHighlight,
  meterSubscribe,
  meterStopped,
  actions,
  onEditPattern,
}: LaneProps) {
  const header = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const startDrag = usePointerDrag();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dropping, setDropping] = useState(false);
  const step = wholeBarStep(snap);
  const trackId = track.id;
  const { kind, pattern, source } = track;
  const viz = useMemo(() => trackViz({ kind, pattern, source }, lengthBars), [kind, pattern, source, lengthBars]);
  const label = kind === "code" ? ((track.rawCode ?? "").split("\n")[0]?.trim() ?? "") : pattern;

  useTipAnchors(header, track.name, tipAnchors, tipHighlight);

  /** 1-based fractional bar under the pointer. */
  const barAt = (clientX: number) => 1 + (clientX - (lane.current?.getBoundingClientRect().left ?? 0)) / barWidth;
  const gridStart = (bar: number) => 1 + Math.floor((bar - 1) / step) * step;

  function dragClip(clip: ClipModel, mode: "move" | ClipEdge, event: ReactPointerEvent<HTMLElement>, duplicate: boolean) {
    const len = clip.endBar - clip.startBar;
    const next = (dx: number): Range => {
      const delta = snapDelta(dx / barWidth, step);
      if (mode === "move") {
        const startBar = Math.min(lengthBars - len, Math.max(1, clip.startBar + delta));
        return { startBar, endBar: startBar + len };
      }
      if (mode === "start") return { startBar: Math.min(clip.endBar, Math.max(1, clip.startBar + delta)), endBar: clip.endBar };
      return { startBar: clip.startBar, endBar: Math.min(lengthBars, Math.max(clip.startBar, clip.endBar + delta)) };
    };
    startDrag(event, {
      onMove: (dx) => setPreview({ clipId: clip.id, ghost: duplicate, ...next(dx) }),
      onEnd: (dx, moved) => {
        setPreview(null);
        if (!moved) return;
        const range = next(dx);
        if (duplicate) {
          actions.batch(() => actions.dispatch({ type: "clip/add", trackId, clip: { id: newId("clip_"), ...range } }));
        } else if (range.startBar !== clip.startBar || range.endBar !== clip.endBar) {
          actions.batch(() => actions.dispatch({ type: "clip/update", trackId, clipId: clip.id, patch: range }));
        }
      },
      onCancel: () => setPreview(null),
    });
  }

  function onLanePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    if (tool !== "draw") {
      actions.select(trackId);
      return;
    }
    event.preventDefault();
    const anchor = gridStart(Math.floor(barAt(event.clientX)));
    if (anchor > lengthBars) return;
    const range = (clientX: number): Range => {
      const bar = gridStart(Math.floor(barAt(clientX)));
      const startBar = Math.max(1, Math.min(anchor, bar));
      return { startBar, endBar: Math.min(lengthBars, Math.max(anchor, bar) + step - 1) };
    };
    setPreview({ clipId: null, ghost: true, ...range(event.clientX) });
    startDrag(event, {
      onMove: (_dx, e) => setPreview({ clipId: null, ghost: true, ...range(e.clientX) }),
      onEnd: (_dx, _moved, e) => {
        setPreview(null);
        const clip = { id: newId("clip_"), ...range(e.clientX) };
        actions.batch(() => {
          actions.dispatch({ type: "clip/add", trackId, clip });
          actions.select(trackId);
        });
      },
      onCancel: () => setPreview(null),
    });
  }

  function onClipClick(clip: ClipModel, event: MouseEvent<HTMLButtonElement>) {
    if (tool !== "split") {
      actions.select(trackId);
      return;
    }
    const atBar = 1 + Math.round((barAt(event.clientX) - 1) / step) * step;
    if (clip.startBar < atBar && atBar <= clip.endBar) {
      actions.dispatch({ type: "clip/split", trackId, clipId: clip.id, atBar, newClipId: newId("clip_") });
    }
  }

  function onClipKeyDown(clip: ClipModel, event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      actions.dispatch({ type: "clip/remove", trackId, clipId: clip.id });
      lane.current?.focus();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onEditPattern?.(trackId);
      return;
    }
    const dir = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (dir === 0) return;
    event.preventDefault();
    let patch: Range;
    if (event.shiftKey) {
      patch = { startBar: clip.startBar, endBar: Math.min(lengthBars, Math.max(clip.startBar, clip.endBar + dir * step)) };
    } else {
      const len = clip.endBar - clip.startBar;
      const startBar = Math.min(lengthBars - len, Math.max(1, clip.startBar + dir * step));
      patch = { startBar, endBar: startBar + len };
    }
    if (patch.startBar !== clip.startBar || patch.endBar !== clip.endBar) {
      actions.dispatch({ type: "clip/update", trackId, clipId: clip.id, patch });
    }
  }

  function onDragOver(event: DragEvent<HTMLLIElement>) {
    if (!isSoundDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    if (!dropping) setDropping(true);
  }

  function onDragLeave(event: DragEvent<HTMLLIElement>) {
    const to = event.relatedTarget;
    if (to instanceof Node && event.currentTarget.contains(to)) return;
    setDropping(false);
  }

  function onDrop(event: DragEvent<HTMLLIElement>) {
    if (!isSoundDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    setDropping(false);
    const ref = readSoundRef(event.dataTransfer);
    if (ref) actions.dropSound({ kind: "lane", trackId }, ref, event.shiftKey);
  }

  const place = (range: Range) => ({ left: (range.startBar - 1) * barWidth, width: (range.endBar - range.startBar + 1) * barWidth });
  const moving = preview && !preview.ghost ? preview : null;

  return (
    <li
      className={styles["lane"]}
      aria-label={track.name}
      data-selected={selected ? "" : undefined}
      data-drop={dropping ? "" : undefined}
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <TrackHeader
        ref={header}
        className={styles["header"]}
        name={track.name}
        sound={trackSoundCode(track)}
        color={track.color}
        selected={selected}
        muted={track.mute}
        soloed={track.solo}
        meterSubscribe={meterSubscribe}
        meterStopped={meterStopped}
        {...(error ? { error } : {})}
        codeTrack={kind === "code"}
        onSelect={() => actions.select(trackId)}
        onMuteChange={(mute) => actions.setMute(trackId, mute)}
        onSoloChange={(solo, event) => actions.setSolo(trackId, solo, event.altKey)}
        onRename={(name) => actions.dispatch({ type: "track/update", trackId, patch: { name } })}
      />
      <div
        ref={lane}
        className={styles["clipLane"]}
        data-tool={tool}
        tabIndex={-1}
        onPointerDown={onLanePointerDown}
        data-testid={`lane-${trackId}`}
      >
        {track.clips.map((clip) => {
          const range = moving && moving.clipId === clip.id ? moving : clip;
          return (
            <div key={clip.id} className={styles["clipSlot"]} style={place(range)}>
              <Clip
                name={track.name}
                startBar={range.startBar}
                endBar={range.endBar}
                color={track.color}
                label={label}
                viz={viz}
                selected={selected}
                audible={audible}
                dragging={moving?.clipId === clip.id}
                data-tool={tool}
                aria-keyshortcuts={CLIP_KEYS}
                {...(tool === "split"
                  ? {}
                  : {
                      onMoveStart: (event: ReactPointerEvent<HTMLButtonElement>) => dragClip(clip, "move", event, event.altKey),
                      onResizeStart: (edge: ClipEdge, event: ReactPointerEvent<HTMLElement>) => dragClip(clip, edge, event, false),
                    })}
                onClick={(event) => onClipClick(clip, event)}
                onDoubleClick={() => onEditPattern?.(trackId)}
                onKeyDown={(event) => onClipKeyDown(clip, event)}
              />
            </div>
          );
        })}
        {preview?.ghost ? (
          <div className={styles["ghost"]} style={{ ...place(preview), background: track.color }} aria-hidden="true" />
        ) : null}
      </div>
    </li>
  );
});
