import { Icon, SegmentedControl, Select, Slider, TextField } from "@phyllo/ui";
import type { SegmentedOption, SelectOption } from "@phyllo/ui";
import type { LibrarySort, LibraryView } from "@phyllo/model";
import type { TileSize } from "../../../state/libraryStore";
import styles from "./LibraryToolbar.module.css";

export interface LibraryToolbarProps {
  searchText: string;
  onSearchTextChange: (text: string) => void;
  sort: LibrarySort;
  onSortChange: (sort: LibrarySort) => void;
  tileSize: TileSize;
  onTileSizeChange: (size: TileSize) => void;
  view: LibraryView;
  onViewChange: (view: LibraryView) => void;
}

const SORT_OPTIONS: SelectOption<LibrarySort>[] = [
  { value: "edited", label: "Last edited" },
  { value: "name", label: "Name" },
  { value: "created", label: "Created" },
  { value: "bpm", label: "BPM" },
];

const VIEW_OPTIONS: SegmentedOption<LibraryView>[] = [
  { value: "grid", icon: "grid", ariaLabel: "Grid view" },
  { value: "list", icon: "list", ariaLabel: "List view" },
];

const TILE_SIZE_NAMES = ["Smallest", "Small", "Medium", "Large", "Largest"] as const;
const TILE_SIZE_MARKS = [1, 2, 3, 4, 5];

function isTileSize(value: number): value is TileSize {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

/** Search, sort, tile size (grid only) and the grid / list toggle. */
export function LibraryToolbar({
  searchText,
  onSearchTextChange,
  sort,
  onSortChange,
  tileSize,
  onTileSizeChange,
  view,
  onViewChange,
}: LibraryToolbarProps) {
  return (
    <div className={styles["toolbar"]}>
      <TextField
        className={styles["search"]}
        variant="search"
        size="lg"
        label="Search grooves"
        placeholder="Search by name, tag, sound or key"
        value={searchText}
        onChange={onSearchTextChange}
      />
      <Select className={styles["sort"]} label="Sort" labelPosition="inline" value={sort} options={SORT_OPTIONS} onChange={onSortChange} />
      {view === "grid" ? (
        <div className={styles["tileSize"]}>
          <span className={styles["tileSizeLabel"]}>Tile size</span>
          <Slider
            label="Tile size"
            min={1}
            max={5}
            step={1}
            value={tileSize}
            marks={TILE_SIZE_MARKS}
            valueText={(v) => TILE_SIZE_NAMES[v - 1] ?? ""}
            startGlyph={<Icon name="grid" size={12} />}
            endGlyph={<span className={styles["largeGlyph"]} aria-hidden="true" />}
            onChange={(value) => {
              if (isTileSize(value)) onTileSizeChange(value);
            }}
          />
        </div>
      ) : null}
      <SegmentedControl label="View" semantics="toggle" options={VIEW_OPTIONS} value={view} onChange={onViewChange} />
    </div>
  );
}
