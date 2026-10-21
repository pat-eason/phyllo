import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePair } from "../../stories/ThemePair";
import { Button } from "./Button";

const meta = {
  title: "Atoms/Button",
  component: Button,
  args: { children: "Continue", variant: "secondary", size: "md", onClick: () => {} },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost", "dashed"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    tone: { control: "inline-radio", options: ["accent", "inverse"] },
    iconStart: { control: "text" },
    iconEnd: { control: "text" },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: "primary", size: "lg", iconEnd: "arrow-right" } };

export const Secondary: Story = { args: { variant: "secondary", children: "Edit pattern" } };

export const Ghost: Story = { args: { variant: "ghost", size: "sm", children: "Manage" } };

export const Dashed: Story = { args: { variant: "dashed", size: "sm", iconStart: "plus", children: "Add track" } };

/** Title-bar Export: `--ph-text` fill with `--ph-bg` text, so it doesn't compete with the play key. */
export const Inverse: Story = { args: { variant: "primary", tone: "inverse", iconStart: "export", children: "Export" } };

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="md">Medium</Button>
      <Button variant="primary" size="lg">Large</Button>
    </div>
  ),
};

export const WithIcons: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Button variant="primary" size="lg" iconEnd="arrow-right">Continue</Button>
      <Button iconStart="folder">Choose…</Button>
      <Button variant="dashed" size="sm" iconStart="plus">Add track</Button>
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, children: "Disabled" } };

export const Loading: Story = { args: { variant: "primary", loading: true, children: "Exporting" } };

/** `as="a"` for navigation: renders an anchor and passes `href`. */
export const AsLink: Story = { args: { as: "a", href: "#export", variant: "primary", children: "Export WAV", iconStart: "export" } };

function States() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Button variant="primary" size="lg">Continue</Button>
        <Button>Edit pattern</Button>
        <Button variant="ghost" size="sm">Manage</Button>
        <Button variant="dashed" size="sm" iconStart="plus">Add track</Button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <Button variant="primary" tone="inverse" iconStart="export">Export</Button>
        <Button variant="primary" loading>Applying</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" disabled>Disabled</Button>
      </div>
    </div>
  );
}

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <States />
    </ThemePair>
  ),
};
