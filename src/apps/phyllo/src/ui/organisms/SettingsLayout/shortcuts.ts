export interface Shortcut {
  action: string;
  /** One or more alternatives, each a key list for `Kbd`. */
  keys: readonly (readonly string[])[];
}

export interface ShortcutGroup {
  title: string;
  shortcuts: readonly Shortcut[];
}

/** SPEC §7 and the menu bar's accelerators (`MENU_ACTIONS`). ⌘ is Ctrl on Windows and Linux. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: "Transport",
    shortcuts: [
      { action: "Play / pause", keys: [["Space"]] },
      { action: "Stop and return", keys: [["⏎"]] },
      { action: "Loop on / off", keys: [["L"]] },
      { action: "Arm recording", keys: [["R"]] },
    ],
  },
  {
    title: "Tracks and tools",
    shortcuts: [
      { action: "Mute selected track", keys: [["M"]] },
      { action: "Solo selected track", keys: [["S"]] },
      { action: "Select tool", keys: [["V"]] },
      { action: "Draw tool", keys: [["B"]] },
      { action: "Split tool", keys: [["S"]] },
      { action: "Undo", keys: [["⌘", "Z"]] },
      { action: "Redo", keys: [["⇧", "⌘", "Z"]] },
    ],
  },
  {
    title: "Sounds",
    shortcuts: [
      { action: "Quick add a sound", keys: [["⌘", "K"]] },
      { action: "Insert the sound onto the selected track", keys: [["⏎"]] },
      { action: "Drop a sound as a layer", keys: [["⇧"]] },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { action: "Arrange / Pattern / Mixer", keys: [["⌘", "1"], ["⌘", "2"], ["⌘", "3"]] },
      { action: "Groove library", keys: [["⇧", "⌘", "L"]] },
      { action: "Show or hide the code drawer", keys: [["⌘", "/"]] },
      { action: "Switch Guided / Pro", keys: [["⇧", "⌘", "G"]] },
      { action: "Settings", keys: [["⌘", ","]] },
    ],
  },
  {
    title: "File",
    shortcuts: [
      { action: "New", keys: [["⌘", "N"]] },
      { action: "Open", keys: [["⌘", "O"]] },
      { action: "Save", keys: [["⌘", "S"]] },
      { action: "Save as", keys: [["⇧", "⌘", "S"]] },
      { action: "Export", keys: [["⌘", "E"]] },
    ],
  },
];
