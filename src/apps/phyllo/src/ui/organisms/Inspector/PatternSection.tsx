import { explainPattern } from "@phyllo/model";
import type { EngineError, Track, UiMode } from "@phyllo/model";
import { parseMiniPatternError } from "@phyllo/engine";
import { PatternField } from "@phyllo/ui";
import { useEffect, useRef, useState } from "react";
import { friendlyPatternError } from "./inspectorModel";
import { useTipHighlight } from "./useTipHighlight";
import type { InspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

/** Typing pauses this long before a valid pattern reaches the model (PatternField doc: ~80 ms). */
export const PATTERN_DEBOUNCE_MS = 80;

export interface PatternSectionProps {
  track: Track;
  mode: UiMode;
  /** The engine's error for this track (eval / pattern / runtime), if any. */
  engineError: EngineError | undefined;
  actions: InspectorActions;
}

/**
 * Mini-notation field. Valid text reaches the model ~80 ms after typing pauses (one undo step per edit session);
 * invalid text shows Strudel's parse error and is never committed, so the last valid pattern keeps playing.
 * Render with `key={track.id}` so a new track starts a fresh edit session.
 */
export function PatternSection({ track, mode, engineError, actions }: PatternSectionProps) {
  const [text, setText] = useState(track.pattern);
  const [synced, setSynced] = useState(track.pattern);
  if (track.pattern !== synced) {
    // A new committed pattern from outside (undo, pattern editor, code drawer) replaces what we validate.
    setSynced(track.pattern);
    setText(track.pattern);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inGesture = useRef(false);
  const highlighted = useTipHighlight("inspector-pattern");

  const parseError = parseMiniPatternError(text);
  // Our parse error wins; an engine `pattern` error goes under the field, other engine errors below it.
  const engineMessage = engineError && !parseError ? engineError.message : undefined;
  const enginePatternError = engineError?.kind === "pattern" ? engineMessage : undefined;
  const fieldError = parseError ? friendlyPatternError(parseError) : enginePatternError;
  const otherError = engineError?.kind !== "pattern" ? engineMessage : undefined;

  const endEdit = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (inGesture.current) {
      inGesture.current = false;
      actions.endGesture();
    }
  };

  // Close an open edit session if the inspector switches away mid-edit.
  const { endGesture } = actions;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (inGesture.current) {
        inGesture.current = false;
        endGesture();
      }
    },
    [endGesture],
  );

  function commitIfValid(next: string) {
    if (parseMiniPatternError(next) === null && next !== track.pattern) actions.setPattern(next);
  }

  function handleChange(next: string) {
    setText(next);
    if (!inGesture.current) {
      inGesture.current = true;
      actions.beginGesture();
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      commitIfValid(next);
    }, PATTERN_DEBOUNCE_MS);
  }

  function handleCommit(next: string) {
    clearTimeout(timer.current);
    timer.current = undefined;
    commitIfValid(next);
    endEdit();
  }

  return (
    <div className={styles["patternWrap"]} data-tip-target="inspector-pattern" data-tip-highlight={highlighted ? "" : undefined}>
      <PatternField
        label="Pattern"
        trailingLabel="mini-notation"
        value={track.pattern}
        mode={mode}
        hint={explainPattern(parseError ? track.pattern : text)}
        error={fieldError}
        onChange={handleChange}
        onCommit={handleCommit}
        onBlur={endEdit}
        spellCheck={false}
        autoComplete="off"
      />
      {otherError ? (
        <p className={styles["engineError"]} role="status">
          Strudel couldn’t play this track: {otherError}
        </p>
      ) : null}
    </div>
  );
}
