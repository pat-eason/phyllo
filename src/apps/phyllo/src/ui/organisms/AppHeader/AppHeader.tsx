import { Logo } from "@phyllo/ui";
import type { ReactNode } from "react";
import { useProjectFile } from "../../../hooks";
import styles from "./AppHeader.module.css";
import { ProjectMenu } from "./ProjectMenu";
import { SwitchesSection } from "./SwitchesSection";
import { TransportSection } from "./TransportSection";

export interface AppHeaderProps {
  /** `full` (Arrange): transport, readout and global switches. `compact`: logo, project name, tabs and page actions. */
  variant?: "full" | "compact";
  /** Compact: the view tabs (`<ViewTabs />`). */
  viewTabs?: ReactNode;
  /** Compact: right-side page actions (Play pattern, Import…, Open project…). */
  actions?: ReactNode;
  /** Full: Export clicked (the screen opens the ExportDialog). */
  onExport?: () => void;
  /** Full: "Version History…" chosen in the project menu. */
  onVersionHistory?: () => void;
  /** Compact: leave the project name out (Guided start has no open project). Default false. */
  hideProjectName?: boolean;
  className?: string;
}

/**
 * The custom title bar. Leaves 84 px on the left for the macOS traffic lights; empty areas are window drag regions.
 * Position and cycle readouts update through the transport feed, so the header does not re-render while playing.
 */
export function AppHeader({
  variant = "full",
  viewTabs,
  actions,
  onExport,
  onVersionHistory,
  hideProjectName = false,
  className,
}: AppHeaderProps) {
  const classes = className ? `${styles["header"]} ${className}` : styles["header"];

  if (variant === "compact") {
    return (
      <header className={classes} data-variant="compact" data-tauri-drag-region="">
        <div className={styles["identity"]} data-tauri-drag-region="">
          <Logo size={24} />
          {hideProjectName ? null : <CompactProjectName />}
        </div>
        {viewTabs ? <div className={styles["tabs"]}>{viewTabs}</div> : null}
        {actions ? (
          <div className={styles["actions"]} data-tauri-drag-region="">
            {actions}
          </div>
        ) : null}
      </header>
    );
  }

  return (
    <header className={classes} data-variant="full" data-tauri-drag-region="">
      <div className={styles["identity"]} data-tauri-drag-region="">
        <Logo size={26} />
        <ProjectMenu onVersionHistory={onVersionHistory} onExport={onExport} />
      </div>
      <TransportSection />
      <SwitchesSection onExport={onExport} />
    </header>
  );
}

function CompactProjectName() {
  const { projectName } = useProjectFile();
  return <span className={styles["projectName"]}>{projectName}</span>;
}
