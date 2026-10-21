import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import type { MeterSubscribe } from "../../atoms/Meter";
import { TrackHeader, type TrackHeaderProps } from "./TrackHeader";

const noop = () => {};

const meta = {
  title: "Molecules/TrackHeader",
  component: TrackHeader,
  args: {
    name: "Kick",
    sound: 's("bd").bank("RolandTR909")',
    color: "#7FD88A",
    selected: false,
    muted: false,
    soloed: false,
    level: 0.5,
    onSelect: noop,
    onMuteChange: noop,
    onSoloChange: noop,
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof TrackHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Selected: Story = { args: { name: "Bass", sound: 's("sawtooth")', color: "#F5C25B", selected: true } };
export const Muted: Story = { args: { name: "Lead", sound: 's("triangle")', color: "#F296C2", muted: true, level: 0 } };
export const Soloed: Story = { args: { soloed: true } };
export const WithError: Story = { args: { error: 'Unknown sound "bdd"' } };
export const CodeTrack: Story = { args: { name: "Raw code", sound: 'stack(s("bd*4"), s("~ cp"))', codeTrack: true, color: "#B79CFF" } };
export const CodeTrackWithError: Story = { args: { codeTrack: true, error: "Unexpected token )" } };
export const LongSoundString: Story = {
  args: {
    name: "A rather long track name that keeps going",
    sound: 's("supersaw").bank("RolandTR909").room(0.4).delay(0.25).lpf(sine.range(200, 4000).slow(8))',
  },
};

const fakeMeter: MeterSubscribe = (write) => {
  const id = setInterval(() => write(0.25 + Math.random() * 0.6), 60);
  return () => clearInterval(id);
};
export const LiveMeter: Story = { args: { level: undefined, meterSubscribe: fakeMeter } };

/** Click to select; M and S toggle; double-click the name or press F2 to rename. */
function Interactive(props: Partial<TrackHeaderProps>) {
  const [selected, setSelected] = useState(true);
  const [muted, setMuted] = useState(false);
  const [soloed, setSoloed] = useState(false);
  const [name, setName] = useState("Kick");
  return (
    <TrackHeader
      {...meta.args}
      name={name}
      selected={selected}
      muted={muted}
      soloed={soloed}
      onSelect={() => setSelected((s) => !s)}
      onMuteChange={setMuted}
      onSoloChange={setSoloed}
      onRename={setName}
      {...props}
    />
  );
}
export const InteractiveStory: Story = { name: "Interactive", render: () => <Interactive /> };

export const Themes: Story = {
  render: () => (
    <ThemePair padding={16}>
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--ph-line)", width: 208 }}>
        <TrackHeader {...meta.args} />
        <TrackHeader {...meta.args} name="Bass" sound='s("sawtooth")' color="#F5C25B" selected />
        <TrackHeader {...meta.args} name="Lead" sound='s("triangle")' color="#F296C2" muted level={0} />
        <TrackHeader {...meta.args} name="Pad" sound='s("sine")' color="#B79CFF" soloed codeTrack error="Unexpected token" />
      </div>
    </ThemePair>
  ),
};
