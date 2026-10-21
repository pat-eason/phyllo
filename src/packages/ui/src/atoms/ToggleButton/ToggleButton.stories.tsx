import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { ToggleButton, type ToggleButtonProps } from "./ToggleButton";

const meta = {
  title: "Atoms/ToggleButton",
  component: ToggleButton,
  args: { kind: "mute", pressed: false, label: "Mute Kick", onChange: () => {}, size: 26 },
  argTypes: {
    kind: { control: "inline-radio", options: ["mute", "solo", "custom"] },
    size: { control: "inline-radio", options: [26, 30] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof ToggleButton>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live(props: Omit<ToggleButtonProps, "pressed" | "onChange"> & { initial?: boolean }) {
  const { initial = false, ...rest } = props;
  const [pressed, setPressed] = useState(initial);
  return <ToggleButton {...rest} pressed={pressed} onChange={setPressed} />;
}

export const Mute: Story = { render: (args) => <Live {...args} /> };
export const MuteOn: Story = { args: { pressed: true } };
export const Solo: Story = { args: { kind: "solo", label: "Solo Kick" } };
export const SoloOn: Story = { args: { kind: "solo", label: "Solo Kick", pressed: true } };
export const Custom: Story = { args: { kind: "custom", label: "Arm Kick", children: "R", pressed: true } };
export const Disabled: Story = { args: { disabled: true } };

/** Mixer variant: 30 px, full width of the strip. */
export const MixerFullWidth: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 96 }}>
      <Live kind="mute" label="Mute Kick" size={30} fullWidth initial />
      <Live kind="solo" label="Solo Kick" size={30} fullWidth />
    </div>
  ),
};

function Row() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <ToggleButton kind="mute" label="Mute" pressed={false} onChange={() => {}} />
      <ToggleButton kind="mute" label="Mute (on)" pressed onChange={() => {}} />
      <ToggleButton kind="solo" label="Solo" pressed={false} onChange={() => {}} />
      <ToggleButton kind="solo" label="Solo (on)" pressed onChange={() => {}} />
      <ToggleButton kind="mute" label="Mute (30)" size={30} pressed onChange={() => {}} />
      <ToggleButton kind="solo" label="Solo (disabled)" disabled pressed={false} onChange={() => {}} />
    </div>
  );
}

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <Row />
    </ThemePair>
  ),
};
