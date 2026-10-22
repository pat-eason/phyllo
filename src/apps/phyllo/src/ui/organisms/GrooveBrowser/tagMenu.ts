import { MENU_SEPARATOR } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { sameTag } from "./tags";

/** What the sidebar's per-tag menu does. */
export interface TagMenuCommands {
  toggleFilter(tag: string): void;
  rename(tag: string): void;
  /** Rewrites `tag` as `into` in every groove that has it. */
  merge(tag: string, into: string): void;
  delete(tag: string): void;
}

/** The right-click menu of one tag in the library sidebar. `allTags` includes `tag` itself. */
export function tagMenuEntries(tag: string, allTags: readonly string[], filtering: boolean, commands: TagMenuCommands): MenuEntryInput[] {
  const others = allTags.filter((name) => !sameTag(name, tag));
  return [
    { id: "filter", label: "Show only this tag", checked: filtering, onSelect: () => commands.toggleFilter(tag) },
    MENU_SEPARATOR,
    { id: "rename", label: "Rename…", onSelect: () => commands.rename(tag) },
    {
      type: "submenu",
      id: "merge",
      label: "Merge into",
      items: others.map((name) => ({ id: name, label: name, onSelect: () => commands.merge(tag, name) })),
    },
    MENU_SEPARATOR,
    { id: "delete", label: "Delete…", destructive: true, onSelect: () => commands.delete(tag) },
  ];
}
