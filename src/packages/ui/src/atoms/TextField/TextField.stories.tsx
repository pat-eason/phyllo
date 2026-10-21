import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ComponentProps } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Kbd } from "../Kbd";
import { TextField } from "./TextField";

type Args = ComponentProps<typeof TextField>;

/** Controlled wrapper so every story is typeable. */
function Controlled(args: Args) {
  const [value, setValue] = useState(args.value);
  return (
    <div style={{ width: 260 }}>
      <TextField {...args} value={value} onChange={setValue} />
    </div>
  );
}

const meta = {
  title: "Atoms/TextField",
  component: TextField,
  args: { label: "Name", value: "", onChange: () => undefined, placeholder: "Untitled groove" },
  render: (args) => <Controlled {...args} />,
  decorators: [(Story) => <div style={{ padding: 24, background: "var(--ph-panel)" }}>{Story()}</div>],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const WithVisibleLabel: Story = { args: { labelPosition: "top", label: "Groove name", description: "Shown in the library." } };

/** Leading magnifier, Esc clears. */
export const Search: Story = {
  args: { variant: "search", label: "Search sounds", placeholder: "Search sounds", value: "kick" },
};

export const SearchWithKbdHint: Story = {
  args: {
    variant: "search",
    label: "Search sounds",
    placeholder: 'Search sounds, e.g. "warm bass"',
    trailing: <Kbd keys={["⌘", "K"]} />,
  },
};

/** Monospace, accent border; the inspector pattern input. */
export const Code: Story = {
  args: { variant: "code", label: "Pattern for Bass", value: "<c2 eb2 g2 bb1>*2" },
};

export const CodeInvalid: Story = {
  args: {
    variant: "code",
    label: "Pattern for Bass",
    value: "<c2 eb2 g2*>",
    invalid: true,
    description: "Unexpected * at position 11",
  },
};

export const Invalid: Story = {
  args: { invalid: true, value: "", description: "Name is required", labelPosition: "top" },
};

/** 40 px, the field height in the Export, Onboarding and Library mockups. */
export const Size40: Story = { args: { size: 40, label: "Folder", value: "~/Music/Phyllo" } };

export const Large: Story = { args: { size: "lg", variant: "search", label: "Search", placeholder: "Search" } };

export const Disabled: Story = { args: { disabled: true, value: "Locked" } };

export const WithDescription: Story = { args: { description: "Letters, numbers and dashes.", value: "my-groove", labelPosition: "top" } };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 240, background: "var(--ph-panel)", padding: 16 }}>
        <Controlled {...(Plain.args as Args)} value="" placeholder="Plain" label="Plain" onChange={() => undefined} />
        <Controlled
          label="Search sounds"
          variant="search"
          placeholder="Search sounds"
          value=""
          onChange={() => undefined}
          trailing={<Kbd keys={["⌘", "K"]} />}
        />
        <Controlled label="Pattern" variant="code" value="<c2 eb2 g2 bb1>*2" onChange={() => undefined} />
        <Controlled label="Pattern" variant="code" value="<c2 eb2 g2*>" invalid description="Unexpected *" onChange={() => undefined} />
        <Controlled label="Locked" value="Disabled" disabled onChange={() => undefined} />
      </div>
    </ThemePair>
  ),
};
