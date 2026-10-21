import { DRUM_BANKS, INSTRUMENTS, SYNTHS, drumSoundsFor, searchSounds } from "@phyllo/model";
import type { DrumBank, DrumSound, InstrumentSound, SoundEntry, SynthSound, UiMode } from "@phyllo/model";
import { Button, Chip, EmptyState, Icon } from "@phyllo/ui";
import { useId, useMemo, useState } from "react";
import { ChipList, DrumList, GroupHeading, SampleList } from "./parts";
import { shortPath } from "./soundRefs";
import type { SampleFolders } from "./useSampleFolders";
import type { LibraryActions } from "./useLibraryActions";
import styles from "./LibraryPanel.module.css";

const DEFAULT_BANK = "RolandTR909";
/** Matching sample files shown in a search before "Show all". */
const SAMPLE_MATCH_LIMIT = 12;

export interface SoundsTabProps {
  mode: UiMode;
  query: string;
  actions: LibraryActions;
  samples: SampleFolders;
  onOpenSamples(): void;
  onClearSearch(): void;
}

interface SearchGroups {
  banks: DrumBank[];
  drums: DrumSound[];
  synths: SynthSound[];
  instruments: InstrumentSound[];
}

function groupResults(results: readonly SoundEntry[]): SearchGroups {
  const groups: SearchGroups = { banks: [], drums: [], synths: [], instruments: [] };
  for (const entry of results) {
    if (entry.group === "bank") groups.banks.push(entry as DrumBank);
    else if (entry.group === "drum") groups.drums.push(entry as DrumSound);
    else if (entry.group === "synth") groups.synths.push(entry as SynthSound);
    else groups.instruments.push(entry as InstrumentSound);
  }
  return groups;
}

interface BankChipsProps {
  banks: readonly DrumBank[];
  selected: string;
  onSelect(bank: string): void;
}

function BankChips({ banks, selected, onSelect }: BankChipsProps) {
  return (
    <div className={styles["chips"]} role="group" aria-label="Drum machine">
      {banks.map((bank) => (
        <Chip
          key={bank.code}
          variant="filter"
          selected={bank.code === selected}
          title={bank.description}
          onClick={() => onSelect(bank.code)}
        >
          {bank.name}
        </Chip>
      ))}
    </div>
  );
}

/** Sounds tab: drum machines (bank chips + rows), synths, instruments and the linked folders; search results replace the groups. */
export function SoundsTab({ mode, query, actions, samples, onOpenSamples, onClearSearch }: SoundsTabProps) {
  const [bank, setBank] = useState(DEFAULT_BANK);
  const [drumsOpen, setDrumsOpen] = useState(true);
  const drumsId = useId();
  const searching = query.trim() !== "";
  const results = useMemo(() => (searching ? groupResults(searchSounds(query, mode)) : null), [searching, query, mode]);

  const bankFor = (sound: DrumSound) => (sound.banks.includes(bank) ? bank : (sound.banks[0] ?? bank));

  if (results) {
    const needle = query.trim().toLowerCase();
    const sampleMatches = samples.folders.flatMap((folder) => folder.scan.files.filter((file) => file.name.toLowerCase().includes(needle)));
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
            {results.banks.length > 0 ? <BankChips banks={results.banks} selected={bank} onSelect={setBank} /> : null}
            {results.drums.length > 0 ? (
              <DrumList label="Drum sounds" sounds={results.drums} bankFor={bankFor} mode={mode} actions={actions} />
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
          <BankChips banks={DRUM_BANKS} selected={bank} onSelect={setBank} />
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
              <li key={folder.path}>
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
