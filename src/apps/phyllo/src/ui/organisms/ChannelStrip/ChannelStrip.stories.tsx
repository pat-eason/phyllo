import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { MockStoresOptions } from "../../../state/mocks";
import { ChannelStrip } from "./ChannelStrip";
import { mixerProject, playingEngine } from "./fixtures";
import type { MixerFixtureOptions } from "./fixtures";

const frame: Decorator = (Story) => (
  <div style={{ display: "flex", gap: 8, minHeight: "100vh", padding: "20px 16px", boxSizing: "border-box", background: "var(--ph-bg)" }}>
    <Story />
  </div>
);

const stores = (options: MixerFixtureOptions = {}, playing = true): MockStoresOptions => ({
  initialProject: mixerProject(options),
  ...(playing ? { engine: playingEngine() } : {}),
});

const meta = {
  title: "Organisms/ChannelStrip",
  component: ChannelStrip,
  decorators: [frame],
  parameters: { stores: stores() },
  args: { kind: "track", trackId: "kick" },
} satisfies Meta<typeof ChannelStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Track: Story = { parameters: { stores: stores({ selected: null }) } };

/** Selected track: accent border (Bass, with `lpf ~sine`, `lpq 10`, `shape .3` inserts). */
export const Selected: Story = { args: { kind: "track", trackId: "bass" } };

export const Muted: Story = {
  args: { kind: "track", trackId: "clap" },
  parameters: { stores: stores({ selected: null, tracks: { clap: { mute: true } } }) },
};

export const Soloed: Story = {
  args: { kind: "track", trackId: "kick" },
  parameters: { stores: stores({ selected: null, tracks: { kick: { solo: true } } }) },
};

/** Hats use `.gain("[.4 .7]*4")`: the fader reads "pattern" and is disabled with a note. */
export const ModulatedGain: Story = {
  args: { kind: "track", trackId: "hats" },
  parameters: { stores: stores({ selected: null }) },
};

export const EffectMenuOpen: Story = {
  args: { kind: "track", trackId: "kick" },
  parameters: { stores: stores({ selected: null }, false) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add effect to Kick" }));
    await expect(canvas.getByRole("menu", { name: "Effects for Kick" })).toBeVisible();
  },
};

/** Bus 1 is shared by Kick, Clap and Hats. */
export const Bus: Story = { args: { kind: "bus", orbit: 1 } };

export const MasterLimiterOn: Story = { args: { kind: "master" } };

export const MasterLimiterOff: Story = {
  args: { kind: "master" },
  parameters: { stores: stores({ master: { limiter: false, postgain: 1 } }) },
};

/** "● Rec output" pressed: elapsed time ticks until Stop. */
export const MasterRecording: Story = {
  args: { kind: "master" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Rec output, record the master output to a file" }));
    await expect(await canvas.findByRole("button", { name: "Stop, stop recording the master output" })).toBeVisible();
  },
};

/** All three kinds side by side, stopped (meters at rest). */
export const AllKindsStopped: Story = {
  parameters: { stores: stores({}, false) },
  render: () => (
    <>
      <ChannelStrip kind="track" trackId="kick" />
      <ChannelStrip kind="track" trackId="bass" />
      <ChannelStrip kind="bus" orbit={1} />
      <ChannelStrip kind="master" />
    </>
  ),
};
