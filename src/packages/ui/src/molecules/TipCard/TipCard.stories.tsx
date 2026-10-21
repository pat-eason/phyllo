import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { TipCard } from "./TipCard";

const body = (
  <>
    Turn <strong>Brightness</strong> on the right, or pick a suggestion under <strong>Try one</strong>. Each change updates the code below.
  </>
);

const meta = {
  title: "Molecules/TipCard",
  component: TipCard,
  args: {
    step: 3,
    total: 5,
    title: "Give the bass some movement",
    body,
    primaryLabel: "Show me",
    onPrimary: () => {},
    onDismiss: () => {},
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof TipCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FirstStep: Story = { args: { step: 1, title: "Press play to hear your groove", body: "Space starts and stops the transport." } };

export const LastStep: Story = { args: { step: 5, title: "Export when you are happy", body: "Pick a format and Phyllo renders it." } };

/** Kit variant: single row, no progress bar. */
export const Compact: Story = { args: { compact: true, body: "Turn Brightness, or pick a suggestion." } };

/** Without `onPrimary` only the dismiss action shows. */
export const DismissOnly: Story = { args: { onPrimary: undefined } };

/** Steps advance in place; the text column is a polite live region. */
export const Stepping: Story = {
  render: (args) => {
    function Stepper() {
      const [step, setStep] = useState(1);
      return <TipCard {...args} step={step} title={`Tip number ${step}`} onPrimary={() => setStep((current) => (current % args.total) + 1)} />;
    }
    return <Stepper />;
  },
};

export const Themes: Story = {
  render: (args) => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--ph-bg)", padding: 16 }}>
        <TipCard {...args} />
        <TipCard {...args} compact body="Turn Brightness, or pick a suggestion." />
      </div>
    </ThemePair>
  ),
};
