import { DRUM_BANKS, INSTRUMENTS, SYNTHS, drumSoundsFor, searchSounds } from "@phyllo/model";
import type { DrumBank, UiMode } from "@phyllo/model";
import { Button, Chip, EmptyState, Icon } from "@phyllo/ui";
import { useId, useMemo, useState } from "react";
import { ChipList, DrumList, GroupHeading, SampleList } from "./parts";
import { shortPath } from "./soundRefs";
import { bankFor, groupResults, matchingSamples } from "./soundSearch";
import type { LinkedFolder, SampleFolders } from "./useSampleFolders";
import type { LibraryActions } from "./useLibraryActions";
import { useBankMenu, useFolderMenu } from "./useLibraryMenus";
import styles from "./LibraryPanel.module.css";

/** Matching sample files shown in a search before "Show all". */
const SAMPLE_MATCH_LIMIT = 12;

export interface SoundsTabProps {
  mode: UiMode;
  query: string;
  /** Selected drum machine (owned by the panel so search Enter can insert from it). */
  bank: string;
  onBankChange(bank: string): void;
  actions: LibraryActions;
  samples: SampleFolders;
  onOpenSamples(): void;
  onClearSearch(): void;
}

interface BankChipsProps {
  banks: readonly DrumBank[];
  selected: string;
  onSelect(bank: string): void;
}

function BankChip({ bank, selected, onSelect }: { bank: DrumBank; selected: string; onSelect(bank: string): void }) {
  const menu = useBankMenu(bank, selected, onSelect);
  return (
    <Chip
      variant="filter"
      selected={bank.code === selected}
      title={bank.description}
      onClick={() => onSelect(bank.code)}
      onContextMenu={menu.onContextMenu}
      onKeyDown={menu.onKeyDown}
    >
      {bank.name}
    </Chip>
  );
}

function BankChips({ banks, selected, onSelect }: BankChipsProps) {
  return (
    <div className={styles["chips"]} role="group" aria-label="Drum machine">
      {banks.map((bank) => (
        <BankChip key={bank.code} bank={bank} selected={selected} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** A linked folder in the Sounds tab: click opens the Samples tab; right-click opens the folder menu. */
function FolderRow({ folder, samples, onOpenSamples }: { folder: LinkedFolder; samples: SampleFolders; onOpenSamples(): void }) {
  const menu = useFolderMenu(samples, folder.path);
  return (
    <li {...menu}>
      <button
        type="button"
        className={styles["folderRow"]}
        title={folder.path}
        aria-label={`${folder.path}, ${folder.scan.files.length} files. Open in Samples`}
        onClick={onOpenSamples}
      >
        <Icon name="folder" size={16} />
        <span className={styles["path"]}>{shortPath(folder.path)}</span>
        <span className={styles["count"]}>{folder.scan.status === "loading" ? "…" : folder.scan.files.length}</span>
      </button>
    </li>
  );
}

/** Sounds tab: drum machines (bank chips + rows), synths, instruments and the linked folders; search results replace the groups. */
export function SoundsTab({ mode, query, bank, onBankChange, actions, samples, onOpenSamples, onClearSearch }: SoundsTabProps) {
  const [drumsOpen, setDrumsOpen] = useState(true);
  const drumsId = useId();
  const searching = query.trim() !== "";
  const results = useMemo(() => (searching ? groupResults(searchSounds(query, mode)) : null), [searching, query, mode]);

  if (results) {
    const sampleMatches = matchingSamples(samples, query);
    const total = results.banks.length + results.drums.length + results.synths.length + results.instruments.length + sampleMatches.length;
    if (total === 0) {
      return (
        <EmptyState
          title={`No sounds match “${query.trim()}”`}
          body={
            mode === "guided"
              ? "Try a plainer word, like “bass”, “warm” or “snare”."
              : "Search matches code names (bd, gm_epiano1) and friendly names."
          }
          action={{ label: "Clear search", onClick: onClearSearch }}
        />
      );
    }
    return (
      <>
        {results.banks.length > 0 || results.drums.length > 0 ? (
          <section className={styles["group"]} aria-label="Drum machines">
            <GroupHeading>Drum machines</GroupHeading>
            {results.banks.length > 0 ? <BankChips banks={results.banks} selected={bank} onSelect={onBankChange} /> : null}
            {results.drums.length > 0 ? (
              <DrumList label="Drum sounds" sounds={results.drums} bankFor={(sound) => bankFor(sound, bank)} mode={mode} actions={actions} />
            ) : null}
          </section>
        ) : null}
        {results.synths.length > 0 ? (
          <section className={styles["group"]} aria-label="Synths">
            <GroupHeading>Synths</GroupHeading>
            <ChipList label="Synths" entries={results.synths} actions={actions} />
          </section>
        ) : null}
        {results.instruments.length > 0 ? (
          <section className={styles["group"]} aria-label="Instruments">
            <GroupHeading>Instruments</GroupHeading>
            <ChipList label="Instruments" entries={results.instruments} actions={actions} />
          </section>
        ) : null}
        {sampleMatches.length > 0 ? (
          <section className={styles["group"]} aria-label="Your samples">
            <GroupHeading>Your samples</GroupHeading>
            <SampleList label="Matching samples" files={sampleMatches.slice(0, SAMPLE_MATCH_LIMIT)} mode={mode} actions={actions} />
            {sampleMatches.length > SAMPLE_MATCH_LIMIT ? (
              <Button variant="ghost" size="sm" onClick={onOpenSamples}>
                {`Show all ${sampleMatches.length} in Samples`}
              </Button>
            ) : null}
          </section>
        ) : null}
      </>
    );
  }

  return (
    <>
      <section className={styles["group"]} aria-label="Drum machines">
        <div className={styles["headingRow"]}>
          <GroupHeading>Drum machines</GroupHeading>
          <button
            type="button"
            className={styles["collapse"]}
            aria-expanded={drumsOpen}
            aria-controls={drumsId}
            aria-label={drumsOpen ? "Collapse drum machines" : "Expand drum machines"}
            onClick={() => setDrumsOpen((open) => !open)}
          >
            <Icon name="chevron-down" size={14} className={styles["chevron"]} data-open={drumsOpen ? "" : undefined} />
          </button>
        </div>
        <div id={drumsId} className={styles["group"]} hidden={!drumsOpen}>
          <BankChips banks={DRUM_BANKS} selected={bank} onSelect={onBankChange} />
          <DrumList label="Drum sounds" sounds={drumSoundsFor(bank)} bankFor={() => bank} mode={mode} actions={actions} />
        </div>
      </section>
      <section className={styles["group"]} aria-label="Synths">
        <GroupHeading>Synths</GroupHeading>
        <ChipList label="Synths" entries={SYNTHS} actions={actions} />
      </section>
      <section className={styles["group"]} aria-label="Instruments">
        <GroupHeading>Instruments</GroupHeading>
        <ChipList label="Instruments" entries={INSTRUMENTS} actions={actions} />
      </section>
      <section className={styles["group"]} aria-label="Your folders">
        <GroupHeading>Your folders</GroupHeading>
        {samples.folders.length > 0 ? (
          <ul className={styles["folderList"]}>
            {samples.folders.map((folder) => (
              <FolderRow key={folder.path} folder={folder} samples={samples} onOpenSamples={onOpenSamples} />
            ))}
          </ul>
        ) : null}
        <Button variant="dashed" size="sm" iconStart="plus" className={styles["linkButton"]} onClick={() => void samples.link()}>
          Link a folder…
        </Button>
      </section>
    </>
  );
}
