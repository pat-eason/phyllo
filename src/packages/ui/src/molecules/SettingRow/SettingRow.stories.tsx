import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "../../atoms/Button";
import { Slider } from "../../atoms/Slider";
import { Switch } from "../../atoms/Switch";
import { ThemePair } from "../../stories/ThemePair";
import { SettingRow } from "./SettingRow";

const group = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--ph-line)",
  borderRadius: "var(--ph-r-xl)",
  background: "var(--ph-panel)",
} as const;

function MediaKeys({ id = "media-keys" }: { id?: string }) {
  const [on, setOn] = useState(true);
  return (
    <SettingRow
      id={id}
      title="Media keys control playback"
      help="Play/pause and skip work even when Phyllo is in the background."
      control={<Switch checked={on} onChange={setOn} label="Media keys control playback" aria-labelledby={id} />}
    />
  );
}

const medium: Decorator[] = [(Story) => <div style={{ maxWidth: 720 }}>{Story()}</div>];

const meta = {
  title: "Molecules/SettingRow",
  component: SettingRow,
  args: { title: "Media keys control playback", help: "Works in the background.", control: null },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof SettingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSwitch: Story = { decorators: medium, render: () => <div style={group}><MediaKeys /></div> };

export const WithButton: Story = {
  decorators: medium,
  render: () => (
    <div style={group}>
      <SettingRow title="Sample rate" help="Match your audio interface for the lowest latency." control={<Button size="sm">48 kHz</Button>} />
    </div>
  ),
};

export const WithSlider: Story = {
  decorators: medium,
  render: () => {
    function Look() {
      const [ms, setMs] = useState(100);
      return (
        <div style={group}>
          <SettingRow
            id="lookahead"
            title="Scheduling look-ahead"
            help="Higher is steadier, lower feels more immediate."
            control={<Slider value={ms} min={20} max={400} step={10} width={220} onChange={setMs} label="Scheduling look-ahead" aria-labelledby="lookahead" />}
          />
        </div>
      );
    }
    return <Look />;
  },
};

export const NoHelp: Story = {
  decorators: medium,
  render: () => (
    <div style={group}>
      <SettingRow title="Rescan devices" control={<Button size="sm">Rescan</Button>} />
    </div>
  ),
};

/** Group card: dividers between rows, none after the last (set `divider={false}` on it). */
export const InGroup: Story = {
  decorators: medium,
  render: () => (
    <div style={group}>
      <MediaKeys id="g-media" />
      <SettingRow title="Keep playing from the menu bar" help="Phyllo stays in the menu bar after you close the window." control={<Button size="sm">Off</Button>} />
      <SettingRow title="Autosave and version history" help="Keeps the last 20 versions of every project." divider={false} control={<Button size="sm">On</Button>} />
    </div>
  ),
};

/** Narrow container: the control wraps under the text. */
export const Wrapped: Story = {
  decorators: [(Story) => <div style={{ maxWidth: 300 }}>{Story()}</div>],
  render: () => <div style={group}><MediaKeys id="wrapped" /></div>,
};

/** Kit variant: draws its own border on `--ph-bg`. */
export const Standalone: Story = {
  decorators: medium,
  render: () => (
    <SettingRow
      standalone
      id="standalone"
      title="Media keys control playback"
      help="Works in the background."
      control={<Switch checked onChange={() => {}} label="Media keys" aria-labelledby="standalone" />}
    />
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--ph-bg)", padding: 16 }}>
        <div style={group}>
          <MediaKeys id="t-media" />
          <SettingRow title="Sample rate" help="Match your audio interface." divider={false} control={<Button size="sm">48 kHz</Button>} />
        </div>
        <SettingRow standalone title="Standalone" help="Kit variant." control={<Switch checked onChange={() => {}} label="Standalone" />} />
      </div>
    </ThemePair>
  ),
};
