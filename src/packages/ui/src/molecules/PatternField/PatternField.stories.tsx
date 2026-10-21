import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { PatternField, type PatternFieldProps } from "./PatternField";

const HINT = '"< >" picks the next note each time; "*2" makes that happen twice per cycle.';

/** Toy validator: brackets must balance (stand-in for Strudel's mini parser). */
function check(text: string): string | undefined {
  const pairs: Record<string, string> = { "]": "[", ">": "<", ")": "(" };
  const stack: string[] = [];
  for (const ch of text) {
    if (ch === "[" || ch === "<" || ch === "(") stack.push(ch);
    else if (pairs[ch] && stack.pop() !== pairs[ch]) return `Unexpected "${ch}"`;
  }
  return stack.length ? `Missing closing bracket for "${stack[stack.length - 1]}"` : undefined;
}

/** Live parse on every keystroke; commit on Enter / blur; Esc reverts. */
function Live(props: Omit<PatternFieldProps, "onCommit" | "onChange">) {
  const [value, setValue] = useState(props.value);
  const [error, setError] = useState(props.error);
  return (
    <PatternField
      {...props}
      value={value}
      error={error}
      onChange={(text) => setError(check(text))}
      onCommit={(text) => {
        if (!check(text)) setValue(text);
      }}
    />
  );
}

const meta = {
  title: "Molecules/PatternField",
  component: PatternField,
  args: {
    label: "Pattern",
    trailingLabel: "mini-notation",
    value: "<c2 eb2 g2 bb1>*2",
    mode: "guided",
    hint: HINT,
    variant: "inspector",
    labelTone: "legend",
    onCommit: () => {},
  },
  render: (args) => (
    <div style={{ width: 272 }}>
      <Live {...args} />
    </div>
  ),
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof PatternField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Inspector, Guided: hint under the field. Try deleting a ">" to see the error. */
export const Guided: Story = {};

/** Pro: no hint. */
export const Pro: Story = { args: { mode: "pro" } };

/** Parse error replaces the hint; `aria-invalid`. */
export const Invalid: Story = { args: { value: "<c2 eb2 g2 bb1*2", error: 'Missing closing bracket for "<"' } };

/** Flat panel: muted label. */
export const MutedLabel: Story = { args: { labelTone: "muted" } };

export const Disabled: Story = { args: { disabled: true } };

/** Pattern editor "Live code" bar. */
export const LiveCode: Story = {
  args: {
    label: "Live code",
    variant: "live",
    trailingLabel: undefined,
    hint: undefined,
    syncedNote: "Synced both ways — edit the grid or the text",
    value: 's("bd*4, [~ cp]*2, hh*8, [~ oh]*4").bank("RolandTR909")',
  },
  render: (args) => (
    <div style={{ width: 720 }}>
      <Live {...args} />
    </div>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: 272 }}>
        <Live label="Pattern" trailingLabel="mini-notation" value="<c2 eb2 g2 bb1>*2" mode="guided" hint={HINT} />
        <Live label="Pattern" trailingLabel="mini-notation" value="c4 [eb4 g4 ~ bb4" mode="pro" error='Missing closing bracket for "["' />
      </div>
    </ThemePair>
  ),
};
