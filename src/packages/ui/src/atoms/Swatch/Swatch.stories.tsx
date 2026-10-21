import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState, type KeyboardEvent } from "react";
import tokens from "../../tokens.json";
import { ThemePair } from "../../stories/ThemePair";
import { Swatch } from "./Swatch";

const ACCENT_IDS = ["green", "red", "blue", "purple", "orange", "teal"] as const;
type AccentId = (typeof ACCENT_IDS)[number];

const ACCENTS = ACCENT_IDS.map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  shades: [tokens.accent[id].dark, tokens.accent[id].light] as [string, string],
}));

const TRACK_COLORS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: n, color: `var(--ph-track-${n})`, name: `Track color ${n}` }));

/**
 * Minimal parent showing the radiogroup contract: roving tabIndex and arrow keys live here, not in Swatch.
 */
function RadioGroup<T extends string | number>({
  label,
  items,
  initial,
  size,
  showLabel,
}: {
  label: string;
  items: { id: T; name: string; color: string | [string, string] }[];
  initial: T;
  size: 30 | 40;
  showLabel?: boolean;
}) {
  const [value, setValue] = useState<T>(initial);
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = items.findIndex((item) => item.id === value);
    const next = items[(index + step + items.length) % items.length]!;
    setValue(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- children are the focusable radios
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} style={{ display: "flex", flexWrap: "wrap", gap: showLabel ? 10 : 8 }}>
      {items.map((item) => (
        <Swatch
          key={item.id}
          ref={(node) => {
            if (node) refs.current.set(item.id, node);
            else refs.current.delete(item.id);
          }}
          color={item.color}
          label={item.name}
          size={size}
          showLabel={showLabel}
          selected={item.id === value}
          tabIndex={item.id === value ? 0 : -1}
          onSelect={() => setValue(item.id)}
        />
      ))}
    </div>
  );
}

const meta = {
  title: "Atoms/Swatch",
  component: Swatch,
  args: { color: ["#8FE388", "#1F7A2E"], selected: false, label: "Green", size: 30, showLabel: false, onSelect: () => {} },
  argTypes: {
    size: { control: "inline-radio", options: [30, 40] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Swatch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

/** Single color, for the (proposed) track color menu. */
export const TrackColor: Story = {
  args: { color: "var(--ph-track-4)", label: "Amber", selected: true },
};

/** Settings > Appearance: 40 px swatches with captions, arrow keys move selection. */
export const AccentPicker: Story = {
  render: () => <RadioGroup<AccentId> label="Accent" items={ACCENTS.map((a) => ({ id: a.id, name: a.name, color: a.shades }))} initial="green" size={40} showLabel />,
};

/** Compact 30 px accents as in the Kit's atom panel. */
export const Compact: Story = {
  render: () => <RadioGroup<AccentId> label="Accent" items={ACCENTS.map((a) => ({ id: a.id, name: a.name, color: a.shades }))} initial="green" size={30} />,
};

export const TrackColors: Story = {
  render: () => <RadioGroup<number> label="Track color" items={TRACK_COLORS} initial={1} size={30} />,
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <RadioGroup<AccentId> label="Accent (compact)" items={ACCENTS.map((a) => ({ id: a.id, name: a.name, color: a.shades }))} initial="green" size={30} />
      <RadioGroup<AccentId> label="Accent" items={ACCENTS.slice(0, 4).map((a) => ({ id: a.id, name: a.name, color: a.shades }))} initial="blue" size={40} showLabel />
      <RadioGroup<number> label="Track color" items={TRACK_COLORS} initial={3} size={30} />
    </ThemePair>
  ),
};
