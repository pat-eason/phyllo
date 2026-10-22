import { useContextMenuTrigger } from "../../hooks";
import { ViewTabs, viewMenuEntries } from "../organisms/ViewTabs";
import type { ViewName } from "../organisms/ViewTabs";
import { useShell } from "../shell/shellContext";
import type { Route } from "../shell/router";

const ROUTES: Record<ViewName, Route> = {
  library: { screen: "library" },
  arrange: { screen: "arrange" },
  pattern: { screen: "pattern", trackId: null },
  mixer: { screen: "mixer" },
};

export interface ScreenTabsProps {
  current: ViewName;
  /** Library screen: Library tab first. */
  withLibrary?: boolean;
}

/** `ViewTabs` wired to the router (Arrange · Pattern · Mixer, ⌘1/⌘2/⌘3); right-click lists the views. */
export function ScreenTabs({ current, withLibrary = false }: ScreenTabsProps) {
  const { navigate } = useShell();
  const openView = (view: ViewName) => navigate(ROUTES[view]);
  const menu = useContextMenuTrigger(() => ({ label: "Views", entries: viewMenuEntries(current, openView) }));
  return <ViewTabs current={current} withLibrary={withLibrary} onNavigate={openView} tabHandlers={menu} />;
}
