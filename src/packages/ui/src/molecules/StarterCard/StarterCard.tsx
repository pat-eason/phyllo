import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Chip } from "../../atoms/Chip";
import { Icon } from "../../atoms/Icon";
import { Punchcard, type PunchcardRow } from "../_shared/Punchcard";
import styles from "./StarterCard.module.css";

export interface StarterCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onSelect"> {
  /** "House groove" */
  name: string;
  /** One line. */
  description: string;
  bpm: number;
  /** A count renders "4 tracks"; `"Empty"` renders as is (Blank project). */
  trackCount: number | "Empty";
  /** 3 rows x 16 steps; row color is the track color. */
  preview: PunchcardRow[];
  selected: boolean;
  onSelect: () => void;
}

function trackLabel(trackCount: number | "Empty"): string {
  if (trackCount === "Empty") return "Empty";
  return trackCount === 1 ? "1 track" : `${trackCount} tracks`;
}

/**
 * Selectable project template. A `<button aria-pressed>`; the parent owns single-select and should wrap the cards
 * in a group labelled "Starters". Double-click and other native handlers pass straight through.
 */
export const StarterCard = forwardRef<HTMLButtonElement, StarterCardProps>(function StarterCard(
  { name, description, bpm, trackCount, preview, selected, onSelect, className, onClick, type = "button", ...rest },
  ref,
) {
  const classes = className ? `${styles["card"]} ${className}` : styles["card"];

  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected}
      className={classes}
      data-selected={selected ? "" : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onSelect();
      }}
      {...rest}
    >
      <span className={styles["preview"]}>
        <Punchcard rows={preview} size="card" />
      </span>
      <span className={styles["text"]}>
        <span className={styles["name"]}>{name}</span>
        <span className={styles["description"]}>{description}</span>
      </span>
      <span className={styles["meta"]}>
        <Chip variant="meta">{`${bpm} BPM`}</Chip>
        <Chip variant="meta">{trackLabel(trackCount)}</Chip>
      </span>
      {selected ? (
        <span className={styles["check"]} aria-hidden="true">
          <Icon name="check" size={12} strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
});
