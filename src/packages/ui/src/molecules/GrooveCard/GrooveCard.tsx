import { forwardRef, type HTMLAttributes, type Ref } from "react";
import { Chip } from "../../atoms/Chip";
import { Icon } from "../../atoms/Icon";
import { Punchcard, type PunchcardRow, type PunchcardSize } from "../_shared/Punchcard";
import styles from "./GrooveCard.module.css";

export interface GrooveTag {
  label: string;
  /** Tag palette color: any CSS color or `var(--ph-track-n)`. */
  color: string;
}

/** Display data for one saved groove. */
export interface GrooveCardData {
  name: string;
  bpm: number;
  /** "F major" */
  key: string;
  lengthBars: number;
  trackCount: number;
  tags: GrooveTag[];
  favorite: boolean;
  /** "Today, 12:41" */
  editedLabel: string;
  /** 3 rows x 16 steps from the first tracks. */
  preview: PunchcardRow[];
}

export type GrooveTileSize = 1 | 2 | 3 | 4 | 5;

export interface GrooveCardProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "onSelect"> {
  groove: GrooveCardData;
  /** `tile` renders an `<article>` for the grid; `row` renders a `<tr>` and must sit inside a `<tbody>`. Default `tile`. */
  variant?: "tile" | "row";
  /** Tile size step (tile only). Steps 1 and 2 hide the meta line and tags. Default 3. */
  size?: GrooveTileSize;
  /** The groove's preview is playing: the play button shows pause and `aria-pressed`. */
  previewing?: boolean;
  /** Disables the play button (preview unavailable, e.g. the groove file is missing). */
  previewDisabled?: boolean;
  /**
   * Multi-select state. Row: `aria-selected` plus an accent-soft background. Tile: accent border. Selection itself
   * (click, shift-click) is owned by the browser.
   */
  selected?: boolean;
  /** Cover or name click. */
  onOpen: () => void;
  /** Play button click: start (or stop) the looped preview. */
  onPreview: () => void;
  onFavoriteChange: (favorite: boolean) => void;
}

const COVER_CELL_SIZE: Record<GrooveTileSize, PunchcardSize> = { 1: "xs", 2: "sm", 3: "md", 4: "lg", 5: "xl" };

function metaLine({ bpm, key, lengthBars }: GrooveCardData): string {
  return `${bpm} BPM · ${key} · ${lengthBars} bars`;
}

interface FavoriteButtonProps {
  groove: GrooveCardData;
  onFavoriteChange: (favorite: boolean) => void;
}

function FavoriteButton({ groove, onFavoriteChange }: FavoriteButtonProps) {
  return (
    <button
      type="button"
      className={styles["favorite"]}
      aria-label={`Favorite ${groove.name}`}
      aria-pressed={groove.favorite}
      onClick={() => onFavoriteChange(!groove.favorite)}
    >
      <Icon name="star" size={16} filled={groove.favorite} />
    </button>
  );
}

interface PlayButtonProps {
  name: string;
  previewing: boolean;
  disabled: boolean;
  onPreview: () => void;
  className: string | undefined;
}

function PlayButton({ name, previewing, disabled, onPreview, className }: PlayButtonProps) {
  return (
    <button type="button" className={className} aria-label={`Play ${name}`} aria-pressed={previewing} disabled={disabled} onClick={onPreview}>
      <Icon name={previewing ? "pause" : "play"} size={10} />
    </button>
  );
}

function TagList({ tags }: { tags: GrooveTag[] }) {
  return (
    <span className={styles["tags"]}>
      {tags.map((tag) => (
        <Chip key={tag.label} variant="tag" color={tag.color}>
          {tag.label}
        </Chip>
      ))}
    </span>
  );
}

/**
 * One saved groove in the library, as a grid tile or a table row. Props are display data only; the browser owns
 * selection, preview playback and persistence. The cover/name is a button that calls `onOpen`.
 */
export const GrooveCard = forwardRef<HTMLElement, GrooveCardProps>(function GrooveCard(
  { groove, variant = "tile", size = 3, previewing = false, previewDisabled = false, selected = false, onOpen, onPreview, onFavoriteChange, className, ...rest },
  ref,
) {
  const classes = className ? `${styles[variant]} ${className}` : styles[variant];

  if (variant === "row") {
    return (
      <tr
        ref={ref as Ref<HTMLTableRowElement>}
        className={classes}
        aria-selected={selected || undefined}
        data-selected={selected ? "" : undefined}
        {...(rest as HTMLAttributes<HTMLTableRowElement>)}
      >
        <td className={styles["cellPlay"]}>
          <PlayButton
            name={groove.name}
            previewing={previewing}
            disabled={previewDisabled}
            onPreview={onPreview}
            className={styles["playRow"]}
          />
        </td>
        <td className={styles["cell"]}>
          <button type="button" className={styles["nameButton"]} onClick={onOpen}>
            <span className={styles["thumb"]}>
              <Punchcard rows={groove.preview} size="micro" />
            </span>
            <span className={styles["rowName"]}>{groove.name}</span>
          </button>
        </td>
        <td className={styles["cell"]}>
          <TagList tags={groove.tags} />
        </td>
        <td className={styles["cellMono"]}>{groove.bpm}</td>
        <td className={styles["cell"]}>{groove.key}</td>
        <td className={styles["cellMuted"]}>{`${groove.lengthBars} bars`}</td>
        <td className={styles["cellMuted"]}>{groove.trackCount === 1 ? "1 track" : `${groove.trackCount} tracks`}</td>
        <td className={styles["cellMuted"]}>{groove.editedLabel}</td>
        <td className={styles["cellFavorite"]}>
          <FavoriteButton groove={groove} onFavoriteChange={onFavoriteChange} />
        </td>
      </tr>
    );
  }

  const showDetails = size >= 3;

  return (
    <article ref={ref} className={classes} data-size={size} data-selected={selected ? "" : undefined} {...rest}>
      <div className={styles["coverFrame"]}>
        <button type="button" className={styles["cover"]} aria-label={`Open ${groove.name}`} onClick={onOpen}>
          <Punchcard rows={groove.preview} size={COVER_CELL_SIZE[size]} />
        </button>
        <PlayButton name={groove.name} previewing={previewing} disabled={previewDisabled} onPreview={onPreview} className={styles["play"]} />
      </div>
      <div className={styles["body"]}>
        <div className={styles["head"]}>
          <h3 className={styles["name"]}>{groove.name}</h3>
          <FavoriteButton groove={groove} onFavoriteChange={onFavoriteChange} />
        </div>
        {showDetails ? (
          <>
            <span className={styles["meta"]}>{metaLine(groove)}</span>
            {groove.tags.length > 0 ? <TagList tags={groove.tags} /> : null}
          </>
        ) : null}
        <span className={styles["edited"]}>{groove.editedLabel}</span>
      </div>
    </article>
  );
});
