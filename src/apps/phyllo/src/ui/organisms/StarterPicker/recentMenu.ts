import type { GrooveSummary } from "@phyllo/model";
import type { MenuEntryInput } from "@phyllo/ui";

export interface RecentMenuCommands {
  open(groove: GrooveSummary): void;
  reveal(groove: GrooveSummary): void;
}

/** Right-click menu of a recent project on the Guided start page. */
export function recentMenuEntries(groove: GrooveSummary, commands: RecentMenuCommands): MenuEntryInput[] {
  return [
    { id: "open", label: "Open", onSelect: () => commands.open(groove) },
    { id: "reveal", label: "Show in Finder", onSelect: () => commands.reveal(groove) },
  ];
}
