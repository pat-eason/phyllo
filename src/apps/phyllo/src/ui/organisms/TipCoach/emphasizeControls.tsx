import type { ReactNode } from "react";

/** Guided control names in the tip copy, longest first, set in `--ph-text` bold (TipCard body convention). */
const CONTROL_NAMES = ["Copy strudel.cc link", "Edit pattern", "Brightness", "Starters", "Try one", "Pattern", "Export", "Mute", "Solo", "Play"];
const CONTROL_PATTERN = new RegExp(`\\b(${CONTROL_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "g");

/** Wraps the control names of a tip sentence in `<strong>`. */
export function emphasizeControls(body: string): ReactNode[] {
  return body.split(CONTROL_PATTERN).map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part));
}
