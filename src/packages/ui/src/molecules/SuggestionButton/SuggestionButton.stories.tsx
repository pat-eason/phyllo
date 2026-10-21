import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { SuggestionButton } from "./SuggestionButton";

const TRIES = [
  { label: "Slow filter sweep", code: ".lpf(sine.range(400,1400).slow(8))" },
  { label: "Bouncier", code: ".swingBy(1/6, 4)" },
  { label: "Busier now and then", code: ".sometimes(x => x.ply(2))" },
  { label: "Flip every 4th bar", code: ".lastOf(4, rev)" },
];

/** Inspector "Try one": 2-column grid, click to add / remove. */
function TryOne({ initial = [] as number[] }) {
  const [applied, setApplied] = useState(() => new Set(initial));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, width: 272 }}>
      {TRIES.map((t, i) => (
        <SuggestionButton
          key={t.code}
          label={t.label}
          code={t.code}
          applied={applied.has(i)}
          onToggle={(on) =>
            setApplied((s) => {
              const next = new Set(s);
              if (on) next.add(i);
              else next.delete(i);
              return next;
            })
          }
        />
      ))}
    </div>
  );
}

const meta = {
  title: "Molecules/SuggestionButton",
  component: SuggestionButton,
  args: { label: "Bouncier", code: ".swingBy(1/6, 4)", applied: false, disabled: false, onToggle: () => {} },
  decorators: [(Story) => <div style={{ padding: 24, display: "flex" }}>{Story()}</div>],
} satisfies Meta<typeof SuggestionButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Already on the track: accent border, soft fill, check. */
export const Applied: Story = { args: { applied: true } };

/** Long code ellipsizes; the full code is the tooltip. */
export const LongCode: Story = {
  args: { label: "Slow filter sweep", code: ".lpf(sine.range(400,1400).slow(8))" },
  decorators: [(Story) => <div style={{ width: 133 }}>{Story()}</div>],
};

export const Disabled: Story = { args: { disabled: true } };

export const Grid: Story = { render: () => <TryOne initial={[1]} /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", gap: 8 }}>
        <SuggestionButton label="Bouncier" code=".swingBy(1/6, 4)" applied={false} onToggle={() => {}} />
        <SuggestionButton label="Bouncier" code=".swingBy(1/6, 4)" applied onToggle={() => {}} />
      </div>
      <TryOne initial={[2]} />
    </ThemePair>
  ),
};
