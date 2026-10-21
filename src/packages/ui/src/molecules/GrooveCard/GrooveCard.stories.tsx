import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { HOUSE_PREVIEW, NIGHT_BUS_PREVIEW, rowsFromPatterns } from "../_shared/punchcardFixtures";
import { GrooveCard, type GrooveCardProps, type GrooveSummary, type GrooveTileSize } from "./GrooveCard";

const NIGHT_BUS: GrooveSummary = {
  name: "Night bus",
  bpm: 82,
  key: "F major",
  lengthBars: 48,
  trackCount: 3,
  tags: [{ label: "lo-fi", color: "var(--ph-track-5)" }],
  favorite: true,
  editedLabel: "Today, 12:41",
  preview: NIGHT_BUS_PREVIEW,
};

const GROOVES: GrooveSummary[] = [
  NIGHT_BUS,
  {
    name: "Warehouse 4am",
    bpm: 128,
    key: "A minor",
    lengthBars: 64,
    trackCount: 5,
    tags: [
      { label: "house", color: "var(--ph-track-1)" },
      { label: "club", color: "var(--ph-track-3)" },
    ],
    favorite: false,
    editedLabel: "Yesterday",
    preview: HOUSE_PREVIEW,
  },
  {
    name: "Broken clock",
    bpm: 170,
    key: "D dorian",
    lengthBars: 32,
    trackCount: 4,
    tags: [],
    favorite: false,
    editedLabel: "Oct 3",
    preview: rowsFromPatterns(["x..x..x.x..x..x.", "..x...x...x...x.", "x.xx.xx.x.xx.xx."]),
  },
];

const noop = () => {};

const narrow: Decorator[] = [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>];

const meta = {
  title: "Molecules/GrooveCard",
  component: GrooveCard,
  args: { groove: NIGHT_BUS, variant: "tile", size: 3, previewing: false, onOpen: noop, onPreview: noop, onFavoriteChange: noop },
  argTypes: {
    variant: { control: "inline-radio", options: ["tile", "row"] },
    size: { control: "inline-radio", options: [1, 2, 3, 4, 5] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof GrooveCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tile: Story = { decorators: narrow };

export const Previewing: Story = { args: { previewing: true }, decorators: narrow };

export const NotFavorite: Story = { args: { groove: { ...NIGHT_BUS, favorite: false } }, decorators: narrow };

export const NoTags: Story = { args: { groove: GROOVES[2] ?? NIGHT_BUS }, decorators: narrow };

/** Interactive favorite toggle; the browser would persist it. */
export const FavoriteToggle: Story = {
  decorators: narrow,
  render: (args) => {
    function Toggle() {
      const [favorite, setFavorite] = useState(false);
      return <GrooveCard {...args} groove={{ ...NIGHT_BUS, favorite }} onFavoriteChange={setFavorite} />;
    }
    return <Toggle />;
  },
};

function SizeColumn({ size, ...args }: GrooveCardProps & { size: GrooveTileSize }) {
  const widths = { 1: 150, 2: 190, 3: 240, 4: 300, 5: 380 } as const;
  return (
    <div style={{ width: widths[size] }}>
      <GrooveCard {...args} size={size} />
    </div>
  );
}

/** The five tile steps at their minimum widths (150 / 190 / 240 / 300 / 380 px). Steps 1 and 2 hide meta and tags. */
export const TileSizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 16 }}>
      {([1, 2, 3, 4, 5] as const).map((size) => (
        <SizeColumn key={size} {...args} size={size} />
      ))}
    </div>
  ),
};

/** Auto-fill grid like the library, with the second tile previewing. */
export const Grid: Story = {
  render: (args) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: 14 }}>
      {GROOVES.map((groove, index) => (
        <GrooveCard key={groove.name} {...args} groove={groove} previewing={index === 1} />
      ))}
    </div>
  ),
};

const tableStyle = {
  width: "100%",
  minWidth: 860,
  borderCollapse: "collapse",
} as const;

const headStyle = {
  padding: "10px 8px",
  borderBottom: "1px solid var(--ph-line)",
  color: "var(--ph-muted)",
  font: "var(--ph-text-label)",
  letterSpacing: "0.08em",
  textAlign: "left",
} as const;

function RowTable({ args, previewingIndex }: { args: GrooveCardProps; previewingIndex?: number }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--ph-line)", borderRadius: "var(--ph-r-xl)", background: "var(--ph-panel)" }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th scope="col" style={{ ...headStyle, width: 52, paddingLeft: 14 }}>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Play</span>
            </th>
            {["NAME", "TAGS", "BPM", "KEY", "LENGTH", "TRACKS", "EDITED"].map((heading) => (
              <th key={heading} scope="col" style={headStyle}>
                {heading}
              </th>
            ))}
            <th scope="col" style={{ ...headStyle, width: 44 }}>
              <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Favorite</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {GROOVES.map((groove, index) => (
            <GrooveCard key={groove.name} {...args} groove={groove} variant="row" previewing={index === previewingIndex} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** List view: one `<tr>` per groove inside the browser's table. */
export const Row: Story = {
  render: (args) => <RowTable args={args} previewingIndex={1} />,
};

export const Themes: Story = {
  render: (args) => (
    <ThemePair padding={16}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--ph-bg)", padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <GrooveCard {...args} />
          <GrooveCard {...args} groove={{ ...NIGHT_BUS, favorite: false }} previewing size={4} />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ ...tableStyle, minWidth: 0 }}>
            <tbody>
              <GrooveCard {...args} variant="row" />
              <GrooveCard {...args} variant="row" groove={{ ...NIGHT_BUS, favorite: false }} previewing />
            </tbody>
          </table>
        </div>
      </div>
    </ThemePair>
  ),
};
