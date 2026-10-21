import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
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

/**
 * A removable chip unmounts itself, so `onRemove` must move focus: here to the chip that takes its place (or the
 * previous one, or the "No filters" note when the last chip goes). Without this focus drops to `<body>`.
 */
export const Removable: Story = {
  render: () => {
    function Active() {
      const [tags, setTags] = useState(["house", "techno", "lo-fi"]);
      const groupRef = useRef<HTMLDivElement>(null);
      const emptyRef = useRef<HTMLSpanElement>(null);

      function remove(tag: string) {
        const index = tags.indexOf(tag);
        const remaining = tags.filter((t) => t !== tag);
        flushSync(() => setTags(remaining));
        const chips = groupRef.current?.querySelectorAll<HTMLButtonElement>("button");
        (chips?.[Math.min(index, remaining.length - 1)] ?? emptyRef.current)?.focus();
      }

      return (
        <div ref={groupRef} role="group" aria-label="Active filters" style={row}>
          {tags.map((tag) => (
            <Chip key={tag} variant="removable" onRemove={() => remove(tag)}>
              {tag}
            </Chip>
          ))}
          {tags.length === 0 ? (
            <span ref={emptyRef} tabIndex={-1} style={{ font: "var(--ph-text-small)", color: "var(--ph-muted)" }}>
              No filters
            </span>
          ) : null}
        </div>
      );
    }
    return <Active />;
  },
};

export const RemovableSmall: Story = { args: { variant: "removable", size: "sm", children: "house" } };

export const Code: Story = { args: { variant: "code", children: "supersaw" } };

/** `selected` on a code chip adds `aria-pressed` and the accent look (the chosen waveform in a picker). */
export const CodeSelected: Story = { args: { variant: "code", children: "sawtooth", selected: true } };

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
          <Chip variant="code" selected>
            sawtooth
          </Chip>
          <Chip variant="meta">124 BPM</Chip>
        </div>
      </div>
    </ThemePair>
  ),
};
