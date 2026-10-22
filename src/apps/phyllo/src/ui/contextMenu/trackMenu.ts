import { TRACK_COLORS, cloneTrack, findTrack } from "@phyllo/model";
import type { Project, ProjectAction, Track } from "@phyllo/model";
import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { useMemo } from "react";
import { clipboardOf } from "../../hooks/useClipboard";
import type { ContextMenuRequest } from "../../hooks/useContextMenu";
import type { ClipboardItem } from "../../state/clipboardStore";
import { useAppStores } from "../../state/context";
import { navigate } from "../shell/router";
import { acceleratorFor } from "../shell/shortcuts";

/** Names for `TRACK_COLORS`, in palette order. */
export const TRACK_COLOR_NAMES: Readonly<Record<string, string>> = {
  "#7FD98A": "Green",
  "#5ECFC8": "Teal",
  "#8AB4FF": "Blue",
  "#F5C25B": "Amber",
  "#B9A2FF": "Violet",
  "#F59AC7": "Pink",
  "#FF9C7A": "Coral",
};

/** What the track menu does; `trackMenuEntries` stays pure so it can be tested without stores. */
export interface TrackMenuCommands {
  /** One undo step for several actions. */
  batch(fn: () => void): void;
  dispatch(action: ProjectAction): void;
  editPattern(trackId: string): void;
  copy(item: ClipboardItem): void;
  /** Inline rename where the menu was opened; omit to leave Rename out. */
  rename?: () => void;
}

export interface TrackMenuOptions {
  /** Extra entries after the track's own (e.g. Mixer "Reset volume"). */
  extra?: MenuEntryInput[];
}

const copyOf = (project: Project, source: Track): Track => cloneTrack(source, { existing: project.tracks });

/** Insert `track` at `index`, select it: one undo step. */
function insertTrack(commands: TrackMenuCommands, track: Track, index: number) {
  commands.batch(() => {
    commands.dispatch({ type: "track/add", track, index });
    commands.dispatch({ type: "ui/select", trackId: track.id });
  });
}

/**
 * The right-click menu of a track, shared by the Timeline header, the Inspector header and the Mixer strip, so they
 * never disagree. Empty when the track no longer exists.
 */
