import type { Track } from "@phyllo/model";
import { EmptyState, Surface } from "@phyllo/ui";
import { useEngine, useSelection, useSettings, useUiMode } from "../../../hooks";
import { InspectorHeader } from "./InspectorHeader";
import { KnobPlate } from "./KnobPlate";
import { ModifierList } from "./ModifierList";
import { PatternSection } from "./PatternSection";
import { SoundSection } from "./SoundSection";
import { TryOne } from "./TryOne";
import { useInspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

export interface InspectorProps {
  /** "Edit pattern" in the header: open the Pattern editor for this track. Omit to hide the button. */
  onEditPattern?: (trackId: string) => void;
  /** Applied to the outer `<aside>` (the screen sets its size; default `flex: 1 1 320px`, full height). */
  className?: string;
}

/**
 * Right-hand track inspector (SPEC §6.1): sound, pattern, knobs and Try one (Guided) or the modifier chain (Pro)
 * for the selected track. Every edit dispatches a model action, so the code drawer and the sound follow.
 */
export function Inspector({ onEditPattern, className }: InspectorProps) {
  const { track } = useSelection();
  const classes = [styles["inspector"], className].filter(Boolean).join(" ");

  return (
    <Surface as="aside" material="panel" cheek="right" padded={false} aria-label="Track inspector" className={classes}>
      <div className={styles["scroll"]}>
        {track ? (
          <TrackInspector key={track.id} track={track} onEditPattern={onEditPattern} />
        ) : (
          <EmptyState title="Select a track to shape its sound" body="Click a track name on the left; its sound, pattern and knobs show up here." />
        )}
      </div>
    </Surface>
  );
}

interface TrackInspectorProps {
  track: Track;
  onEditPattern: ((trackId: string) => void) | undefined;
}

function TrackInspector({ track, onEditPattern }: TrackInspectorProps) {
  const { mode } = useUiMode();
  const { settings } = useSettings();
  const { trackErrors } = useEngine();
  const actions = useInspectorActions(track.id);
  const isCode = track.kind === "code";

  return (
    <>
      <InspectorHeader
        track={track}
        onRename={actions.rename}
        onEditPattern={onEditPattern ? () => onEditPattern(track.id) : undefined}
      />
      <SoundSection track={track} mode={mode} actions={actions} />
      {isCode ? (
        <CodeTrackSource track={track} />
      ) : (
        <>
          <PatternSection track={track} mode={mode} engineError={trackErrors[track.id]} actions={actions} />
          <KnobPlate track={track} mode={mode} ccMap={settings.midi.ccMap} actions={actions} />
          {mode === "guided" ? <TryOne track={track} actions={actions} /> : <ModifierList track={track} actions={actions} />}
        </>
      )}
    </>
  );
}

/** Code tracks play verbatim code (SPEC §4.2): show it read-only; editing happens in the code drawer. */
function CodeTrackSource({ track }: { track: Track }) {
  return (
    <section className={styles["section"]} aria-label="Code">
      <h3 className={styles["legend"]}>Code</h3>
      <pre className={styles["rawCode"]}>{track.rawCode ?? ""}</pre>
    </section>
  );
}
