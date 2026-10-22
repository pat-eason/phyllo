import { generate } from "@phyllo/engine";
import { KEY_MODES, KEY_ROOTS, STARTERS, buildStarterProject, formatKey, getStarter } from "@phyllo/model";
import type { GrooveSummary, StarterDef, StarterId } from "@phyllo/model";
import { Button, Logo, Select, StarterCard } from "@phyllo/ui";
import type { SelectOption } from "@phyllo/ui";
import { useEffect, useId, useMemo, useState } from "react";
import { useAudition, useLibrary, useNative, useProject, useTips, useUiMode } from "../../../hooks";
import { CodePreview } from "./CodePreview";
import { StarterPickerHeaderActions } from "./HeaderActions";
import { ImportLink } from "./ImportLink";
import { RecentProjects } from "./RecentProjects";
import { recentGrooves } from "./recent";
import styles from "./StarterPicker.module.css";
import { TempoStepper } from "./TempoStepper";

const STEPS = ["Start", "Tempo & key", "Sounds", "Play"] as const;
const CURRENT_STEP = 0;
/** Audition key of the picked starter (the shared audition slot is also used by the groove library). */
const STARTER_AUDITION = "starter";

const KEY_OPTIONS: SelectOption<string>[] = KEY_ROOTS.flatMap((root) =>
  KEY_MODES.map((mode) => {
    const key = formatKey(root, mode);
    return { value: key, label: key };
  }),
);

const FALLBACK_STARTER = STARTERS[0] as StarterDef;

export interface StarterPickerProps {
  /** A project was created or opened (Continue, skip to Pro, a recent project, Open project…, a strudel.cc import). */
  onOpened: () => void;
  /** Render the compact header (logo, Open project…, skip to Pro). Pass `false` when the screen's AppHeader carries them. Default true. */
  showHeader?: boolean;
  /** Starter selected on first render. Default `house`. */
  initialStarter?: StarterId;
  /** Tempo on first render. Default: the starter's. */
  initialBpm?: number;
  /** Key on first render, e.g. `F minor`. Default: the starter's. */
  initialKey?: string;
  /** Clock for "Today / Mon / Oct 12" in the recent list. Default `Date.now`. */
  now?: () => number;
  className?: string;
}

function previewRows(starter: StarterDef) {
  return starter.preview.map((steps, i) => ({ steps, color: starter.colors[i] ?? "var(--ph-track-1)" }));
}

/**
 * Guided start (SPEC §6.2): pick a seed, set tempo and key, see the real Strudel code it writes, then
 * Continue. Also recent projects, a strudel.cc import, Open project… and "skip to Pro".
 *
 * Preview plays the starter as a clean, unsaved preview project (never autosaved) and restores the previous
 * project on Stop or unmount; see `useAudition`. Continue creates the project (D101 autosaves it) in Guided mode.
 * Step pills 2–4 are informative only; tempo and key are chosen on this page and Sounds / Play follow in Arrange.
 */
