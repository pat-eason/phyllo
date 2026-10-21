import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { SegmentedControl, type SegmentedOption } from "./SegmentedControl";

const meta = {
  title: "Atoms/SegmentedControl",
  component: SegmentedControl,
  args: {
    label: "Interface depth",
    options: [
      { value: "guided", label: "Guided" },
      { value: "pro", label: "Pro" },
    ],
    value: "guided",
    onChange: () => {},
    tone: "accent",
    size: "md",
    semantics: "radio",
  },
  argTypes: {
    tone: { control: "inline-radio", options: ["accent", "neutral"] },
    size: { control: "inline-radio", options: ["sm", "md"] },
    semantics: { control: "inline-radio", options: ["radio", "tabs", "toggle"] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const DEPTH: SegmentedOption<string>[] = [
  { value: "guided", label: "Guided" },
  { value: "pro", label: "Pro" },
];
const LIBRARY_TABS: SegmentedOption<string>[] = [
  { value: "sounds", label: "Sounds" },
  { value: "samples", label: "Samples" },
  { value: "starters", label: "Starters" },
];
const THEME: SegmentedOption<string>[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];
const VIEW: SegmentedOption<string>[] = [
  { value: "grid", icon: "grid", ariaLabel: "Grid" },
  { value: "list", icon: "list", ariaLabel: "List" },
];
const TOOLS: SegmentedOption<string>[] = [
  { value: "select", icon: "select", ariaLabel: "Select" },
  { value: "draw", icon: "draw", ariaLabel: "Draw" },
  { value: "split", icon: "split", ariaLabel: "Split" },
];

function Demo({
  options,
  initial,
  ...rest
}: {
  options: SegmentedOption<string>[];
  initial: string;
  label: string;
  tone?: "accent" | "neutral";
  size?: "sm" | "md";
  semantics?: "radio" | "tabs" | "toggle";
  stretch?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return <SegmentedControl options={options} value={value} onChange={setValue} {...rest} />;
}

/** Guided/Pro in the title bar: accent fill, `toggle` semantics (each button has `aria-pressed`). */
export const GuidedPro: Story = {
  render: () => <Demo label="Interface depth" tone="accent" semantics="toggle" options={DEPTH} initial="guided" />,
};

/** Library tabs: neutral raised selection, `tabs` semantics, segments share the width. */
export const Tabs: Story = {
  render: () => (
    <div style={{ width: 240 }}>
      <Demo label="Library" semantics="tabs" stretch options={LIBRARY_TABS} initial="sounds" />
    </div>
  ),
};

/** Default `radio` semantics: arrow keys move the selection and wrap. */
export const Radio: Story = {
  render: () => <Demo label="Theme" tone="accent" options={THEME} initial="dark" />,
};

export const IconOnly: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12 }}>
      <Demo label="View" options={VIEW} initial="grid" />
      <Demo label="Edit tool" options={TOOLS} initial="select" />
    </div>
  ),
};

export const Small: Story = {
  render: () => <Demo label="Code scope" size="sm" options={[{ value: "track", label: "Track" }, { value: "all", label: "All" }]} initial="track" />,
};

export const Disabled: Story = {
  render: () => (
    <Demo
      label="Editor"
      options={[
        { value: "steps", label: "Steps" },
        { value: "roll", label: "Piano roll", disabled: true },
        { value: "code", label: "Code" },
      ]}
      initial="steps"
    />
  ),
};

function Stack() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
      <Demo label="Interface depth" tone="accent" semantics="toggle" options={DEPTH} initial="guided" />
      <Demo label="Theme" tone="accent" options={THEME} initial="dark" />
      <div style={{ width: 240 }}>
        <Demo label="Library" semantics="tabs" stretch options={LIBRARY_TABS} initial="samples" />
      </div>
      <Demo label="View" options={VIEW} initial="list" />
      <Demo label="Code scope" size="sm" options={[{ value: "track", label: "Track" }, { value: "all", label: "All" }]} initial="all" />
    </div>
  );
}

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <Stack />
    </ThemePair>
  ),
};
