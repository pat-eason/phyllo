import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Select, type SelectOption, type SelectProps } from "./Select";

type SnapValue = "1/16" | "1/4" | "1";

const SNAP_OPTIONS: SelectOption<SnapValue>[] = [
  { value: "1/16", label: "1/16" },
  { value: "1/4", label: "1 beat" },
  { value: "1", label: "1 bar" },
];

const RATE_OPTIONS: SelectOption<string>[] = [
  { value: "44100", label: "44.1 kHz" },
  { value: "48000", label: "48 kHz" },
  { value: "96000", label: "96 kHz" },
];

const SOUND_OPTIONS: SelectOption<string>[] = [
  { value: "sawtooth", label: 's("sawtooth")', description: "Bright, buzzy" },
  { value: "square", label: 's("square")', description: "Hollow" },
  { value: "triangle", label: 's("triangle")', description: "Soft" },
];

function Controlled<T extends string>(args: Omit<SelectProps<T>, "onChange">) {
  const [value, setValue] = useState<T>(args.value);
  return <Select {...args} value={value} onChange={setValue} />;
}

const meta = {
  title: "Atoms/Select",
  component: Select,
  args: { label: "Select", value: "", options: [], onChange: () => undefined },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <Controlled label="Sample rate" value="48000" options={RATE_OPTIONS} />,
};

export const TopLabel: Story = {
  render: () => <Controlled label="Sample rate" labelPosition="top" value="48000" options={RATE_OPTIONS} minWidth={180} />,
};

/** Reads as "Snap 1 bar" with the label muted. */
export const InlineLabel: Story = {
  render: () => <Controlled label="Snap" labelPosition="inline" value="1" options={SNAP_OPTIONS} />,
};

export const Small: Story = {
  render: () => <Controlled label="Snap" labelPosition="inline" size="sm" value="1/4" options={SNAP_OPTIONS} />,
};

/** 40 px, the select height in the Export and Onboarding mockups. */
export const Size40: Story = {
  render: () => <Controlled label="Sample rate" labelPosition="top" size={40} value="48000" options={RATE_OPTIONS} minWidth={180} />,
};

export const Mono: Story = {
  render: () => <Controlled label="Sound" labelPosition="top" mono value="sawtooth" options={SOUND_OPTIONS} minWidth={200} />,
};

export const Disabled: Story = {
  render: () => <Controlled label="Sample rate" disabled value="48000" options={RATE_OPTIONS} />,
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, background: "var(--ph-bg)", padding: 16 }}>
        <Controlled label="Sample rate" value="48000" options={RATE_OPTIONS} />
        <Controlled label="Snap" labelPosition="inline" value="1" options={SNAP_OPTIONS} />
        <Controlled label="Sound" labelPosition="top" mono value="sawtooth" options={SOUND_OPTIONS} minWidth={200} />
        <Controlled label="Sample rate" disabled value="48000" options={RATE_OPTIONS} />
      </div>
    </ThemePair>
  ),
};
