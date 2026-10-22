/**
 * Timeline view state shared by ViewToolbar and Timeline: edit tools, snap and zoom. Kept out of the project
 * model (except zoom, which the model stores in `ui.zoom`); the Arrange screen owns `tool` and `snap`.
 */

import type { TrackKind } from "@phyllo/model";

/** Pro pointer modes (SPEC §6.1, shortcuts V / B / S per §7). Guided always uses `select`. */
export type EditTool = "select" | "draw" | "split";

export const EDIT_TOOLS: readonly { value: EditTool; label: string; shortcut: string; icon: "select" | "draw" | "split" }[] = [
  { value: "select", label: "Select", shortcut: "V", icon: "select" },
  { value: "draw", label: "Draw", shortcut: "B", icon: "draw" },
  { value: "split", label: "Split", shortcut: "S", icon: "split" },
];

/** Grid size in bars, or `off`. Default `1`. */
export type Snap = "off" | "1/4" | "1/2" | "1" | "2" | "4";

export const DEFAULT_SNAP: Snap = "1";

export const SNAP_OPTIONS: readonly { value: Snap; label: string }[] = [
  { value: "1/4", label: "1/4 bar" },
  { value: "1/2", label: "1/2 bar" },
  { value: "1", label: "1 bar" },
  { value: "2", label: "2 bars" },
  { value: "4", label: "4 bars" },
  { value: "off", label: "Off" },
];

const SNAP_BARS: Record<Snap, number> = { off: 0, "1/4": 0.25, "1/2": 0.5, "1": 1, "2": 2, "4": 4 };

/** Grid size in bars; 0 when snap is off. */
export function snapBars(snap: Snap): number {
  return SNAP_BARS[snap];
}

/**
 * Step for clip and loop edits. Clips and loop bounds are whole bars in the model (`clampRange` rounds), so a
 * sub-bar or `off` snap still moves them by one bar.
 */
export function wholeBarStep(snap: Snap): number {
  return Math.max(1, Math.round(snapBars(snap)));
}

/** Snaps a 1-based fractional bar position to the grid (nearest line); `off` returns it unchanged. */
export function snapPosition(bar: number, snap: Snap): number {
  const unit = snapBars(snap);
  if (unit <= 0) return bar;
  return 1 + Math.round((bar - 1) / unit) * unit;
}

/** Rounds a bar delta to whole multiples of `step`. */
export function snapDelta(deltaBars: number, step: number): number {
  return Math.round(deltaBars / step) * step;
}

/** Bar width in px at zoom 1: 32 bars fill the 660 px lane area of the 1440 px Arrange mockup. */
export const BASE_BAR_PX = 20.625;

export function barWidthFor(zoom: number): number {
  return BASE_BAR_PX * (Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
}

/** Zoom ladder for the − / + buttons and ⌘-scroll (the model clamps to 0.25–8). */
export const ZOOM_STEPS: readonly number[] = [0.25, 0.375, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

export function zoomIn(zoom: number): number {
  return ZOOM_STEPS.find((z) => z > zoom + 1e-6) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? zoom;
}

export function zoomOut(zoom: number): number {
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 1e-6) ?? ZOOM_STEPS[0] ?? zoom;
}

export const MIN_ZOOM = ZOOM_STEPS[0] ?? 0.25;
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1] ?? 8;

/** "100%" */
export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** Track kinds the "Add track" menus offer (AddTrackRow and the context menus). */
export const TRACK_KINDS: readonly { kind: TrackKind; label: string; hint: string }[] = [
  { kind: "drum", label: "Drums", hint: "Drum machine pattern" },
  { kind: "melodic", label: "Melodic", hint: "Synth notes" },
  { kind: "chord", label: "Chords", hint: "Chord progression" },
  { kind: "sample", label: "Sample", hint: "Your own sound file" },
  { kind: "code", label: "Code", hint: "Free Strudel code" },
];
