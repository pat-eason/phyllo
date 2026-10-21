import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { IconButton } from "./IconButton";

const meta = {
  title: "Atoms/IconButton",
  component: IconButton,
  args: { icon: "settings", label: "Settings", size: 38, onClick: () => {} },
  argTypes: {
    size: { control: "inline-radio", options: [26, 30, 32, 38, 40] },
    shape: { control: "inline-radio", options: ["square", "circle"] },
    variant: { control: "inline-radio", options: ["outline", "plain", "filled"] },
    tone: { control: "inline-radio", options: ["neutral", "accent"] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <IconButton icon="plus" label="Zoom in" size={26} />
      <IconButton icon="plus" label="Zoom in" size={30} />
      <IconButton icon="plus" label="Zoom in" size={32} />
      <IconButton icon="settings" label="Settings" size={38} />
      <IconButton icon="settings" label="Settings" size={40} />
    </div>
  ),
};

export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <IconButton icon="settings" label="Outline" variant="outline" />
      <IconButton icon="settings" label="Plain" variant="plain" />
      <IconButton icon="settings" label="Filled" variant="filled" />
    </div>
  ),
};

/** Circle shape is for the sound Preview. */
export const Circle: Story = { args: { icon: "play", label: "Preview Bass drum", shape: "circle", size: 26 } };

function ToggleDemo() {
  const [metronome, setMetronome] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const [tool, setTool] = useState<"select" | "draw" | "split">("select");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <IconButton icon="metronome" label="Metronome" pressed={metronome} tone="accent" onClick={() => setMetronome(!metronome)} />
      <IconButton icon="star" label="Favorite Bass drum" variant="plain" pressed={favorite} tone="accent" onClick={() => setFavorite(!favorite)} />
      <div style={{ display: "flex", gap: 4 }}>
        {(["select", "draw", "split"] as const).map((name) => (
          <IconButton key={name} icon={name} label={name[0]!.toUpperCase() + name.slice(1)} pressed={tool === name} onClick={() => setTool(name)} />
        ))}
      </div>
    </div>
  );
}

/** `pressed` makes it a toggle (`aria-pressed`): neutral raised for tools, accent tint for on/off features. */
export const Pressed: Story = { render: () => <ToggleDemo /> };

export const Disabled: Story = { args: { disabled: true } };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <IconButton icon="settings" label="Settings" size={38} />
        <IconButton icon="plus" label="Zoom in" />
        <IconButton icon="play" label="Preview" shape="circle" size={26} />
        <IconButton icon="settings" label="Plain" variant="plain" />
        <IconButton icon="export" label="Filled" variant="filled" />
        <IconButton icon="metronome" label="Metronome on" pressed tone="accent" />
        <IconButton icon="draw" label="Draw" pressed />
        <IconButton icon="settings" label="Disabled" disabled />
      </div>
    </ThemePair>
  ),
};
