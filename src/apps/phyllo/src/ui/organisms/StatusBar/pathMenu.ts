import type { MenuEntryInput } from "@phyllo/ui";

export interface PathMenuCommands {
  reveal(): void;
  copyPath(): void;
}

/** Right-click menu of the file path in the status bar. */
export function pathMenuEntries(commands: PathMenuCommands): MenuEntryInput[] {
  return [
    { id: "reveal", label: "Show in Finder", onSelect: commands.reveal },
    { id: "copyPath", label: "Copy path", onSelect: commands.copyPath },
  ];
}