export function trackMenuEntries(
  project: Project,
  trackId: string,
  clipboard: ClipboardItem | null,
  commands: TrackMenuCommands,
  options: TrackMenuOptions = {},
): MenuEntryInput[] {
  const track = findTrack(project, trackId);
  if (!track) return [];
  const index = project.tracks.indexOf(track);
  const { dispatch, batch } = commands;
  const pasted = clipboardOf(clipboard, "track");
  const otherSolos = project.tracks.some((t) => t.id !== trackId && t.solo);
  const orbits = [...new Set([...project.tracks.map((t) => t.orbit), track.orbit])].sort((a, b) => a - b);
  const used = new Set(project.tracks.map((t) => t.orbit));
  let newOrbit = 1;
  while (used.has(newOrbit)) newOrbit += 1;

  return [
    commands.rename && { id: "rename", label: "Rename", accelerator: "F2", onSelect: commands.rename },
    {
      id: "editPattern",
      label: "Edit pattern",
      disabled: track.kind === "code",
      title: track.kind === "code" ? "Code tracks are edited in the code drawer" : undefined,
      onSelect: () => commands.editPattern(trackId),
    },
    MENU_SEPARATOR,
    {
      id: "mute",
      label: "Mute",
      checked: track.mute,
      accelerator: acceleratorFor("track.mute"),
      onSelect: () => dispatch({ type: "track/setMute", trackId, mute: !track.mute }),
    },
    { id: "solo", label: "Solo", checked: track.solo, onSelect: () => dispatch({ type: "track/setSolo", trackId, solo: !track.solo }) },
    {
      id: "soloExclusive",
      label: "Solo only this",
      disabled: track.solo && !otherSolos,
      onSelect: () =>
        batch(() => {
          for (const t of project.tracks) {
            const solo = t.id === trackId;
            if (t.solo !== solo) dispatch({ type: "track/setSolo", trackId: t.id, solo });
          }
        }),
    },
    MENU_SEPARATOR,
    {
      type: "submenu",
      id: "color",
      label: "Colour",
      items: TRACK_COLORS.map((color) => ({
        id: color,
        label: TRACK_COLOR_NAMES[color] ?? color,
        swatch: color,
        checked: color.toLowerCase() === track.color.toLowerCase(),
        onSelect: () => dispatch({ type: "track/update", trackId, patch: { color } }),
      })),
    },
    {
      type: "submenu",
      id: "bus",
      label: "Bus",
      items: [
        ...orbits.map((orbit) => ({
          id: `orbit-${orbit}`,
          label: `Orbit ${orbit}`,
          checked: orbit === track.orbit,
          onSelect: () => dispatch({ type: "track/setOrbit", trackId, orbit }),
        })),
        MENU_SEPARATOR,
        { id: "newBus", label: `New bus (orbit ${newOrbit})`, onSelect: () => dispatch({ type: "track/setOrbit", trackId, orbit: newOrbit }) },
      ],
    },
    { id: "moveUp", label: "Move up", disabled: index === 0, onSelect: () => dispatch({ type: "track/move", trackId, toIndex: index - 1 }) },
    {
      id: "moveDown",
      label: "Move down",
      disabled: index === project.tracks.length - 1,
      onSelect: () => dispatch({ type: "track/move", trackId, toIndex: index + 1 }),
    },
    MENU_SEPARATOR,
    { id: "copy", label: "Copy track", onSelect: () => commands.copy({ kind: "track", track }) },
    {
      id: "paste",
      label: pasted ? `Paste "${pasted.track.name}" below` : "Paste track below",
      disabled: !pasted,
      onSelect: () => {
        if (pasted) insertTrack(commands, copyOf(project, pasted.track), index + 1);
      },
    },
    { id: "duplicate", label: "Duplicate", onSelect: () => insertTrack(commands, copyOf(project, track), index + 1) },
    ...(options.extra ?? []),
    MENU_SEPARATOR,
    {
      id: "delete",
      label: "Delete track",
      destructive: true,
      onSelect: () => dispatch({ type: "track/remove", trackId }),
    },
  ];
}

export interface UseTrackMenuOptions extends TrackMenuOptions {
  /** Inline rename for this track, if the surface has one. */
  rename?: (trackId: string) => void;
  /** Select the track when its menu opens (DAW convention). Default true. */
  select?: boolean;
}

/**
 * `build(trackId)` for `useContextMenuTrigger`: selects the track, then returns its menu built from the stores'
 * current state (not render-time props).
 */
export function useTrackMenu(): (trackId: string, options?: UseTrackMenuOptions) => ContextMenuRequest | null {
  const stores = useAppStores();
  return useMemo(() => {
    const store = () => stores.project.getState();
    const commands: Omit<TrackMenuCommands, "rename"> = {
      dispatch: (action) => store().dispatch(action),
      batch(fn) {
        store().beginGesture();
        try {
          fn();
        } finally {
          store().endGesture();
        }
      },
      editPattern(trackId) {
        store().dispatch({ type: "ui/select", trackId });
        navigate({ screen: "pattern", trackId });
      },
      copy: (item) => stores.clipboard.getState().copy(item),
    };
    return (trackId, options = {}) => {
      const project = store().project;
      const track = findTrack(project, trackId);
      if (!track) return null;
      if (options.select !== false && project.ui.selectedTrack !== trackId) store().dispatch({ type: "ui/select", trackId });
      const rename = options.rename;
      return {
        label: `Track ${track.name}`,
        entries: trackMenuEntries(
          store().project,
          trackId,
          stores.clipboard.getState().item,
          { ...commands, rename: rename ? () => rename(trackId) : undefined },
          options,
        ),
      };
    };
  }, [stores]);
}
