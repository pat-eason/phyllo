import { suggestionsFor } from "@phyllo/model";
import type { Suggestion, Track } from "@phyllo/model";
import { Button, SuggestionButton } from "@phyllo/ui";
import { useId, useState } from "react";
import { findModifierByCode } from "./inspectorModel";
import { useTipHighlight } from "./useTipHighlight";
import type { InspectorActions } from "./useInspectorActions";
import styles from "./Inspector.module.css";

/** SuggestionButton doc: keep four visible; the rest sit behind "More ideas". */
const VISIBLE = 4;

export interface TryOneProps {
  track: Track;
  actions: InspectorActions;
}

/** Guided "Try one": one-click modifiers; clicking an applied one removes it again. */
export function TryOne({ track, actions }: TryOneProps) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const highlighted = useTipHighlight("inspector-try-one");
  const all = suggestionsFor(track.kind);
  const shown = expanded ? all : all.slice(0, VISIBLE);
  if (all.length === 0) return null;

  function toggle(s: Suggestion, apply: boolean) {
    if (!apply) {
      const on = findModifierByCode(track, s.code, true);
      if (on) actions.removeModifier(on.id);
      return;
    }
    const off = findModifierByCode(track, s.code, false);
    if (off) actions.updateModifier(off.id, { enabled: true });
    else actions.addModifier(s.code, { label: s.label, origin: "suggestion" });
  }

  return (
    <section
      className={styles["section"]}
      aria-labelledby={headingId}
      data-tip-target="inspector-try-one"
      data-tip-highlight={highlighted ? "" : undefined}
    >
      <h3 id={headingId} className={styles["legend"]}>
        Try one
      </h3>
      <div className={styles["suggestions"]}>
        {shown.map((s) => (
          <SuggestionButton
            key={s.id}
            label={s.label}
            code={s.code}
            applied={findModifierByCode(track, s.code, true) !== undefined}
            onToggle={(apply) => toggle(s, apply)}
          />
        ))}
      </div>
      {all.length > VISIBLE ? (
        <Button variant="ghost" size="sm" className={styles["more"]} aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Fewer ideas" : `More ideas (${all.length - VISIBLE})`}
        </Button>
      ) : null}
    </section>
  );
}
