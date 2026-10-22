import { STARTERS } from "@phyllo/model";
import type { StarterDef, StarterId } from "@phyllo/model";
import { Button, EmptyState, StarterCard } from "@phyllo/ui";
import { useState } from "react";
import { useAppStores, useContextMenuTrigger } from "../../../hooks";
import { starterMenuEntries } from "./libraryMenus";
import { GroupHeading } from "./parts";
import styles from "./LibraryPanel.module.css";

export interface StartersTabProps {
  query: string;
  /** True while the `starter-picker` tip asks for attention. */
  highlighted: boolean;
  onClearSearch(): void;
}

function matches(starter: StarterDef, needle: string): boolean {
  return `${starter.name} ${starter.description} ${starter.key} ${starter.tags.join(" ")}`.toLowerCase().includes(needle);
}

interface StarterItemProps {
  starter: StarterDef;
  selected: boolean;
  onChoose(): void;
}

/** One starter card; its right-click menu does what a click does. */
function StarterItem({ starter, selected, onChoose }: StarterItemProps) {
  const menu = useContextMenuTrigger(() => ({ label: `Starter ${starter.name}`, entries: starterMenuEntries(onChoose) }));
  return (
    <StarterCard
      name={starter.name}
      description={starter.description}
      bpm={starter.bpm}
      trackCount={starter.trackCount === 0 ? "Empty" : starter.trackCount}
      preview={starter.preview.map((steps, row) => ({ color: starter.colors[row] ?? starter.colors[0], steps }))}
      selected={selected}
      onSelect={onChoose}
      {...menu}
    />
  );
}

/** Guided "Starters" tab: starter grooves; a click starts a new project (after a confirmation when the open one has unsaved changes). */
export function StartersTab({ query, highlighted, onClearSearch }: StartersTabProps) {
  const { project } = useAppStores();
  const [pending, setPending] = useState<StarterId | null>(null);
  const needle = query.trim().toLowerCase();
  const shown = needle ? STARTERS.filter((starter) => matches(starter, needle)) : STARTERS;
  const pendingStarter = STARTERS.find((starter) => starter.id === pending);

  function choose(starter: StarterDef) {
    if (project.getState().dirty) {
      setPending(starter.id);
      return;
    }
    start(starter.id);
  }

  function start(id: StarterId) {
    setPending(null);
    project.getState().newProject(id);
  }

  if (shown.length === 0) {
    return (
      <EmptyState
        compact
        title={`No starters match “${query.trim()}”`}
        body="Try a style like “house” or “ambient”."
        action={{ label: "Clear search", onClick: onClearSearch }}
      />
    );
  }

  return (
    <section className={styles["group"]} aria-label="Starters">
      <GroupHeading>Start a new groove</GroupHeading>
      <div
        className={styles["starterList"]}
        role="group"
        aria-label="Starters"
        data-tip-target="starter-picker"
        data-highlight={highlighted ? "" : undefined}
      >
        {shown.map((starter) => (
          <StarterItem key={starter.id} starter={starter} selected={pending === starter.id} onChoose={() => choose(starter)} />
        ))}
      </div>
      {pendingStarter ? (
        <div className={styles["confirm"]} role="group" aria-label="Confirm new groove">
          <p className={styles["confirmText"]}>
            {`Start “${pendingStarter.name}”? Your open groove has changes that aren’t saved yet.`}
          </p>
          <div className={styles["confirmActions"]}>
            <Button variant="primary" size="sm" onClick={() => start(pendingStarter.id)}>
              Start new groove
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
