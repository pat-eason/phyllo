import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePair } from "../../stories/ThemePair";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Molecules/EmptyState",
  component: EmptyState,
  args: { title: "No grooves match", body: "Try a different word, or remove a tag filter." },
  decorators: [(Story) => <div style={{ padding: 24, maxWidth: 420 }}>{Story()}</div>],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = { args: { action: { label: "Clear filters", onClick: () => {} } } };
export const Compact: Story = { args: { compact: true } };
export const TitleOnly: Story = { args: { title: "No grooves yet", body: undefined } };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}>
        <EmptyState {...meta.args} compact />
        <EmptyState {...meta.args} action={{ label: "Clear filters", onClick: () => {} }} />
      </div>
    </ThemePair>
  ),
};
