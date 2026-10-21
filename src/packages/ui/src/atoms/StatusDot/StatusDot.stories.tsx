import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemePair } from "../../stories/ThemePair";
import { StatusDot, type StatusDotStatus } from "./StatusDot";

const STATUSES: StatusDotStatus[] = ["ok", "busy", "warn", "error", "off"];

const LABELS: Record<StatusDotStatus, string> = {
  ok: "Live · re-evaluates on every change",
  busy: "Evaluating…",
  warn: "Audio device changed",
  error: "Evaluation error",
  off: "Paused",
};

const meta = {
  title: "Atoms/StatusDot",
  component: StatusDot,
  args: { status: "ok", label: "Live" },
  argTypes: {
    status: { control: "select", options: STATUSES },
    labelTone: { control: "inline-radio", options: ["default", "muted", "accent"] },
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof StatusDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Every tone with a plain label. */
export const Statuses: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {STATUSES.map((status) => (
        <StatusDot key={status} status={status} label={LABELS[status]} />
      ))}
    </div>
  ),
};

/** Pill form ("Live" badge in the Kit, header and settings preview). */
export const Badge: Story = {
  args: { badge: true },
};

export const Badges: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {STATUSES.map((status) => (
        <StatusDot key={status} status={status} label={status === "ok" ? "Live" : status} badge />
      ))}
    </div>
  ),
};

/** Busy pulses by default; `pulse={false}` keeps it still. Both stay still under reduced motion. */
export const Busy: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24 }}>
      <StatusDot status="busy" label="Pulsing" />
      <StatusDot status="busy" label="Not pulsing" pulse={false} />
    </div>
  ),
};

/** No visible label: the wrapper takes an `aria-label` and becomes an image. */
export const DotOnly: Story = {
  args: { label: undefined, "aria-label": "Engine running" },
};

/** `labelTone="accent"` is the accent-coloured, semibold "Watching" / "Live" look (`--ph-accent-text`). */
export const Watching: Story = {
  args: { status: "ok", label: "Watching", labelTone: "accent" },
};

/** Label tones: default `--ph-text`, `muted` `--ph-muted`, `accent` `--ph-accent-text` at 600. */
export const LabelTones: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <StatusDot status="ok" label="Default label" />
      <StatusDot status="ok" label="Muted label" labelTone="muted" />
      <StatusDot status="ok" label="Accent label" labelTone="accent" />
    </div>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {STATUSES.map((status) => (
          <StatusDot key={status} status={status} label={LABELS[status]} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <StatusDot status="ok" label="Live" badge />
        <StatusDot status="busy" label="Evaluating" badge />
        <StatusDot status="ok" aria-label="Engine running" />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatusDot status="ok" label="Muted label" labelTone="muted" />
        <StatusDot status="ok" label="Watching" labelTone="accent" />
      </div>
    </ThemePair>
  ),
};
