import type { Track } from "@phyllo/model";
import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";

export interface CodeMenuCommands {
  selectTrack(trackId: string): void;
  editPattern(trackId: string): void;
  copyCode(): void;
  copyLink(): void;
}

/**
 * Right-click menu of the generated code. `track` is the track whose block holds the clicked line (null for the
 * margin or a line outside any block); the copy items are always there.
 */
export function codeMenuEntries(track: Track | null, commands: CodeMenuCommands): MenuEntryInput[] {
  return [
    track && { id: "select", label: `Select "${track.name}"`, onSelect: () => commands.selectTrack(track.id) },
    track && {
      id: "editPattern",
      label: "Edit pattern",
      disabled: track.kind === "code",
      title: track.kind === "code" ? "Code tracks are edited in the code drawer" : undefined,
      onSelect: () => commands.editPattern(track.id),
    },
    track && MENU_SEPARATOR,
    { id: "copyCode", label: "Copy all code", onSelect: commands.copyCode },
    { id: "copyLink", label: "Copy strudel.cc link", onSelect: commands.copyLink },
  ];
}
