import { findTrack } from "@phyllo/model";
import type { EngineError } from "@phyllo/model";
import { StatusDot } from "@phyllo/ui";
import {
  useAppStores,
  useCodeDrawer,
  useEngine,
  useNative,
  useProjectFile,
  useProjectSelector,
  useSettings,
} from "../../../hooks";
import { formatAutosaved, formatClock } from "../../../state/format";
import { useOpenSettings } from "../AppHeader/useOpenSettings";
import { EvaluatedAgo } from "./EvaluatedAgo";
import styles from "./StatusBar.module.css";
import { StatusNotices } from "./StatusNotices";
import { describeAudioOutput, describeEngineError, describeMidiInput, tildify } from "./statusText";

export interface StatusBarProps {
  /** An engine error was clicked. Default: open the code drawer. */
  onErrorClick?: (error: EngineError) => void;
  className?: string;
}

/**
 * Quiet, always-visible system state: engine, audio output, MIDI input (plus its dismissable record-take and
 * "needs audio" notices), autosave and file path.
 * No CPU readout yet: the native layer has no process-usage call, and a made-up number would be worse than none.
 */
export function StatusBar({ onErrorClick, className }: StatusBarProps) {
  return (
    <footer className={className ? `${styles["bar"]} ${className}` : styles["bar"]}>
      <EngineState onErrorClick={onErrorClick} />
      <AudioOutput />
      <MidiInput />
      <StatusNotices />
      <span className={styles["spacer"]} />
      <SaveState />
    </footer>
  );
}

function EngineState({ onErrorClick }: Pick<StatusBarProps, "onErrorClick">) {
  const { status, trackErrors, audioError } = useEngine();
  const { setOpen } = useCodeDrawer();
  const errorTrackId = status.error?.trackId;
  const errorTrackName = useProjectSelector((project) =>
    errorTrackId === undefined ? undefined : findTrack(project, errorTrackId)?.name,
  );

  if (audioError !== null) {
    return <StatusDot className={styles["dot"]} status="error" label={`Audio couldn't start · ${audioError}`} />;
  }

  if (!status.ok && status.error) {
    const error = status.error;
    const count = Math.max(1, Object.keys(trackErrors).length);
    const text = describeEngineError(count, error, errorTrackName);
    return (
      <button
        type="button"
        className={styles["link"]}
        title={text}
        onClick={() => (onErrorClick ? onErrorClick(error) : setOpen(true))}
      >
        <StatusDot status="error" label={text} className={styles["dot"]} />
      </button>
    );
  }

  if (status.evaluatedAt === null) {
    return <StatusDot className={styles["dot"]} status="off" label="Not started · press Play" />;
  }

  return (
    <span className={styles["engine"]}>
      <StatusDot className={styles["dot"]} status="ok" label="Live · re-evaluates on every change" />
      <EvaluatedAgo evaluatedAt={status.evaluatedAt} />
    </span>
  );
}

function AudioOutput() {
  const { settings } = useSettings();
  // Re-reads the engine's rate once audio has started (the engine reports 0 before that).
  const { audioReady } = useEngine();
  const { engineHost } = useAppStores();
  const openSettings = useOpenSettings();
  const engineRate = audioReady ? (engineHost.peek()?.sampleRate ?? 0) : 0;
  const sampleRate = settings.audio.sampleRate ?? (engineRate > 0 ? engineRate : null);
  return (
    <button type="button" className={styles["link"]} onClick={openSettings}>
      {describeAudioOutput(settings.audio.outputDevice, sampleRate)}
    </button>
  );
}

function MidiInput() {
  const { settings } = useSettings();
  const openSettings = useOpenSettings();
  return (
    <button type="button" className={styles["link"]} onClick={openSettings}>
      {describeMidiInput(settings.midi.enabledPorts)}
    </button>
  );
}

function SaveState() {
  const { filePath, autosavedAt, lastSavedAt, saveError } = useProjectFile();
  const native = useNative();

  if (saveError !== null) {
    return <StatusDot className={styles["dot"]} status="warn" label={`Couldn't save · ${saveError}`} />;
  }

  const savedText = formatAutosaved(autosavedAt) ?? (lastSavedAt === null ? null : `Saved ${formatClock(lastSavedAt)}`);
  if (filePath === null) {
    return <span>{savedText ?? "Not saved yet"}</span>;
  }

  return (
    <span className={styles["save"]}>
      {savedText === null ? null : <span>{savedText} ·</span>}
      <button
        type="button"
        className={styles["link"]}
        title="Show in Finder"
        onClick={() => void native.revealInFinder(filePath)}
      >
        {tildify(filePath)}
      </button>
    </span>
  );
}
