import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { TransportKey, type TransportKeySize } from "./TransportKey";

const meta = {
  title: "Atoms/TransportKey",
  component: TransportKey,
  args: { kind: "play", active: false, size: "md", onClick: () => {} },
  argTypes: {
    kind: { control: "inline-radio", options: ["play", "stop", "record", "loop", "to-start"] },
    size: { control: "inline-radio", options: ["md", "lg"] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof TransportKey>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Play: Story = {};
export const Playing: Story = { args: { kind: "play", active: true } };
export const Stop: Story = { args: { kind: "stop" } };
export const Record: Story = { args: { kind: "record" } };
export const RecordArmed: Story = { args: { kind: "record", active: true } };
export const Loop: Story = { args: { kind: "loop" } };
export const LoopOn: Story = { args: { kind: "loop", active: true } };
export const ToStart: Story = { args: { kind: "to-start" } };
export const Disabled: Story = { args: { kind: "stop", disabled: true } };

/** The Kit's grouping: keys sit on a raised plate (TransportControls owns this in the app). */
const plate: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: 4,
  borderRadius: 12,
  border: "1px solid var(--ph-line)",
  background: "var(--ph-panel-grad)",
  boxShadow: "var(--ph-shadow-btn)",
};

function KeyStrip({ size = "md", playing: initialPlaying = false, armed: initialArmed = false }: { size?: TransportKeySize; playing?: boolean; armed?: boolean }) {
  const [playing, setPlaying] = useState(initialPlaying);
  const [armed, setArmed] = useState(initialArmed);
  const [loop, setLoop] = useState(true);
  return (
    <div style={plate}>
      <TransportKey kind="to-start" size={size} />
      <TransportKey kind="play" size={size} active={playing} onClick={() => setPlaying(!playing)} />
      <TransportKey kind="stop" size={size} onClick={() => setPlaying(false)} />
      <TransportKey kind="record" size={size} active={armed} onClick={() => setArmed(!armed)} />
      <TransportKey kind="loop" size={size} active={loop} onClick={() => setLoop(!loop)} />
    </div>
  );
}

export const Strip: Story = {
  render: () => <KeyStrip />,
};

export const Large: Story = {
  render: () => <KeyStrip size="lg" />,
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <KeyStrip />
        <KeyStrip playing armed />
      </div>
    </ThemePair>
  ),
};
