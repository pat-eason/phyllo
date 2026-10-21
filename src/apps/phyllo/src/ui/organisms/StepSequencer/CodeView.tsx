import { generate, parseMiniPatternError } from "@phyllo/engine";
import { explainPattern } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import { PatternField } from "@phyllo/ui";
import { useState } from "react";
import { useEngine, useProject, useUiMode } from "../../../hooks";
import styles from "./StepSequencer.module.css";

export interface CodeViewProps {
  track: Track;
  onPatternCommit: (pattern: string) => void;
}

/** The track's generated line(s) as the code drawer shows them, from the last generated program. */
function useTrackLines(trackId: string): string[] {
  const { code, lineMap } = useEngine();
  const { project } = useProject();
  const range = lineMap[trackId];
  if (range) return code.split("\n").slice(range.start - 1, range.end);
  // Section scope can leave the track out of the drawer's program; show its whole-song line instead.
  const song = generate(project, { scope: "song" });
  const r = song.lines[trackId];
  return r ? song.code.split("\n").slice(r.start - 1, r.end) : [];
}

/** Code tab: the track's full generated code (read-only) and its pattern field. */
export function CodeView({ track, onPatternCommit }: CodeViewProps) {
  const lines = useTrackLines(track.id);
  const { mode } = useUiMode();
  const [error, setError] = useState<string | undefined>(undefined);
  const editable = track.kind !== "code";

  function check(text: string): string | undefined {
    const err = parseMiniPatternError(text);
    return err ? `Column ${err.column}: ${err.message}` : undefined;
  }

  return (
    <div className={styles["codeView"]}>
      <section aria-label={`Generated code for ${track.name}`} className={styles["codeBlock"]}>
        <div className={styles["codeHead"]}>
          <span className={styles["codeTitle"]}>{track.name}</span>
          <span className={styles["codeMeta"]}>read-only · generated from the track</span>
        </div>
        <pre className={styles["codeLines"]}>
          <code>{lines.join("\n") || "—"}</code>
        </pre>
      </section>
      {editable ? (
        <PatternField
          label="PATTERN"
          trailingLabel="mini-notation"
          labelTone="muted"
          value={track.pattern}
          mode={mode}
          hint={explainPattern(track.pattern)}
          error={error}
          onChange={(text) => setError(check(text))}
          onCommit={(text) => {
            const err = check(text);
            setError(err);
            if (!err) onPatternCommit(text);
          }}
        />
      ) : (
        <p className={styles["muted"]}>Code tracks are edited as text in the code drawer.</p>
      )}
    </div>
  );
}
