import type { TipTarget } from "@phyllo/model";
import { TipCard } from "@phyllo/ui";
import { useEffect } from "react";
import type { HTMLAttributes } from "react";
import { useTips, useUiMode } from "../../../hooks";
import { emphasizeControls } from "./emphasizeControls";
import styles from "./TipCoach.module.css";

export type TipCoachProps = Omit<HTMLAttributes<HTMLDivElement>, "children">;

function scrollTargetIntoView(target: TipTarget) {
  const element = document.querySelector<HTMLElement>(`[data-tip-target="${target}"]`);
  if (!element || typeof element.scrollIntoView !== "function") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  element.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduce ? "auto" : "smooth" });
}

/**
 * Runs the Guided tips curriculum (SPEC §6.1 "Tips card"): the current step's TipCard below the lanes. Steps
 * complete themselves from project actions (tips store) and the card cross-fades to the next one. "Show me"
 * outlines the target control (organisms render the pulse for `useTips().highlight`) and scrolls it into view;
 * the outline clears on the next pointer interaction or after 4 s. Renders nothing in Pro or when tips are hidden.
 */
export function TipCoach({ className, ...rest }: TipCoachProps) {
  const { visible, step, total, current, highlight, showMe, hide, clearHighlight } = useTips();
  const { mode } = useUiMode();

  // Any pointer interaction after "Show me" clears the outline (TipCoach doc: "removes on interaction").
  useEffect(() => {
    if (highlight === null) return;
    const clear = () => clearHighlight();
    document.addEventListener("pointerdown", clear, true);
    return () => document.removeEventListener("pointerdown", clear, true);
  }, [highlight, clearHighlight]);

  if (!visible || mode !== "guided") return null;

  const classes = className ? `${styles["coach"]} ${className}` : styles["coach"];
  return (
    <div className={classes} {...rest}>
      <TipCard
        className={styles["card"]}
        data-phase={step % 2 === 0 ? "even" : "odd"}
        step={step}
        total={total}
        title={current.title}
        body={emphasizeControls(current.body)}
        primaryLabel={current.action}
        onPrimary={() => {
          showMe();
          scrollTargetIntoView(current.target);
        }}
        onDismiss={hide}
      />
    </div>
  );
}
