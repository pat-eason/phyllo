import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Switch, type SwitchProps } from "./Switch";

const meta = {
  title: "Atoms/Switch",
  component: Switch,
  args: { checked: false, label: "Media keys control playback", size: "md", onChange: () => {} },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live({ initial = false, ...rest }: Omit<SwitchProps, "checked" | "onChange"> & { initial?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return <Switch {...rest} checked={checked} onChange={setChecked} />;
}

export const Off: Story = { render: (args) => <Live {...args} /> };
export const On: Story = { args: { checked: true } };
export const Small: Story = { args: { size: "sm", checked: true, label: "Enable modifier" } };
export const SmallOff: Story = { args: { size: "sm", label: "Enable modifier" } };
export const Disabled: Story = { args: { disabled: true, checked: true } };

/** With visible text, link it with `aria-labelledby` instead of relying on `label`. */
export const WithVisibleLabel: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ph-text)" }}>
      <Live id="media-keys" label="Media keys" aria-labelledby="media-keys-text" initial />
      <span id="media-keys-text">Media keys control playback</span>
    </div>
  ),
};

function Row() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <div style={{ display: "flex", gap: 10 }}>
        <Switch checked label="On" onChange={() => {}} />
        <Switch checked={false} label="Off" onChange={() => {}} />
        <Switch checked disabled label="On, disabled" onChange={() => {}} />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Switch size="sm" checked label="On" onChange={() => {}} />
        <Switch size="sm" checked={false} label="Off" onChange={() => {}} />
        <Switch size="sm" checked={false} disabled label="Off, disabled" onChange={() => {}} />
      </div>
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
