import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { acceleratorFor } from "../../shell/shortcuts";

/** What the project menu does, shared by the name button's dropdown and its right-click menu. */
export interface ProjectMenuCommands {
  rename(): void;
  save(): void;
  saveAs(): void;
  /** Left out of the menu when the project has no file yet. */
  reveal?: (() => void) | undefined;
  /** Disabled when missing. */
  versionHistory?: (() => void) | undefined;
  /** Left out of the menu when missing. */
  exportProject?: (() => void) | undefined;
}

export interface ProjectMenuState {
  saving: boolean;
}

/** The two halves of the menu: file actions, then history and export. The dropdown puts Recent between them. */
export interface ProjectMenuGroups {
  file: MenuEntryInput[];
  more: MenuEntryInput[];
}

/** Single source of the project menu's items, so the dropdown and the right-click menu cannot drift apart. */
export function projectMenuGroups(state: ProjectMenuState, commands: ProjectMenuCommands): ProjectMenuGroups {
  return {
    file: [
      { id: "rename", label: "Rename", onSelect: commands.rename },
      { id: "save", label: "Save", disabled: state.saving, accelerator: acceleratorFor("file.save"), onSelect: commands.save },
      { id: "saveAs", label: "Save As…", accelerator: acceleratorFor("file.saveAs"), onSelect: commands.saveAs },
      commands.reveal && { id: "reveal", label: "Show in Finder", onSelect: commands.reveal },
    ],
    more: [
      {
        id: "history",
        label: "Version History…",
        disabled: !commands.versionHistory,
        accelerator: acceleratorFor("file.history"),
        onSelect: () => commands.versionHistory?.(),
      },
      commands.exportProject && { id: "export", label: "Export…", accelerator: acceleratorFor("file.export"), onSelect: commands.exportProject },
    ],
  };
}

/** The right-click menu: both halves in one list. */
export function projectMenuEntries(state: ProjectMenuState, commands: ProjectMenuCommands): MenuEntryInput[] {
  const { file, more } = projectMenuGroups(state, commands);
  return [...file, MENU_SEPARATOR, ...more];
}
