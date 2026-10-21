import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import styles from "./Punchcard.module.css";

export interface PunchcardRow {
  /** Fill for "on" cells: any CSS color, normally `var(--ph-track-n)`. */
  color: string;
  /** One boolean per step. Missing steps render off. */
  steps: boolean[];
}

/** `micro` is the 64 px list-row thumbnail, `card` the StarterCard preview, `xs`..`xl` the five groove tile steps. */
export type PunchcardSize = "micro" | "xs" | "sm" | "md" | "lg" | "xl" | "card";

export interface PunchcardProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  rows: PunchcardRow[];
  /** Cell height, gap and radius. Default `md`. */
  size?: PunchcardSize;
  /** Steps per row. Default 16. */
  columns?: number;
  /** Minimum number of rows drawn: fewer `rows` are padded with empty (all-off) rows so every card is the same height. Default 3. */
  rowCount?: number;
}

const EMPTY_STEPS: boolean[] = [];

/**
 * Internal 3 x 16 pattern preview (always at least `rowCount` rows) shared by StarterCard and GrooveCard. Purely decorative (`aria-hidden`); the parent
 * supplies the frame (padding, background) so the same grid works inside a card, a tile cover and a table cell.
 */
export const Punchcard = forwardRef<HTMLDivElement, PunchcardProps>(function Punchcard(
  { rows, size = "md", columns = 16, rowCount = 3, className, style, ...rest },
  ref,
) {
  const classes = className ? `${styles["punchcard"]} ${className}` : styles["punchcard"];
  const gridStyle = { ...style, "--ph-punch-cols": columns } as CSSProperties;
  // A 2-track groove would otherwise be one row (about 10 px) shorter than its 3-track neighbours.
  const padded: PunchcardRow[] = [...rows];
  while (padded.length < rowCount) padded.push({ color: "transparent", steps: EMPTY_STEPS });

  return (
    <div ref={ref} aria-hidden="true" className={classes} data-size={size} style={gridStyle} {...rest}>
      {padded.map((row, rowIndex) => (
        <div key={rowIndex} className={styles["row"]} style={{ "--ph-punch-color": row.color } as CSSProperties}>
          {Array.from({ length: columns }, (_, step) => (
            <span key={step} className={styles["cell"]} data-on={row.steps[step] ? "" : undefined} />
          ))}
        </div>
      ))}
    </div>
  );
});
