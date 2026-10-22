import { cloneClip, cloneTrack, createSection, findTrack, newId } from "@phyllo/model";
import type { Clip, Project, Section } from "@phyllo/model";
import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { clipboardOf } from "../../../hooks/useClipboard";
import type { ClipboardItem } from "../../../state/clipboardStore";
import { acceleratorFor } from "../../shell/shortcuts";
import { TRACK_KINDS, wholeBarStep } from "./timelineModel";
import type { Snap } from "./timelineModel";
import type { TimelineActions } from "./useTimelineActions";

/** The Timeline commands the right-click menus use; the builders below are pure functions of the model and these. */
export type TimelineMenuCommands = Pick<
  TimelineActions,
  "dispatch" | "batch" | "select" | "seek" | "playFrom" | "setLoop" | "toggleLoop" | "addTrack" | "copy"
>;

type Range = { startBar: number; endBar: number };

/** First bar of the snap cell that holds the whole bar `bar` (what the Draw tool and the ⇧-drag loop anchor to). */
export function cellStart(bar: number, snap: Snap): number {
  const step = wholeBarStep(snap);
  return 1 + Math.floor((bar - 1) / step) * step;
}

/** Last bar of that cell, kept inside the song. */
export function cellEnd(bar: number, snap: Snap, lengthBars: number): number {
  return Math.min(lengthBars, cellStart(bar, snap) + wholeBarStep(snap) - 1);
}

/** "Section 5": the first `Section N` (counting on from the number of sections) no section has. */
export function newSectionName(sections: readonly Section[]): string {
  const taken = new Set(sections.map((s) => s.name));
  let n = sections.length + 1;
  while (taken.has(`Section ${n}`)) n += 1;
  return `Section ${n}`;
}

/**
 * Where a clip drawn from the menu goes: the cell under the pointer (like a Draw-tool click), cut back so it never
 * overlaps a neighbour. Null when a clip already covers `bar` or the cell starts past the song end.
 */
export function drawRangeAt(clips: readonly Clip[], bar: number, snap: Snap, lengthBars: number): Range | null {
  const anchor = cellStart(bar, snap);
  if (anchor > lengthBars || clips.some((c) => c.startBar <= bar && bar <= c.endBar)) return null;
  const free = clips.reduce(
    (span, c) => (c.endBar < bar ? { ...span, from: Math.max(span.from, c.endBar + 1) } : { ...span, to: Math.min(span.to, c.startBar - 1) }),
    { from: 1, to: lengthBars },
  );
  return { startBar: Math.max(anchor, free.from), endBar: Math.min(anchor + wholeBarStep(snap) - 1, free.to, lengthBars) };
}

/**
 * Range of a section added at `start`: up to the end of the section it splits, else up to the bar before the next
 * section, else the song end. Never swallows a whole existing section.
 */
export function sectionRangeFrom(sections: readonly Section[], start: number, lengthBars: number): Range {
  const containing = sections.find((s) => s.startBar <= start && start <= s.endBar);
  if (containing) return { startBar: start, endBar: containing.endBar };
  const next = Math.min(lengthBars + 1, ...sections.filter((s) => s.startBar > start).map((s) => s.startBar));
  return { startBar: start, endBar: next - 1 };
}

function addTrackSubmenu(commands: TimelineMenuCommands): MenuEntryInput {
  return {
    type: "submenu",
    id: "addTrack",
    label: "Add track",
    items: TRACK_KINDS.map(({ kind, label, hint }) => ({
      id: `addTrack-${kind}`,
      label,
      title: hint,
      onSelect: () => {
        commands.addTrack(kind);
      },
    })),
  };
}

/** Context passed to `clipMenuEntries`. */
export interface ClipMenuContext {
  clipboard: ClipboardItem | null;
  /** The playhead's 1-based bar when the menu opened. */
  playheadBar: number;
  /** Open the Pattern editor on the clip's track; omit when the screen can't (Edit pattern is then disabled). */
  editPattern?: (trackId: string) => void;
}

