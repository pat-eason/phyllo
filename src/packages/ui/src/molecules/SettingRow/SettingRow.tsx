import { forwardRef, useId, type HTMLAttributes, type ReactNode } from "react";
import styles from "./SettingRow.module.css";

export interface SettingRowProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "id"> {
  /** "Media keys control playback" */
  title: string;
  /** One line under the title. Its element id is `<id>-help` for the control's `aria-describedby`. */
  help?: string;
  /** Switch | Select | Button | Slider. Give it `aria-labelledby={id}` so the title names it. */
  control: ReactNode;
  /** Id of the title element, used to link title to control (`aria-labelledby`). Generated when omitted. */
  id?: string;
  /** Bottom separator (`--ph-line-soft`) between rows inside a group card. Default true. */
  divider?: boolean;
  /** Draws its own border, radius and `--ph-bg` fill for use outside a group card (Kit). Default false. */
  standalone?: boolean;
}

/** A setting: title, optional help line and a right-aligned control. Rows sit inside a group card the parent draws. */
export const SettingRow = forwardRef<HTMLDivElement, SettingRowProps>(function SettingRow(
  { title, help, control, id, divider = true, standalone = false, className, ...rest },
  ref,
) {
  const generatedId = useId();
  const titleId = id ?? generatedId;
  const classes = className ? `${styles["row"]} ${className}` : styles["row"];

  return (
    <div
      ref={ref}
      className={classes}
      data-divider={divider && !standalone ? "" : undefined}
      data-standalone={standalone ? "" : undefined}
      {...rest}
    >
      <div className={styles["text"]}>
        <span id={titleId} className={styles["title"]}>
          {title}
        </span>
        {help ? (
          <span id={`${titleId}-help`} className={styles["help"]}>
            {help}
          </span>
        ) : null}
      </div>
      <div className={styles["control"]}>{control}</div>
    </div>
  );
});
