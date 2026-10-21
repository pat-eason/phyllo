import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { BLANK_PREVIEW, HOUSE_PREVIEW, NIGHT_BUS_PREVIEW, rowsFromPatterns } from "../_shared/punchcardFixtures";
import { StarterCard } from "./StarterCard";

const narrow: Decorator[] = [(Story) => <div style={{ maxWidth: 300 }}>{Story()}</div>];

const meta = {
  title: "Molecules/StarterCard",
  component: StarterCard,
  args: {
    name: "House groove",
    description: "Four on the floor with a bouncing bass line.",
    bpm: 124,
    trackCount: 4,
    preview: HOUSE_PREVIEW,
    selected: false,
    onSelect: () => {},
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof StarterCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { decorators: narrow };

export const Selected: Story = { args: { selected: true }, decorators: narrow };

export const Empty: Story = {
  decorators: narrow,
  args: { name: "Blank project", description: "No tracks. Drag sounds in from the library.", bpm: 120, trackCount: "Empty", preview: BLANK_PREVIEW },
};

export const Disabled: Story = { args: { disabled: true }, decorators: narrow };

const STARTERS = [
  { id: "house", name: "House groove", description: "Four on the floor with a bouncing bass line.", bpm: 124, trackCount: 4 as const, preview: HOUSE_PREVIEW },
  { id: "lofi", name: "Lo-fi keys", description: "Dusty chords and a lazy, swung beat.", bpm: 82, trackCount: 3 as const, preview: NIGHT_BUS_PREVIEW },
  {
    id: "euclid",
    name: "Euclid rhythms",
    description: "Learn rhythm math: spread N hits evenly over M steps.",
    bpm: 110,
    trackCount: 3 as const,
    preview: rowsFromPatterns(["x..x..x.x..x..x.", "..x...x...x...x.", "x.xx.xx.x.xx.xx."]),
  },
  { id: "blank", name: "Blank project", description: "No tracks. Drag sounds in from the library.", bpm: 120, trackCount: "Empty" as const, preview: BLANK_PREVIEW },
];

/** Parent-owned single select inside a group labelled "Starters", as in the Guided start grid. */
export const Group: Story = {
  render: () => {
    function Grid() {
      const [pick, setPick] = useState("house");
      return (
        <section aria-label="Starters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
          {STARTERS.map(({ id, ...starter }) => (
            <StarterCard key={id} {...starter} selected={pick === id} onSelect={() => setPick(id)} />
          ))}
        </section>
      );
    }
    return <Grid />;
  },
};

export const Themes: Story = {
  render: (args) => (
    <ThemePair>
      <div style={{ display: "flex", gap: 12, background: "var(--ph-bg)", padding: 16 }}>
        <div style={{ flex: 1 }}>
          <StarterCard {...args} selected />
        </div>
        <div style={{ flex: 1 }}>
          <StarterCard {...args} name="Blank project" description="No tracks." trackCount="Empty" preview={BLANK_PREVIEW} />
        </div>
      </div>
    </ThemePair>
  ),
};
