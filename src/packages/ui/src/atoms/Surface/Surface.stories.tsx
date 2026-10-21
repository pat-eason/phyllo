import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Surface, type SurfaceMaterial } from "./Surface";

const MATERIALS: SurfaceMaterial[] = ["panel", "raised", "plate", "inset", "card", "dialog", "chrome"];

const meta = {
  title: "Atoms/Surface",
  component: Surface,
  args: { material: "panel", children: null },
  argTypes: {
    material: { control: "select", options: MATERIALS },
    cheek: { control: "inline-radio", options: [undefined, "left", "right"] },
    radius: { control: "inline-radio", options: [undefined, "none", "lg", "xl", "2xl"] },
    as: { control: "select", options: ["div", "aside", "section", "header", "footer"] },
  },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

function Sample({ children }: { children: ReactNode }) {
  return <span style={{ font: "var(--ph-text-small)", color: "var(--ph-muted)" }}>{children}</span>;
}

export const Default: Story = {
  args: { material: "card", children: <Sample>card · 1px line, radius 14</Sample> },
  decorators: [(Story) => <div style={{ padding: 24, maxWidth: 360 }}>{Story()}</div>],
};

/** Every material side by side (Kit: Foundations › Space · radius · depth). */
export const Materials: Story = {
  render: () => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        gap: 16,
        padding: 24,
        background: "var(--ph-bg)",
      }}
    >
      {MATERIALS.map((material) => (
        <Surface key={material} material={material} padded style={{ height: 72 }}>
          <Sample>{material}</Sample>
        </Surface>
      ))}
      <Surface material="card" floating padded style={{ height: 72 }}>
        <Sample>card · floating</Sample>
      </Surface>
    </div>
  ),
};

/** Walnut cheek: 16 px strip on the outer edge; the panel adds that much padding on that side. */
export const WoodCheeks: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, padding: 24, background: "var(--ph-bg)" }}>
      <Surface as="aside" material="panel" cheek="left" padded aria-label="Sound library" style={{ width: 248, height: 220 }}>
        <Sample>cheek=&quot;left&quot; (library)</Sample>
      </Surface>
      <Surface as="aside" material="panel" cheek="right" padded aria-label="Track inspector" style={{ width: 320, height: 220 }}>
        <Sample>cheek=&quot;right&quot; padded (inspector)</Sample>
      </Surface>
      <Surface as="aside" material="panel" padded aria-label="Plain panel" style={{ width: 200, height: 220 }}>
        <Sample>no cheek</Sample>
      </Surface>
    </div>
  ),
};

export const Radii: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "var(--ph-bg)" }}>
      {(["none", "lg", "xl", "2xl"] as const).map((radius) => (
        <Surface key={radius} material="raised" radius={radius} padded style={{ width: 96, height: 64 }}>
          <Sample>{radius}</Sample>
        </Surface>
      ))}
    </div>
  ),
};

/** Chrome carries a 1px line on the bottom (title/toolbar) or top (status bar) edge. */
export const ChromeEdges: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      <Surface as="header" material="chrome" edge="bottom" padded style={{ height: 48 }}>
        <Sample>chrome · edge=&quot;bottom&quot;</Sample>
      </Surface>
      <Surface as="footer" material="chrome" edge="top" padded style={{ height: 48 }}>
        <Sample>chrome · edge=&quot;top&quot;</Sample>
      </Surface>
    </div>
  ),
};

/** Plate holds a knob group; inset is the recessed readout well. */
export const PlateAndInset: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, padding: 24, alignItems: "flex-start" }}>
      <Surface material="plate" style={{ width: 240, height: 96 }}>
        <Sample>plate (recessed)</Sample>
      </Surface>
      <Surface material="inset" padded style={{ width: 240, height: 46 }}>
        <Sample>inset</Sample>
      </Surface>
    </div>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, width: "100%" }}>
        {MATERIALS.map((material) => (
          <Surface key={material} material={material} padded style={{ width: 120, height: 64 }}>
            <Sample>{material}</Sample>
          </Surface>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <Surface material="panel" cheek="left" padded style={{ width: 160, height: 120 }}>
          <Sample>cheek left</Sample>
        </Surface>
        <Surface material="panel" cheek="right" padded style={{ width: 160, height: 120 }}>
          <Sample>cheek right</Sample>
        </Surface>
      </div>
    </ThemePair>
  ),
};
