import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePair } from "../../stories/ThemePair";
import { Logo } from "./Logo";

const meta = {
  title: "Atoms/Logo",
  component: Logo,
  args: { size: 24, wordmark: true, tone: "accent", tile: false },
  argTypes: {
    tone: { control: "inline-radio", options: ["accent", "text"] },
    size: { control: { type: "number", min: 16, max: 96 } },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Header usage: 26 px mark with the wordmark. */
export const Default: Story = {
  args: { size: 26 },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
};

export const MarkOnly: Story = {
  args: { size: 48, wordmark: false },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
};

/** The mark takes the text colour instead of the accent. */
export const TextTone: Story = {
  args: { size: 30, tone: "text" },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
};

/** Toast and app icon: mark at 75% on a rounded panel tile. */
export const Tile: Story = {
  args: { size: 30, tile: true, wordmark: false },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24, alignItems: "flex-start" }}>
      {[16, 24, 26, 30, 48, 96].map((size) => (
        <Logo key={size} size={size} wordmark={size <= 30} />
      ))}
    </div>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <Logo size={30} />
      <Logo size={48} wordmark={false} />
      <Logo size={30} tone="text" />
      <div style={{ padding: 12, background: "var(--ph-chrome)", borderRadius: 12 }}>
        <Logo size={30} tile wordmark={false} />
      </div>
    </ThemePair>
  ),
};
