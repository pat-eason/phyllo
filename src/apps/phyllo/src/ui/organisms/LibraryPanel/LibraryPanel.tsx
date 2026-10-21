import { Kbd, SegmentedControl, Surface, TextField } from "@phyllo/ui";
import type { SegmentedOption } from "@phyllo/ui";
import { useId, useImperativeHandle, useRef, useState } from "react";
import type { KeyboardEvent, Ref } from "react";
import { searchModifiers } from "@phyllo/model";
import { useProjectSelector, useTips, useUiMode } from "../../../hooks";
import { SamplesTab } from "./SamplesTab";
import { SnippetsTab } from "./SnippetsTab";
import { SoundsTab } from "./SoundsTab";
import { DEFAULT_BANK, topSoundResult } from "./soundSearch";
import { StartersTab } from "./StartersTab";
import { useLibraryActions } from "./useLibraryActions";
import { useSampleFolders } from "./useSampleFolders";
import styles from "./LibraryPanel.module.css";

/** `extras` is Starters in Guided and Snippets in Pro. */
export type LibraryTab = "sounds" | "samples" | "extras";

export interface LibraryPanelHandle {
  /** Focus and select the search field (the screen binds ⌘K to this). */
  focusSearch(): void;
}

export interface LibraryPanelProps {
  /** Tab to open first. Default `sounds`. */
  initialTab?: LibraryTab;
  className?: string;
  ref?: Ref<LibraryPanelHandle>;
}

const SEARCH_LABEL: Record<LibraryTab, string> = {
  sounds: "Search sounds",
  samples: "Search samples",
  extras: "Search",
};

function placeholderFor(tab: LibraryTab, guided: boolean): string {
  switch (tab) {
    case "sounds":
      return guided ? "Search sounds — try “warm bass”" : "bd, gm_, supersaw…";
    case "samples":
      return guided ? "Search your samples" : "Search sample file names";
    case "extras":
      return guided ? "Search starters — try “house”" : "Search snippets — lpf, echo, jux…";
  }
}

function hintFor(tab: LibraryTab, guided: boolean): string {
  if (guided) {
    return tab === "extras"
      ? "Pick a starter to begin a new groove."
      : "Drag a sound onto a lane — or onto empty space to start a new track.";
  }
  return tab === "extras"
    ? "Drag a snippet onto a track · ⏎ adds it to the selected track"
    : "⌘K quick add · ⏎ inserts on the selected track · ⌥-drag to layer with stack()";
}

/**
 * Left panel (SPEC §6.1): browse and audition sounds, samples, starters (Guided) or snippets (Pro), and drag them into
 * the project. 248 px wide with its own scroll and a walnut cheek on the outer edge.
 *
 * Insert without dragging: Enter on a focused sound row, chip or snippet adds it to the selected track (or starts a new
 * track when a sound is inserted with nothing selected). Drag payloads are documented in `dragTypes.ts`.
 */
export function LibraryPanel({ initialTab = "sounds", className, ref }: LibraryPanelProps) {
  const { mode } = useUiMode();
  const guided = mode === "guided";
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [query, setQuery] = useState("");
  const [bank, setBank] = useState(DEFAULT_BANK);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const actions = useLibraryActions();
  const samples = useSampleFolders();
  const hasSelection = useProjectSelector((p) => p.tracks.some((t) => t.id === p.ui.selectedTrack));
  const { highlight } = useTips();
  const starterTip = guided && highlight === "starter-picker";

  useImperativeHandle(ref, () => ({
    focusSearch() {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
  }));

  const options: SegmentedOption<LibraryTab>[] = [
    { value: "sounds", label: "Sounds", controls: `${baseId}-panel` },
    { value: "samples", label: "Samples", controls: `${baseId}-panel` },
    { value: "extras", label: guided ? "Starters" : "Snippets", controls: `${baseId}-panel` },
  ];

  function changeTab(next: LibraryTab) {
    setTab(next);
    setQuery("");
  }

  /** ⌘K quick add (D115 rules): Enter in the search inserts the top result like Enter on its focused row. */
  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || query.trim() === "") return;
    if (tab === "sounds") {
      const ref = topSoundResult(query, mode, samples, bank);
      if (!ref) return;
      event.preventDefault();
      actions.insertSound(ref);
    } else if (tab === "extras" && !guided) {
      const def = searchModifiers(query)[0];
      if (!def) return;
      event.preventDefault();
      actions.insertModifier(def);
    }
  }

  const clearSearch = () => {
    setQuery("");
    searchRef.current?.focus();
  };

  return (
    <Surface
      as="aside"
      material="panel"
      cheek="left"
      aria-label="Sound library"
      className={className ? `${styles["panel"]} ${className}` : styles["panel"]}
    >
      <div className={styles["scroll"]}>
        <SegmentedControl
          id={`${baseId}-tabs`}
          label="Library"
          semantics="tabs"
          stretch
          className={styles["tabs"]}
          options={options}
          value={tab}
          onChange={changeTab}
          data-highlight={starterTip && tab !== "extras" ? "" : undefined}
        />
        <TextField
          ref={searchRef}
          variant="search"
          label={SEARCH_LABEL[tab]}
          value={query}
          onChange={setQuery}
          onKeyDown={onSearchKeyDown}
          placeholder={placeholderFor(tab, guided)}
          trailing={guided ? undefined : <Kbd keys={["⌘", "K"]} />}
          className={styles["search"]}
        />
        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tabs-tab-${tab}`}
          className={styles["tabPanel"]}
        >
          {tab === "sounds" ? (
            <SoundsTab
              mode={mode}
              query={query}
              bank={bank}
              onBankChange={setBank}
              actions={actions}
              samples={samples}
              onOpenSamples={() => changeTab("samples")}
              onClearSearch={clearSearch}
            />
          ) : null}
          {tab === "samples" ? (
            <SamplesTab mode={mode} query={query} actions={actions} samples={samples} onClearSearch={clearSearch} />
          ) : null}
          {tab === "extras" && guided ? <StartersTab query={query} highlighted={starterTip} onClearSearch={clearSearch} /> : null}
          {tab === "extras" && !guided ? (
            <SnippetsTab query={query} hasSelection={hasSelection} actions={actions} onClearSearch={clearSearch} />
          ) : null}
        </div>
      </div>
      <footer className={styles["footer"]}>
        <p className={styles["hint"]}>{hintFor(tab, guided)}</p>
        <p className={styles["notice"]} role="status" aria-live="polite">
          {actions.notice}
        </p>
      </footer>
    </Surface>
  );
}
