import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Icon } from "../Icon";
import { Slider, type SliderProps } from "./Slider";

const TILE_NAMES = ["Smallest", "Small", "Medium", "Large", "Largest"];
const tileText = (value: number) => TILE_NAMES[value - 1] ?? String(value);

function Controlled(args: Omit<SliderProps, "onChange">) {
  const [value, setValue] = useState(args.value);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Slider {...args} value={value} onChange={setValue} />
      <span style={{ font: "var(--ph-text-small)", color: "var(--ph-muted)", fontVariantNumeric: "tabular-nums" }}>
        {typeof args.valueText === "function" ? args.valueText(value) : (args.valueText ?? value)}
      </span>
    </div>
  );
}

const meta = {
  title: "Atoms/Slider",
  component: Slider,
  args: { label: "Amount", value: 0.4, onChange: () => undefined },
  render: (args) => <Controlled {...args} />,
  decorators: [(Story) => <div style={{ padding: 24, background: "var(--ph-panel)" }}>{Story()}</div>],
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 0 to 1 in 0.01 steps, 120 px wide. */
export const Default: Story = {};

/** Library tile size: five detents, grid glyph to filled square. */
export const TileSize: Story = {
  args: {
    label: "Tile size",
    min: 1,
    max: 5,
    step: 1,
    value: 3,
    width: 164,
    marks: [1, 2, 3, 4, 5],
    valueText: tileText,
    startGlyph: <Icon name="grid" size={14} />,
    endGlyph: <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, background: "currentColor" }} />,
  },
};

/** Pattern feel slider (swing, chance, fill). */
export const Feel: Story = { args: { label: "Swing", value: 0.25, valueText: (v) => `${Math.round(v * 100)} percent` } };

export const AtMinimum: Story = { args: { value: 0 } };

export const AtMaximum: Story = { args: { value: 1 } };

export const Wide: Story = { args: { width: 260, value: 0.7 } };

export const Disabled: Story = { args: { disabled: true } };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--ph-panel)", padding: 16 }}>
        <Controlled label="Amount" value={0.4} />
        <Controlled label="Amount" value={0} />
        <Controlled
          label="Tile size"
          min={1}
          max={5}
          step={1}
          value={3}
          width={164}
          marks={[1, 2, 3, 4, 5]}
          valueText={tileText}
          startGlyph={<Icon name="grid" size={14} />}
          endGlyph={<span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 2, background: "currentColor" }} />}
        />
        <Controlled label="Amount" value={0.6} disabled />
      </div>
    </ThemePair>
  ),
};