export function StarterPicker({
  onOpened,
  showHeader = true,
  initialStarter = "house",
  initialBpm,
  initialKey,
  now = Date.now,
  className,
}: StarterPickerProps) {
  const { newProject } = useProject();
  const { setMode } = useUiMode();
  const { grooves, open } = useLibrary();
  const native = useNative();
  const { highlight } = useTips();
  const audition = useAudition();
  const auditioning = audition.auditioning === STARTER_AUDITION;

  const initial = getStarter(initialStarter) ?? FALLBACK_STARTER;
  const [starterId, setStarterId] = useState<StarterId>(initial.id);
  const [bpm, setBpm] = useState(initialBpm ?? initial.bpm);
  const [key, setKey] = useState(initialKey ?? initial.key);
  const [openError, setOpenError] = useState<string | null>(null);
  const startersLabelId = useId();

  const recents = useMemo(() => recentGrooves(grooves), [grooves]);
  const [nowMs] = useState(now);

  const preview = useMemo(() => buildStarterProject(starterId, { bpm, key }), [starterId, bpm, key]);
  const code = useMemo(() => generate(preview, { scope: "section", atBar: preview.loop.startBar }).code, [preview]);
  const { update: updateAudition } = audition;
  useEffect(() => updateAudition(preview), [preview, updateAudition]);

  const select = (starter: StarterDef) => {
    setStarterId(starter.id);
    setBpm(starter.bpm);
    setKey(starter.key);
  };

  const opened = () => {
    audition.release();
    onOpened();
  };

  const createFrom = (id: StarterId, tempo: number, chosenKey: string) => {
    audition.release();
    newProject(id, { bpm: tempo, key: chosenKey });
    setMode("guided");
    onOpened();
  };

  const openRecent = async (groove: GrooveSummary) => {
    setOpenError(null);
    const result = await open(groove.path);
    if (result.ok) opened();
    else if (result.cancelled !== true) setOpenError(result.error);
  };

  const revealRecent = async (groove: GrooveSummary) => {
    setOpenError(null);
    try {
      await native.revealInFinder(groove.path);
    } catch (caught) {
      setOpenError(`Couldn't show ${groove.name} in Finder: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  };

  const rootClasses =className ? `${styles["root"]} ${className}` : styles["root"];

  return (
    <div className={rootClasses}>
      {showHeader ? (
        <header className={styles["header"]}>
          <Logo />
          <div className={styles["spacer"]} />
          <StarterPickerHeaderActions onOpened={opened} onError={setOpenError} />
        </header>
      ) : null}

      <div className={styles["page"]}>
        <section className={styles["intro"]}>
          <ol aria-label="Setup steps" className={styles["steps"]}>
            {STEPS.map((label, i) => (
              <li key={label} className={styles["step"]} aria-current={i === CURRENT_STEP ? "step" : undefined}>
                <span className={styles["stepNumber"]} aria-hidden="true">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>

          <div className={styles["headline"]}>
            <h1 className={styles["title"]}>
              Start from <em className={styles["accentWord"]}>a seed.</em>
            </h1>
            <p className={styles["subtitle"]}>
              Pick a starting point and Phyllo sets up the tracks for you. Every choice writes real Strudel code — open it
              whenever you like, or never.
            </p>
          </div>

          <RecentProjects
            grooves={recents}
            nowMs={nowMs}
            error={openError}
            onOpen={(groove) => void openRecent(groove)}
            onReveal={(groove) => void revealRecent(groove)}
          />
          <ImportLink onImported={opened} />
        </section>

        <section aria-labelledby={startersLabelId} className={styles["main"]}>
          <h2 id={startersLabelId} className={styles["visuallyHidden"]}>
            Starters
          </h2>
          <div
            role="group"
            aria-labelledby={startersLabelId}
            className={styles["starters"]}
            data-tip-target="starter-picker"
            data-highlight={highlight === "starter-picker" ? "" : undefined}
          >
            {STARTERS.map((starter) => (
              <StarterCard
                key={starter.id}
                name={starter.name}
                description={starter.description}
                bpm={starter.bpm}
                trackCount={starter.tracksLabel === "Empty" ? "Empty" : starter.trackCount}
                preview={previewRows(starter)}
                selected={starter.id === starterId}
                onSelect={() => select(starter)}
                onDoubleClick={() => createFrom(starter.id, starter.bpm, starter.key)}
              />
            ))}
          </div>

          <div className={styles["panel"]}>
            <CodePreview code={code} />
            <div className={styles["controls"]}>
              <TempoStepper bpm={bpm} onChange={setBpm} />
              <div className={styles["field"]}>
                <span className={styles["label"]} aria-hidden="true">
                  Key
                </span>
                <Select label="Key" value={key} options={KEY_OPTIONS} size="md" className={styles["keySelect"]} onChange={setKey} />
                <span className={styles["hint"]}>Moves melody and chord tracks to the new key.</span>
              </div>
              <div className={styles["actions"]}>
                <Button
                  size="lg"
                  className={styles["previewButton"]}
                  iconStart={auditioning ? "stop" : "play"}
                  onClick={() => (auditioning ? audition.stop() : void audition.audition(STARTER_AUDITION, preview))}
                >
                  {auditioning ? "Stop preview" : "Preview"}
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className={styles["continueButton"]}
                  iconEnd="arrow-right"
                  onClick={() => createFrom(starterId, bpm, key)}
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
