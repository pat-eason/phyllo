import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Chip } from "./Chip";

const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 } as const;

const meta = {
  title: "Atoms/Chip",
  component: Chip,
  args: { variant: "filter", children: "TR-909" },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filter: Story = { args: { variant: "filter", children: "TR-808", selected: false } };

export const FilterSelected: Story = { args: { variant: "filter", children: "TR-909", selected: true } };

/** Parent-owned single select, as in the drum kit picker. */
export const FilterGroup: Story = {
  render: () => {
    function Group() {
      const [bank, setBank] = useState("RolandTR909");
      return (
        <div role="group" aria-label="Drum kit" style={row}>
          {[
            ["RolandTR909", "TR-909"],
            ["RolandTR808", "TR-808"],
            ["LinnDrum", "LinnDrum"],
          ].map(([id, name]) => (
            <Chip key={id} variant="filter" selected={bank === id} onClick={() => setBank(id!)}>
              {name}
            </Chip>
          ))}
        </div>
      );
    }
    return <Group />;
  },
};

export const FilterSmall: Story = { args: { variant: "filter", size: "sm", children: "Drums", selected: true } };

export const Tag: Story = { args: { variant: "tag", children: "lo-fi", color: "var(--ph-track-5)" } };

export const TagWithoutColor: Story = { args: { variant: "tag", children: "sketch" } };

export const Removable: Story = {
  render: () => {
    function Active() {
      const [tags, setTags] = useState(["house", "techno", "lo-fi"]);
      return (
        <div style={row}>
          {tags.map((tag) => (
            <Chip key={tag} variant="removable" onRemove={() => setTags((current) => current.filter((t) => t !== tag))}>
              {tag}
            </Chip>
          ))}
          {tags.length === 0 ? <span style={{ font: "var(--ph-text-small)", color: "var(--ph-muted)" }}>No filters</span> : null}
        </div>
      );
    }
    return <Active />;
  },
};

export const RemovableSmall: Story = { args: { variant: "removable", size: "sm", children: "house" } };

export const Code: Story = { args: { variant: "code", children: "supersaw" } };

export const Meta_: Story = {
  name: "Meta",
  render: () => (
    <div style={row}>
      <Chip variant="meta">124 BPM</Chip>
      <Chip variant="meta">4 tracks</Chip>
    </div>
  ),
};

export const Disabled: Story = { args: { variant: "filter", children: "TR-808", disabled: true } };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, background: "var(--ph-bg)", padding: 16 }}>
        <div style={row}>
          <Chip variant="filter" selected>
            TR-909
          </Chip>
          <Chip variant="filter">TR-808</Chip>
          <Chip variant="filter" disabled>
            Disabled
          </Chip>
        </div>
        <div style={row}>
          <Chip variant="tag" color="var(--ph-track-5)">
            lo-fi
          </Chip>
          <Chip variant="tag" color="var(--ph-track-1)">
            house
          </Chip>
          <Chip variant="removable">house</Chip>
        </div>
        <div style={row}>
          <Chip variant="code">supersaw</Chip>
          <Chip variant="code">sawtooth</Chip>
          <Chip variant="meta">124 BPM</Chip>
        </div>
      </div>
    </ThemePair>
  ),
};
