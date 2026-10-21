import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePair } from "../../stories/ThemePair";
import { Kbd } from "./Kbd";

const meta = {
  title: "Atoms/Kbd",
  component: Kbd,
  args: { keys: ["⌘", "K"] },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Kbd>;

export default meta;
type Story = StoryObj<typeof meta>;

/** macOS: glyphs, spoken as "Command K". */
export const Default: Story = {};

export const SingleKey: Story = { args: { keys: ["Esc"] } };

/** Windows/Linux: the organism passes `Ctrl` / `Shift` words instead of glyphs. */
export const WindowsLinux: Story = { args: { keys: ["Ctrl", "Shift", "P"] } };

export const MacModifiers: Story = { args: { keys: ["⌘", "⇧", "P"] } };

export const Inline: Story = {
  render: () => (
    <p style={{ font: "var(--ph-text-body)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
      Search sounds <Kbd keys={["⌘", "K"]} /> or play/pause <Kbd keys={["Space"]} />
    </p>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Kbd keys={["⌘", "K"]} />
        <Kbd keys={["Ctrl", "K"]} />
        <Kbd keys={["Space"]} />
        <Kbd keys={["⇧", "⌥", "Z"]} />
      </div>
    </ThemePair>
  ),
};
