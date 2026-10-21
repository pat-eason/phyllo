/**
 * Icon path data on a 24x24 grid. Paths are copied verbatim from the design source
 * (`Kit.dc.html` `icons` array) except where noted on the entry.
 */

/** Six solid dots, same construction as the Kit's `dragDots`. */
const dot = (x: number, y: number) => `M${x - 1.5} ${y}a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0`;
const DRAG_DOTS = [dot(9, 6), dot(15, 6), dot(9, 12), dot(15, 12), dot(9, 18), dot(15, 18)].join("");

export const ICON_NAMES = [
  "play",
  "pause",
  "stop",
  "record",
  "to-start",
  "loop",
  "metronome",
  "sun",
  "moon",
  "search",
  "plus",
  "minus",
  "chevron-down",
  "close",
  "check",
  "folder",
  "code",
  "settings",
  "export",
  "star",
  "grid",
  "list",
  "select",
  "draw",
  "split",
  "tip",
  "drag",
  "clock",
  "arrow-right",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Icons drawn as solid shapes (no stroke), per the Icon doc. */
export const SOLID_ICONS: ReadonlySet<IconName> = new Set<IconName>(["play", "pause", "stop", "record", "drag"]);

export const ICON_PATHS: Record<IconName, string> = {
  play: "M7 4.5l13 7.5-13 7.5z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  stop: "M5 5h14v14H5z",
  record: "M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14z",
  "to-start": "M6 5v14M18 6l-9 6 9 6z",
  loop: "M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4",
  metronome: "M9 3h6l4 18H5zM12 16l5-8M7.5 14h9",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-3.5-3.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  // The Kit calls this icon `chevron`; the Icon doc names it `chevron-down`.
  "chevron-down": "M6 9l6 6 6-6",
  close: "M6 6l12 12M18 6L6 18",
  check: "M5 12l5 5 9-10",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  code: "M8 7l-5 5 5 5M16 7l5 5-5 5",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM10 15a2 2 0 1 0 0 4a2 2 0 1 0 0-4z",
  export: "M12 3v12M7 10l5 5 5-5M5 21h14",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z",
  grid: "M3.5 3.5h7v7h-7zM13.5 3.5h7v7h-7zM3.5 13.5h7v7h-7zM13.5 13.5h7v7h-7z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  select: "M5 3l14 8-6 2-2 6z",
  draw: "M4 20h4L19 9l-4-4L4 16z",
  split: "M6 4.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM6 14.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM8 8.5L20 18M8 15.5L20 6",
  tip: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z",
  drag: DRAG_DOTS,
  // Not in Kit.dc.html: path taken from Export.dc.html (circle r=9 + hands `M12 7v5l3 2`).
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2",
  // Not in Kit.dc.html: path taken from Onboarding.dc.html (Continue button).
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
};
