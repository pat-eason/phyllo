import { findTrack } from "@phyllo/model";
import { IconButton } from "@phyllo/ui";
import { useState } from "react";
import { useMidiInput, useProjectSelector, useRecorder } from "../../../hooks";
import styles from "./StatusBar.module.css";
import { describeTake, MIDI_NEEDS_AUDIO } from "./statusText";

/**
 * Dismissable one-liners from the MIDI layer: what the last record take did ("Recorded 7 notes onto Bass") and the
 * one-time "MIDI notes need audio" hint. A take stays until dismissed or replaced by the next one.
 */
export function StatusNotices() {
  const { lastTake } = useRecorder();
  const { hint, dismissHint } = useMidiInput();
  // Dismissal is remembered per take (by its timestamp), so the next take shows again.
  const [dismissedTakeAt, setDismissedTakeAt] = useState<number | null>(null);
  const trackName = useProjectSelector((project) =>
    lastTake?.trackId == null ? undefined : findTrack(project, lastTake.trackId)?.name,
  );

  const takeText = lastTake !== null && lastTake.at !== dismissedTakeAt ? describeTake(lastTake, trackName) : null;

  return (
    <>
      {takeText === null || lastTake === null ? null : (
        <Notice text={takeText} dismissLabel="Dismiss recording notice" onDismiss={() => setDismissedTakeAt(lastTake.at)} />
      )}
      {hint === null ? null : <Notice text={MIDI_NEEDS_AUDIO} dismissLabel="Dismiss MIDI hint" onDismiss={dismissHint} />}
    </>
  );
}

interface NoticeProps {
  text: string;
  dismissLabel: string;
  onDismiss: () => void;
}

function Notice({ text, dismissLabel, onDismiss }: NoticeProps) {
  return (
    <span className={styles["notice"]}>
      <span role="status">{text}</span>
      <IconButton icon="close" label={dismissLabel} size={26} variant="plain" onClick={onDismiss} />
    </span>
  );
}
