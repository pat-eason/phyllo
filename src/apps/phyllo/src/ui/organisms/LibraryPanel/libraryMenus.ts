import type { DrumBank, Project, ProjectAction, Track } from "@phyllo/model";
import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput, SoundRef } from "@phyllo/ui";
import { layerSoundActions, replaceSoundActions } from "../Timeline/soundDrop";

/** Right-click menus of the Sound library: pure builders, wired to the stores by `useLibraryMenus`. */

const selectedTrackOf = (project: Project): Track | undefined => project.tracks.find((t) => t.id === project.ui.selectedTrack);

/** The kind of track a sound replaces the sound of (`replaceSoundActions`' rules), for the disabled hint. */
function fittingTracks(ref: SoundRef): string {
  switch (ref.source) {
    case "bank":
      return "a drum track";
    case "sample":
      return "a sample track";
    default:
      return "a melodic or chord track";
  }
}

export interface SoundPlacement {
  track: Track | undefined;
  /** What Replace would do; null = the kinds don't fit, `[]` = nothing would change. Undefined without a selected track. */
  replace: ProjectAction[] | null | undefined;
  /** What Layer would do; null = not possible (code track). Undefined without a selected track. */
  layer: ProjectAction[] | null | undefined;
}

/** What the explicit placements would do for `ref` on the selected track (the same helpers the Timeline drop uses). */
export function soundPlacement(project: Project, ref: SoundRef): SoundPlacement {
  const track = selectedTrackOf(project);
  return {
    track,
    replace: track ? replaceSoundActions(track, ref) : undefined,
    layer: track ? layerSoundActions(track, ref) : undefined,
  };
}

export interface SoundMenuCommands {
  preview(): void;
  replace(): void;
  layer(): void;
  addTrack(): void;
  /** Reveal the sound's file; omit for built-in sounds. */
  reveal?: () => void;
}

/** Drum, sample, synth or instrument: audition it, then say exactly where it goes (Enter picks for you). */
export function soundMenuEntries(project: Project, ref: SoundRef, previewing: boolean, commands: SoundMenuCommands): MenuEntryInput[] {
  const { track, replace, layer } = soundPlacement(project, ref);
  const quoted = track ? `“${track.name}”` : "selected track";

  let replaceReason: string | undefined;
  if (!track) replaceReason = "Select a track first";
  else if (replace === null) replaceReason = `Needs ${fittingTracks(ref)}; ${quoted} is a ${track.kind} track`;
  else if (replace?.length === 0) replaceReason = `Nothing to replace: ${quoted} already uses this sound or plays several`;

  let layerReason: string | undefined;
  if (!track) layerReason = "Select a track first";
  else if (layer === null) layerReason = "Code tracks can't take layers";

  return [
    { id: "preview", label: previewing ? "Stop preview" : "Preview", accelerator: "Space", onSelect: commands.preview },
    MENU_SEPARATOR,
    { id: "replace", label: `Replace sound on ${quoted}`, disabled: replaceReason !== undefined, title: replaceReason, onSelect: commands.replace },
    { id: "layer", label: `Layer onto ${quoted}`, disabled: layerReason !== undefined, title: layerReason, onSelect: commands.layer },
    { id: "addTrack", label: "Add as new track", onSelect: commands.addTrack },
    commands.reveal && MENU_SEPARATOR,
    commands.reveal && { id: "reveal", label: "Show in Finder", onSelect: commands.reveal },
  ];
}

export interface BankMenuCommands {
  filter(): void;
  useOnTrack(): void;
}

/** A drum-machine chip: filter the list by it, or switch the selected drum track to it. */
export function bankMenuEntries(project: Project, bank: DrumBank, showing: boolean, commands: BankMenuCommands): MenuEntryInput[] {
  const track = selectedTrackOf(project);
  const quoted = track ? `“${track.name}”` : "selected drum track";
  let useReason: string | undefined;
  if (!track) useReason = "Select a drum track first";
  else if (track.kind !== "drum") useReason = `${quoted} isn't a drum track`;
  else if (track.source.bank === bank.code) useReason = `${quoted} already uses ${bank.name}`;

  return [
    {
      id: "filter",
      label: "Filter by this bank",
      disabled: showing,
      title: showing ? `Already showing ${bank.name}` : undefined,
      onSelect: commands.filter,
    },
    { id: "use", label: `Use on ${quoted}`, disabled: useReason !== undefined, title: useReason, onSelect: commands.useOnTrack },
  ];
}

export interface SnippetMenuCommands {
  add(): void;
  copy(): void;
}

/** A Pro snippet: add it to the selected track, or copy its code. */
export function snippetMenuEntries(project: Project, commands: SnippetMenuCommands): MenuEntryInput[] {
  const track = selectedTrackOf(project);
  return [
    {
      id: "add",
      label: track ? `Add to “${track.name}”` : "Add to selected track",
      accelerator: "Enter",
      disabled: !track,
      title: track ? undefined : "Select a track first",
      onSelect: commands.add,
    },
    { id: "copy", label: "Copy code", onSelect: commands.copy },
  ];
}

export interface FolderMenuCommands {
  reveal(): void;
  rescan(): void;
  unlink(): void;
}

/** A linked sample folder. */
export function folderMenuEntries(commands: FolderMenuCommands): MenuEntryInput[] {
  return [
    { id: "reveal", label: "Show in Finder", onSelect: commands.reveal },
    { id: "rescan", label: "Rescan", onSelect: commands.rescan },
    MENU_SEPARATOR,
    { id: "unlink", label: "Unlink folder", destructive: true, onSelect: commands.unlink },
  ];
}

/** A Guided starter card. */
export function starterMenuEntries(start: () => void): MenuEntryInput[] {
  return [{ id: "start", label: "Start new groove from this", onSelect: start }];
}
