import { findTrack } from "@phyllo/model";
import { useMemo } from "react";
import type { ContextMenuRequest } from "../../../hooks/useContextMenu";
import {
  backgroundMenuEntries,
  clipMenuEntries,
  laneMenuEntries,
  loopMenuEntries,
  rulerMenuEntries,
  sectionMenuEntries,
} from "./timelineMenus";
import type { RulerMenuContext } from "./timelineMenus";
import type { Snap } from "./timelineModel";
import type { TimelineActions } from "./useTimelineActions";

export interface TimelineMenus {
  /** Selects the clip's track (like a click), then returns the clip's menu. */
  clip(trackId: string, clipId: string, editPattern?: (trackId: string) => void): ContextMenuRequest | null;
  /** Selects the track, then returns the menu of its empty lane at whole bar `bar`. */
  lane(trackId: string, bar: number, snap: Snap): ContextMenuRequest;
  background(): ContextMenuRequest;
  ruler(context: RulerMenuContext): ContextMenuRequest;
  loop(renameNewSection?: (sectionId: string) => void): ContextMenuRequest;
  section(sectionId: string, rename?: () => void): ContextMenuRequest | null;
}

/**
 * Builds the Timeline's right-click menus at open time from the stores' current state (not render-time props), so a
 * menu always matches the model and the playhead as they are when it opens.
 */
export function useTimelineMenus(actions: TimelineActions): TimelineMenus {
  return useMemo<TimelineMenus>(() => {
    const selectTrack = (trackId: string) => {
      if (actions.getProject().ui.selectedTrack !== trackId) actions.select(trackId);
    };
    return {
      clip(trackId, clipId, editPattern) {
        const track = findTrack(actions.getProject(), trackId);
        if (!track) return null;
        selectTrack(trackId);
        const context = { clipboard: actions.clipboard(), playheadBar: actions.playheadBar(), ...(editPattern ? { editPattern } : {}) };
        return { label: `Clip on ${track.name}`, entries: clipMenuEntries(actions.getProject(), trackId, clipId, context, actions) };
      },
      lane(trackId, bar, snap) {
        selectTrack(trackId);
        const project = actions.getProject();
        const name = findTrack(project, trackId)?.name ?? "track";
        return { label: `Lane ${name}`, entries: laneMenuEntries(project, trackId, bar, snap, actions.clipboard(), actions) };
      },
      background: () => ({ label: "Timeline", entries: backgroundMenuEntries(actions.getProject(), actions.clipboard(), actions) }),
      ruler: (context) => ({ label: "Ruler", entries: rulerMenuEntries(actions.getProject(), context, actions) }),
      loop: (renameNewSection) => ({ label: "Loop region", entries: loopMenuEntries(actions.getProject(), actions, renameNewSection) }),
      section(sectionId, rename) {
        const project = actions.getProject();
        const section = project.sections.find((s) => s.id === sectionId);
        if (!section) return null;
        return { label: `Section ${section.name}`, entries: sectionMenuEntries(project, sectionId, actions, rename) };
      },
    };
  }, [actions]);
}
