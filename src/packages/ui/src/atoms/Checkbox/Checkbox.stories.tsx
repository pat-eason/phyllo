import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Checkbox, type CheckboxProps } from "./Checkbox";

const meta = {
  title: "Atoms/Checkbox",
  component: Checkbox,
  args: { checked: true, label: "Normalize peak to −1 dBFS", onChange: () => {} },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live({ initial = false, ...rest }: Omit<CheckboxProps, "checked" | "onChange"> & { initial?: boolean }) {
  const [checked, setChecked] = useState(initial);
  return <Checkbox {...rest} checked={checked} onChange={setChecked} />;
}

export const Checked: Story = { render: (args) => <Live {...args} initial /> };
export const Unchecked: Story = { args: { checked: false } };
export const Indeterminate: Story = { args: { checked: false, indeterminate: true, label: "Select all stems" } };
export const Disabled: Story = { args: { disabled: true } };

/** "Select all" derives its state from the children, the way the Stems list will. */
export const SelectAll: Story = {
  render: () => {
    const stems = ["Kick", "Bass", "Lead"];
    return <StemList stems={stems} />;
  },
};

function StemList({ stems }: { stems: string[] }) {
  const [picked, setPicked] = useState<string[]>(["Kick"]);
  const all = picked.length === stems.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Checkbox label="Select all stems" checked={all} indeterminate={!all && picked.length > 0} onChange={(on) => setPicked(on ? stems : [])} />
      {stems.map((stem) => (
        <Checkbox
          key={stem}
          label={stem}
          checked={picked.includes(stem)}
          onChange={(on) => setPicked(on ? [...picked, stem] : picked.filter((s) => s !== stem))}
          style={{ marginLeft: 20 }}
        />
      ))}
    </div>
  );
}

function Col() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
      <Checkbox checked label="Normalize" onChange={() => {}} />
      <Checkbox checked={false} label="Dither" onChange={() => {}} />
      <Checkbox checked={false} indeterminate label="Select all stems" onChange={() => {}} />
      <Checkbox checked disabled label="Disabled" onChange={() => {}} />
    </div>
  );
}

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <Col />
    </ThemePair>
  ),
};
