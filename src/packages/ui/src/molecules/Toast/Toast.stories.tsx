import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Toast } from "./Toast";

const noop = () => {};

const meta = {
  title: "Molecules/Toast",
  component: Toast,
  args: {
    title: "Export finished",
    detail: "Untitled Groove.wav · 1:08 · 24-bit",
    action: { label: "Reveal", onClick: noop },
    onDismiss: noop,
    // Stories stay on screen: auto-dismiss is demonstrated in `AutoDismiss`.
    duration: 0,
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { duration: 6000 } };
export const NoAction: Story = { args: { action: undefined, duration: 6000 } };
export const TitleOnly: Story = { args: { detail: undefined, action: undefined, duration: 6000 } };
export const ErrorTone: Story = {
  args: { tone: "error", title: "Track Bass has an error", detail: 'Unknown sound "sawtoth"', action: { label: "Show", onClick: noop } },
};
export const LongDetail: Story = {
  args: { detail: "A very long project name that does not fit on one line.wav · 1:08 · 24-bit", duration: 6000 },
};

/** Dismisses itself after 4 s; hover or focus it to pause. Escape dismisses while focused. */
function AutoDismiss() {
  const [shown, setShown] = useState(true);
  if (!shown) {
    return (
      <button type="button" onClick={() => setShown(true)}>
        Show again
      </button>
    );
  }
  return <Toast {...meta.args} duration={4000} onDismiss={() => setShown(false)} />;
}
export const AutoDismissing: Story = { render: () => <AutoDismiss /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Toast {...meta.args} duration={6000} />
        <Toast {...meta.args} tone="error" title="Track Bass has an error" detail='Unknown sound "sawtoth"' />
      </div>
    </ThemePair>
  ),
};
