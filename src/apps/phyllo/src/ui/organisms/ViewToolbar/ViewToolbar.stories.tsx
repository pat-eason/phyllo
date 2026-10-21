import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { fixtureProject } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";
import { DEFAULT_SNAP } from "../Timeline";
import type { EditTool, Snap } from "../Timeline";
import { ViewToolbar } from "./ViewToolbar";

/** Stand-in for the sibling ViewTabs organism. */
function TabsPlaceholder() {
  const tab = (label: string, current = false) => (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        height: 32,
        padding: "0 12px",
        borderRadius: 8,
        fontWeight: 600,
        background: current ? "var(--ph-raised)" : "transparent",
        color: current ? "var(--ph-text)" : "var(--ph-muted)",
      }}
    >
      {label}
    </span>
  );
  return (
    <nav aria-label="Views" style={{ display: "flex", gap: 2 }}>
      {tab("Arrange", true)}
      {tab("Pattern")}
      {tab("Mixer")}
    </nav>
  );
}

function Demo({ initialTool = "select", showZoomLevel = false }: { initialTool?: EditTool; showZoomLevel?: boolean }) {
  const [tool, setTool] = useState<EditTool>(initialTool);
  const [snap, setSnap] = useState<Snap>(DEFAULT_SNAP);
  return (
    <div style={{ background: "var(--ph-bg)", color: "var(--ph-text)", minHeight: "100vh" }}>
      <ViewToolbar
        tabs={<TabsPlaceholder />}
        tool={tool}
        onToolChange={setTool}
        snap={snap}
        onSnapChange={setSnap}
        showZoomLevel={showZoomLevel}
      />
    </div>
  );
}

const stores = (options: MockStoresOptions): { stores: MockStoresOptions } => ({ stores: options });

const meta = {
  title: "Organisms/ViewToolbar",
  component: Demo,
  parameters: stores({ initialProject: fixtureProject(), initialSettings: { uiMode: "guided" } }),
} satisfies Meta<typeof Demo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Guided: tabs, Snap, Zoom (no edit tools). */
export const Guided: Story = {};

/** Pro: Select / Draw / Split tool group. */
export const Pro: Story = {
  parameters: stores({ initialProject: fixtureProject(), initialSettings: { uiMode: "pro" } }),
};

/** Pro with the Draw tool on. */
export const ProDraw: Story = {
  args: { initialTool: "draw" },
  parameters: stores({ initialProject: fixtureProject(), initialSettings: { uiMode: "pro" } }),
};

/** Zoom level readout, zoomed all the way out (− disabled). */
export const ZoomLevel: Story = {
  args: { showZoomLevel: true },
  parameters: stores({
    initialProject: fixtureProject({ ui: { selectedTrack: null, zoom: 0.25 } }),
    initialSettings: { uiMode: "pro" },
  }),
};

/** Light theme, Pro. */
export const LightPro: Story = {
  globals: { theme: "light", accent: "blue" },
  parameters: stores({ initialProject: fixtureProject(), initialSettings: { uiMode: "pro" } }),
};
