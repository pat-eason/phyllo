import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { SectionChip } from "./SectionChip";

const meta = {
  title: "Molecules/SectionChip",
  component: SectionChip,
  args: { name: "Groove", startBar: 9, endBar: 16, current: false },
  decorators: [(Story) => <div style={{ padding: 24, width: 240 }}>{Story()}</div>],
} satisfies Meta<typeof SectionChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Other: Story = {};
export const Current: Story = { args: { current: true } };
export const SingleBar: Story = { args: { name: "Hit", startBar: 12, endBar: 12 } };

/** Double-click the name (or press F2) to rename. */
function Renamable() {
  const [name, setName] = useState("Groove");
  return <SectionChip name={name} startBar={9} endBar={16} current onRename={setName} />;
}
export const Renaming: Story = { render: () => <Renamable /> };

/** How the ruler uses it: each chip positioned by left/width in the timeline's percentage space. */
function Ruler() {
  const [current, setCurrent] = useState("Groove");
  const sections = [
    { name: "Intro", startBar: 1, endBar: 8, left: 0, width: 46 },
    { name: "Groove", startBar: 9, endBar: 16, left: 50, width: 46 },
  ];
  return (
    <div
      style={{
        position: "relative",
        height: 36,
        width: 360,
        borderRadius: 8,
        background: "var(--ph-chrome)",
        border: "1px solid var(--ph-line)",
      }}
    >
      {sections.map((s) => (
        <SectionChip
          key={s.name}
          {...s}
          current={current === s.name}
          onSelect={() => setCurrent(s.name)}
          style={{ position: "absolute", top: 6, left: `${s.left}%`, width: `${s.width}%` }}
        />
      ))}
    </div>
  );
}
export const InRuler: Story = { render: () => <Ruler /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", gap: 8 }}>
        <SectionChip name="Groove" startBar={9} endBar={16} current />
        <SectionChip name="Break" startBar={17} endBar={20} current={false} />
      </div>
    </ThemePair>
  ),
};
