import { findTrack } from "@phyllo/model";
import { Button } from "@phyllo/ui";
import { useProjectSelector, useSelection, useTransport } from "../../hooks";
import { AppHeader } from "../organisms/AppHeader";
import { PatternTools } from "../organisms/PatternTools";
import { PatternEditorProvider, StepSequencer } from "../organisms/StepSequencer";
import { ScreenTabs } from "./ScreenTabs";
import styles from "./screens.module.css";
import { usePlayPattern } from "./usePlayPattern";

export interface PatternEditorScreenProps {
  /** `#/pattern/<trackId>`; null (or a track that no longer exists) edits the selected track. */
  trackId: string | null;
}

/** Pattern editor (`04`): compact header with view tabs and Play pattern; StepSequencer + PatternTools. */
export function PatternEditorScreen({ trackId }: PatternEditorScreenProps) {
  const { trackId: selectedId } = useSelection();
  const routeTrackExists = useProjectSelector((project) => (trackId === null ? false : findTrack(project, trackId) !== undefined));
  const editedId = routeTrackExists ? trackId : selectedId;

  return (
    <div className={styles["screen"]}>
      <AppHeader className={styles["chrome"]} variant="compact" viewTabs={<ScreenTabs current="pattern" />} actions={<PlayPatternActions trackId={editedId} />} />
      <PatternEditorProvider key={editedId ?? "none"} trackId={editedId}>
        <main className={styles["body"]} aria-label="Pattern editor">
          <StepSequencer />
          <PatternTools />
        </main>
      </PatternEditorProvider>
    </div>
  );
}

function PlayPatternActions({ trackId }: { trackId: string | null }) {
  const { bpm } = useTransport();
  const play = usePlayPattern(trackId);
  return (
    <div className={styles["headerActions"]}>
      <Button variant="primary" iconStart={play.active ? "stop" : "play"} disabled={trackId === null} onClick={play.toggle}>
        {play.active ? "Stop pattern" : "Play pattern"}
      </Button>
      <span className={styles["tempo"]}>{bpm} BPM</span>
    </div>
  );
}