/** Right-click menu of a clip. Empty when the clip no longer exists. */
export function clipMenuEntries(
  project: Project,
  trackId: string,
  clipId: string,
  context: ClipMenuContext,
  commands: TimelineMenuCommands,
): MenuEntryInput[] {
  const track = findTrack(project, trackId);
  const clip = track?.clips.find((c) => c.id === clipId);
  if (!track || !clip) return [];
  const { dispatch } = commands;
  const afterBar = clip.endBar + 1;
  // A copy that starts past the song end has nowhere to go; one that only runs past it is shortened by the model.
  const roomAfter = afterBar <= project.lengthBars;
  const shortened = roomAfter && afterBar + (clip.endBar - clip.startBar) > project.lengthBars;
  const pasted = clipboardOf(context.clipboard, "clip");
  const canSplit = clip.startBar < context.playheadBar && context.playheadBar <= clip.endBar;
  const place = (copy: Clip) => dispatch({ type: "clip/add", trackId, clip: copy });

  return [
    {
      id: "editPattern",
      label: "Edit pattern",
      accelerator: "Enter",
      disabled: track.kind === "code" || !context.editPattern,
      title: track.kind === "code" ? "Code tracks are edited in the code drawer" : undefined,
      onSelect: () => context.editPattern?.(trackId),
    },
    {
      id: "split",
      label: "Split at playhead",
      disabled: !canSplit,
      title: canSplit ? undefined : "Move the playhead inside the clip to split it",
      onSelect: () =>
        dispatch({ type: "clip/split", trackId, clipId, atBar: context.playheadBar, newClipId: newId("clip_") }),
    },
    MENU_SEPARATOR,
    {
      id: "duplicate",
      label: "Duplicate",
      disabled: !roomAfter,
      title: !roomAfter ? "No room after the clip before the song ends" : shortened ? "The copy is shortened to fit the song end" : undefined,
      onSelect: () => place(cloneClip(clip, afterBar)),
    },
    { id: "copy", label: "Copy clip", onSelect: () => commands.copy({ kind: "clip", clip }) },
    {
      id: "paste",
      label: "Paste clip after",
      disabled: !pasted || !roomAfter,
      title: pasted && !roomAfter ? "No room after the clip before the song ends" : undefined,
      onSelect: () => {
        if (pasted) place(cloneClip(pasted.clip, afterBar));
      },
    },
    MENU_SEPARATOR,
    {
      id: "loop",
      label: "Loop this clip",
      onSelect: () => commands.setLoop({ enabled: true, startBar: clip.startBar, endBar: clip.endBar }),
    },
    MENU_SEPARATOR,
    {
      id: "delete",
      label: "Delete clip",
      accelerator: "Delete",
      destructive: true,
      onSelect: () => dispatch({ type: "clip/remove", trackId, clipId }),
    },
  ];
}

/** Right-click menu of the empty part of a lane, at the whole bar `bar` under the pointer (or the playhead). */
export function laneMenuEntries(
  project: Project,
  trackId: string,
  bar: number,
  snap: Snap,
  clipboard: ClipboardItem | null,
  commands: TimelineMenuCommands,
): MenuEntryInput[] {
  const track = findTrack(project, trackId);
  if (!track) return [];
  const range = drawRangeAt(track.clips, bar, snap, project.lengthBars);
  const anchor = cellStart(bar, snap);
  const pasted = clipboardOf(clipboard, "clip");
  return [
    {
      id: "drawClip",
      label: "Draw clip here",
      disabled: !range,
      title: range ? undefined : "A clip already covers this bar",
      onSelect: () => {
        if (range) commands.dispatch({ type: "clip/add", trackId, clip: { id: newId("clip_"), ...range } });
      },
    },
    {
      id: "pasteClip",
      label: "Paste clip here",
      disabled: !pasted || anchor > project.lengthBars,
      onSelect: () => {
        if (pasted) commands.dispatch({ type: "clip/add", trackId, clip: cloneClip(pasted.clip, anchor) });
      },
    },
    MENU_SEPARATOR,
    addTrackSubmenu(commands),
  ];
}

/** Right-click menu of the Timeline's empty background. */
export function backgroundMenuEntries(project: Project, clipboard: ClipboardItem | null, commands: TimelineMenuCommands): MenuEntryInput[] {
  const pasted = clipboardOf(clipboard, "track");
  return [
    addTrackSubmenu(commands),
    {
      id: "pasteTrack",
      label: "Paste track",
      disabled: !pasted,
      title: pasted ? `Add a copy of ${pasted.track.name} at the end` : "Copy a track first",
      onSelect: () => {
        if (!pasted) return;
        const track = cloneTrack(pasted.track, { existing: project.tracks });
        commands.batch(() => {
          commands.dispatch({ type: "track/add", track });
          commands.dispatch({ type: "ui/select", trackId: track.id });
        });
      },
    },
  ];
}

/** Adds a section and, when the surface can, opens its inline rename. */
function addSection(commands: TimelineMenuCommands, project: Project, range: Range, renameNew?: (sectionId: string) => void) {
  const section = createSection(newSectionName(project.sections), range.startBar, range.endBar);
  commands.dispatch({ type: "section/add", section });
  renameNew?.(section.id);
}

