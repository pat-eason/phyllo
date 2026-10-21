import { GrooveCard } from "@phyllo/ui";
import type { GrooveSummary } from "@phyllo/model";
import type { CSSProperties } from "react";
import type { TileSize } from "../../../state/libraryStore";
import { toCardData } from "./format";
import styles from "./GrooveGrid.module.css";
import { contextAnchorFromKey } from "./interaction";
import type { GrooveHandlers } from "./interaction";

export interface GrooveGridProps extends GrooveHandlers {
  grooves: GrooveSummary[];
  size: TileSize;
  now: Date;
  /** Path of the groove being auditioned: its play button shows pause. */
  previewingPath: string | null;
}

/** Minimum tile width and gap by tile size step (SPEC §6.7). */
const TILE_LAYOUT: Record<TileSize, { min: number; gap: number }> = {
  1: { min: 150, gap: 6 },
  2: { min: 190, gap: 10 },
  3: { min: 240, gap: 14 },
  4: { min: 300, gap: 16 },
  5: { min: 380, gap: 18 },
};

/** Auto-filling CSS grid of GrooveCard tiles. */
export function GrooveGrid({ grooves, size, now, previewingPath, onOpen, onPreview, onFavoriteChange, onContextMenu }: GrooveGridProps) {
  const { min, gap } = TILE_LAYOUT[size];
  const style = { gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap } satisfies CSSProperties;

  return (
    <div className={styles["grid"]} style={style}>
      {grooves.map((groove) => (
        <GrooveCard
          key={groove.path}
          groove={toCardData(groove, now)}
          variant="tile"
          size={size}
          previewing={groove.path === previewingPath}
          onOpen={() => onOpen(groove)}
          onPreview={() => onPreview(groove)}
          onFavoriteChange={(favorite) => onFavoriteChange(groove, favorite)}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(groove, { x: event.clientX, y: event.clientY, trigger: null });
          }}
          onKeyDown={(event) => {
            const anchor = contextAnchorFromKey(event);
            if (!anchor) return;
            event.preventDefault();
            onContextMenu(groove, anchor);
          }}
        />
      ))}
    </div>
  );
}
