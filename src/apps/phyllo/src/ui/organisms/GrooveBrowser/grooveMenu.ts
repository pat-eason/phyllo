import type { GrooveSummary } from "@phyllo/model";
import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";

/** What the groove menu does; the browser wires these to the same actions the tiles, rows and dialogs use. */
export interface GrooveMenuCommands {
  open(groove: GrooveSummary): void;
  rename(groove: GrooveSummary): void;
  duplicate(groove: GrooveSummary): void;
  reveal(groove: GrooveSummary): void;
  editTags(targets: GrooveSummary[]): void;
  /** Sets the favourite flag on every target that doesn't have it yet. */
  setFavorite(targets: GrooveSummary[], favorite: boolean): void;
  trash(targets: GrooveSummary[]): void;
}

/**
 * The right-click menu of one groove, or of the grooves selected in the list. Several grooves get only what works
 * on all of them. Empty when `targets` is.
 */
export function grooveMenuEntries(targets: GrooveSummary[], commands: GrooveMenuCommands): MenuEntryInput[] {
  const [first] = targets;
  if (!first) return [];
  if (targets.length > 1) {
    const allFavorite = targets.every((groove) => groove.favorite);
    return [
      { id: "tags", label: "Edit tags…", onSelect: () => commands.editTags(targets) },
      {
        id: "favorite",
        label: allFavorite ? "Unfavourite all" : "Favourite all",
        onSelect: () => commands.setFavorite(targets, !allFavorite),
      },
      MENU_SEPARATOR,
      { id: "trash", label: "Move to Trash…", destructive: true, onSelect: () => commands.trash(targets) },
    ];
  }
  return [
    { id: "open", label: "Open", onSelect: () => commands.open(first) },
    { id: "rename", label: "Rename…", onSelect: () => commands.rename(first) },
    { id: "duplicate", label: "Duplicate", onSelect: () => commands.duplicate(first) },
    MENU_SEPARATOR,
    { id: "favorite", label: "Favourite", checked: first.favorite, onSelect: () => commands.setFavorite([first], !first.favorite) },
    { id: "tags", label: "Edit tags…", onSelect: () => commands.editTags([first]) },
    MENU_SEPARATOR,
    { id: "reveal", label: "Show in Finder", onSelect: () => commands.reveal(first) },
    MENU_SEPARATOR,
    { id: "trash", label: "Move to Trash…", destructive: true, onSelect: () => commands.trash([first]) },
  ];
}
