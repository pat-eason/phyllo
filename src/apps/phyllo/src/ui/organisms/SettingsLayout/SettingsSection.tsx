import type { ReactNode } from "react";
import { sectionDomId } from "./sections";
import type { SettingsSectionId } from "./sections";
import styles from "./settings.module.css";

interface SettingsSectionProps {
  id: SettingsSectionId;
  title: string;
  /** One line under the title. */
  description?: ReactNode;
  /** Sits at the right end of the heading (Rescan devices). */
  action?: ReactNode;
  children: ReactNode;
}

/** A landmark `<section>` named by its heading: h2, one-line description, then the group card(s). */
export function SettingsSection({ id, title, description, action, children }: SettingsSectionProps) {
  const headingId = `${sectionDomId(id)}-heading`;
  return (
    <section id={sectionDomId(id)} aria-labelledby={headingId} className={styles["section"]} data-settings-section={id}>
      <div className={styles["sectionHead"]}>
        <div className={styles["sectionText"]}>
          <h2 id={headingId} className={styles["sectionTitle"]}>
            {title}
          </h2>
          {description ? <span className={styles["sectionDescription"]}>{description}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
