export const SETTINGS_SECTIONS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "audio", label: "Audio" },
  { id: "midi", label: "MIDI & OSC" },
  { id: "library", label: "Sample folders" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "editor", label: "Code editor" },
  { id: "system", label: "System" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** DOM id of a section (the nav scrolls to it). Prefixed so it can't collide with other ids on the page. */
export const sectionDomId = (id: SettingsSectionId) => `settings-${id}`;
