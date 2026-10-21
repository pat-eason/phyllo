import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePair } from "../../stories/ThemePair";
import { Icon, type IconSize } from "./Icon";
import { ICON_NAMES } from "./icons";

const SIZES: IconSize[] = [12, 14, 16, 18, 20];

const meta = {
  title: "Atoms/Icon",
  component: Icon,
  args: { name: "loop", size: 18 },
  argTypes: {
    name: { control: "select", options: ICON_NAMES },
    size: { control: "inline-radio", options: SIZES },
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Colour comes from the parent via `currentColor`. */
export const Colors: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 16, padding: 24 }}>
      <span style={{ color: "var(--ph-text)" }}>
        <Icon {...args} />
      </span>
      <span style={{ color: "var(--ph-muted)" }}>
        <Icon {...args} />
      </span>
      <span style={{ color: "var(--ph-accent)" }}>
        <Icon {...args} />
      </span>
      <span style={{ color: "var(--ph-rec)" }}>
        <Icon {...args} />
      </span>
    </div>
  ),
};

/** `filled` fills the star (favorite on); transport glyphs and `drag` are always solid. */
export const Filled: Story = {
  args: { name: "star", size: 20 },
  render: (args) => (
    <div style={{ display: "flex", gap: 16, padding: 24, color: "var(--ph-star)" }}>
      <Icon {...args} />
      <Icon {...args} filled />
    </div>
  ),
};

/** A standalone meaningful icon gets `role="img"` and a `<title>`. */
export const WithTitle: Story = {
  args: { name: "tip", size: 20, title: "Tip" },
  render: (args) => (
    <div style={{ padding: 24, color: "var(--ph-accent)" }}>
      <Icon {...args} />
    </div>
  ),
};

function Cell({ name, size }: { name: (typeof ICON_NAMES)[number]; size: IconSize }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "8px 0 6px",
        borderRadius: 8,
        background: "var(--ph-panel)",
        color: "var(--ph-text)",
      }}
    >
      <Icon name={name} size={size} />
      <span style={{ font: "400 9.5px/1.2 var(--ph-font-mono)", color: "var(--ph-muted)" }}>{name}</span>
    </div>
  );
}

function Grid({ size }: { size: IconSize }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ font: "400 11px/1.2 var(--ph-font-mono)", color: "var(--ph-muted)" }}>size={size}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
        {ICON_NAMES.map((name) => (
          <Cell key={name} name={name} size={size} />
        ))}
      </div>
    </section>
  );
}

/** Every icon at every supported size. */
export const Gallery: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
      {SIZES.map((s) => (
        <Grid key={s} size={s} />
      ))}
    </div>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, width: "100%" }}>
        {ICON_NAMES.map((name) => (
          <Cell key={name} name={name} size={18} />
        ))}
      </div>
    </ThemePair>
  ),
};
