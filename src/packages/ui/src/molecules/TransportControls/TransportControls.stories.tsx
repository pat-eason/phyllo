import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { TransportControls, type TransportControlsProps } from "./TransportControls";

const noop = () => {};

const meta = {
  title: "Molecules/TransportControls",
  component: TransportControls,
  args: {
    playing: false,
    recording: false,
    loop: false,
    onToStart: noop,
    onPlayPause: noop,
    onStop: noop,
    onRecord: noop,
    onLoopChange: noop,
  },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof TransportControls>;

export default meta;
type Story = StoryObj<typeof meta>;

function Live(props: Partial<TransportControlsProps>) {
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loop, setLoop] = useState(true);
  return (
    <TransportControls
      playing={playing}
      recording={recording}
      loop={loop}
      onToStart={noop}
      onPlayPause={() => setPlaying((p) => !p)}
      onStop={() => setPlaying(false)}
      onRecord={() => setRecording((r) => !r)}
      onLoopChange={setLoop}
      {...props}
    />
  );
}

export const Stopped: Story = {};
export const Playing: Story = { args: { playing: true, loop: true } };
export const Recording: Story = { args: { playing: true, recording: true } };
export const LoopOn: Story = { args: { loop: true } };
export const WithoutRecord: Story = { args: { showRecord: false } };
export const Large: Story = { args: { size: "lg", loop: true } };
export const Interactive: Story = { render: () => <Live /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
        <Live />
        <TransportControls {...meta.args} playing loop recording />
        <TransportControls {...meta.args} showRecord={false} />
      </div>
    </ThemePair>
  ),
};
