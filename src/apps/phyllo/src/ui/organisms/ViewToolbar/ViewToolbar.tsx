import { IconButton, Select } from "@phyllo/ui";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useAppStores, useProjectSelector, useUiMode } from "../../../hooks";
import { EDIT_TOOLS, formatZoom, MAX_ZOOM, MIN_ZOOM, SNAP_OPTIONS, zoomIn, zoomOut } from "../Timeline";
import type { EditTool, Snap } from "../Timeline";
import styles from "./ViewToolbar.module.css";

export interface ViewToolbarProps extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  /** The view tabs (`<ViewTabs />`: Arrange · Pattern · Mixer). */
  tabs: ReactNode;
  /** Current pointer mode (Pro). The screen also binds V / B / S. */
  tool: EditTool;
  onToolChange(tool: EditTool): void;
  snap: Snap;
  onSnapChange(snap: Snap): void;
  /** Show the zoom level ("150%") between − and +. Default false (mockup). */
  showZoomLevel?: boolean;
}

/**
 * Row above the ruler (ViewToolbar doc): view tabs on the left; Pro edit tools (Select V / Draw B / Split S),
 * Snap and Zoom − / + on the right. Zoom is saved per project (`ui/setZoom`).
 */
export function ViewToolbar({
  tabs,
  tool,
  onToolChange,
  snap,
  onSnapChange,
  showZoomLevel = false,
  className,
  ...rest
}: ViewToolbarProps) {
  const { mode } = useUiMode();
  const zoom = useProjectSelector((p) => p.ui.zoom);
  const { project } = useAppStores();
  const setZoom = (next: number) => project.getState().dispatch({ type: "ui/setZoom", zoom: next });

  return (
    <div className={className ? `${styles["toolbar"]} ${className}` : styles["toolbar"]} {...rest}>
      {tabs}
      <div className={styles["spacer"]} />
      {mode === "pro" ? (
        <div role="group" aria-label="Edit tools" className={styles["tools"]}>
          {EDIT_TOOLS.map((item) => (
            <IconButton
              key={item.value}
              className={styles["tool"]}
              icon={item.icon}
              label={`${item.label} (${item.shortcut})`}
              size={30}
              variant="plain"
              pressed={tool === item.value}
              aria-keyshortcuts={item.shortcut}
              onClick={() => onToolChange(item.value)}
            />
          ))}
        </div>
      ) : null}
      <Select
        label="Snap"
        labelPosition="inline"
        size="sm"
        value={snap}
        options={[...SNAP_OPTIONS]}
        onChange={onSnapChange}
      />
      <div className={styles["zoom"]} role="group" aria-label="Zoom">
        <IconButton icon="minus" label="Zoom out" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom(zoomOut(zoom))} />
        {showZoomLevel ? (
          <output className={styles["zoomLevel"]} aria-label="Zoom level">
            {formatZoom(zoom)}
          </output>
        ) : null}
        <IconButton icon="plus" label="Zoom in" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom(zoomIn(zoom))} />
      </div>
    </div>
  );
}