/** Context passed to `rulerMenuEntries`. */
export interface RulerMenuContext {
  /** Whole bar under the pointer, inside the song. */
  bar: number;
  /** Where a click on the ruler would seek: the pointer snapped to the grid, fractional bars allowed. */
  seekBar: number;
  snap: Snap;
  /** Opens the inline rename of a section the menu just added. */
  renameNewSection?: (sectionId: string) => void;
}

/** Right-click menu of the ruler at the bar under the pointer. */
export function rulerMenuEntries(project: Project, context: RulerMenuContext, commands: TimelineMenuCommands): MenuEntryInput[] {
  const { loop, lengthBars, sections } = project;
  const start = cellStart(context.bar, context.snap);
  const end = cellEnd(context.bar, context.snap, lengthBars);
  const startsHere = sections.some((s) => s.startBar === start);
  return [
    { id: "playFromHere", label: "Play from here", onSelect: () => commands.playFrom(context.seekBar) },
    MENU_SEPARATOR,
    {
      id: "loopStart",
      label: "Set loop start here",
      onSelect: () => commands.setLoop({ enabled: true, startBar: start, endBar: Math.max(loop.endBar, start) }),
    },
    {
      id: "loopEnd",
      label: "Set loop end here",
      onSelect: () => commands.setLoop({ enabled: true, startBar: Math.min(loop.startBar, end), endBar: end }),
    },
    { id: "loopToggle", label: "Loop", checked: loop.enabled, accelerator: acceleratorFor("transport.loop"), onSelect: commands.toggleLoop },
    MENU_SEPARATOR,
    {
      id: "addSection",
      label: "Add section here",
      disabled: startsHere,
      title: startsHere ? "A section already starts at this bar" : undefined,
      onSelect: () => addSection(commands, project, sectionRangeFrom(sections, start, lengthBars), context.renameNewSection),
    },
    // Inside the loop band (whose body passes right-clicks through to the ruler).
    loop.enabled && context.bar >= loop.startBar && context.bar <= loop.endBar && sectionFromLoopEntry(project, commands, context.renameNewSection),
    {
      id: "songEnd",
      label: "Set song end here",
      disabled: end === lengthBars,
      title: end === lengthBars ? undefined : "Clips, sections and the loop past this bar are trimmed",
      onSelect: () => commands.dispatch({ type: "project/setLength", lengthBars: Math.max(1, end) }),
    },
  ];
}

function sectionFromLoopEntry(
  project: Project,
  commands: TimelineMenuCommands,
  renameNewSection?: (sectionId: string) => void,
): MenuEntryInput {
  const { loop, sections } = project;
  // A section that would swallow whole sections is not an addition but a replacement; leave that to the user.
  const replaces = sections.some((s) => loop.startBar <= s.startBar && s.endBar <= loop.endBar);
  return {
    id: "sectionFromLoop",
    label: "Add section from loop",
    disabled: replaces,
    title: replaces ? "The loop already covers a whole section" : undefined,
    onSelect: () => addSection(commands, project, { startBar: loop.startBar, endBar: loop.endBar }, renameNewSection),
  };
}

/** Right-click menu of the loop band's grip and edges (the band itself lets pointer events through to the ruler). */
export function loopMenuEntries(
  project: Project,
  commands: TimelineMenuCommands,
  renameNewSection?: (sectionId: string) => void,
): MenuEntryInput[] {
  return [
    { id: "loopToggle", label: "Loop", checked: project.loop.enabled, accelerator: acceleratorFor("transport.loop"), onSelect: commands.toggleLoop },
    sectionFromLoopEntry(project, commands, renameNewSection),
  ];
}

/** Right-click menu of a section chip. Empty when the section no longer exists. */
export function sectionMenuEntries(
  project: Project,
  sectionId: string,
  commands: TimelineMenuCommands,
  rename?: () => void,
): MenuEntryInput[] {
  const section = project.sections.find((s) => s.id === sectionId);
  if (!section) return [];
  return [
    rename && { id: "rename", label: "Rename", accelerator: "F2", onSelect: rename },
    { id: "jump", label: "Jump to section", onSelect: () => commands.seek(section.startBar) },
    {
      id: "loop",
      label: "Loop section",
      onSelect: () => commands.setLoop({ enabled: true, startBar: section.startBar, endBar: section.endBar }),
    },
    MENU_SEPARATOR,
    { id: "delete", label: "Delete section", destructive: true, onSelect: () => commands.dispatch({ type: "section/remove", sectionId }) },
  ];
}
