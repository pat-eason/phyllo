import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Meter, type MeterHandle, type MeterSubscribe } from "./Meter";

const row: CSSProperties = { display: "flex", gap: 16, alignItems: "flex-end" };
const caption: CSSProperties = { font: "400 11px/1.2 var(--ph-font-mono)", color: "var(--ph-muted)" };

/** Fake kick-ish envelope: a hit every 500 ms decaying, plus a little noise. */
function signal(t: number, offset = 0) {
  const phase = ((t + offset) % 500) / 500;
  return Math.min(1, 0.85 * Math.exp(-phase * 5) + 0.05 * Math.random());
}

/** Drives a meter through the ref handle at ~30 Hz; React never re-renders. */
function LiveViaRef({ stereo, hold, length }: { stereo?: boolean; hold?: boolean; length?: number | "fill" }) {
  const meter = useRef<MeterHandle>(null);
  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      const t = performance.now() - start;
      meter.current?.set(signal(t), signal(t, 40));
    }, 33);
    return () => clearInterval(id);
  }, []);
  return <Meter ref={meter} stereo={stereo} hold={hold} length={length} />;
}

/** Same signal through the `subscribe` prop, the shape `useMeter(trackId)` will return. */
const fakeEngine: MeterSubscribe = (write) => {
  const start = performance.now();
  const id = setInterval(() => {
    const t = performance.now() - start;
    write(signal(t, 120), signal(t, 160));
  }, 33);
  return () => clearInterval(id);
};

/** Live meter with a transport toggle: stopping drops it to 0 immediately. */
function Transport() {
  const [stopped, setStopped] = useState(false);
  return (
    <div style={row}>
      <Meter subscribe={fakeEngine} stereo stopped={stopped} length={112} />
      <button type="button" onClick={() => setStopped((s) => !s)}>
        {stopped ? "Play" : "Stop"}
      </button>
    </div>
  );
}

const meta = {
  title: "Atoms/Meter",
  component: Meter,
  args: { level: 0.7, length: 30, hold: false, stopped: false },
  argTypes: { level: { control: { type: "range", min: 0, max: 1, step: 0.01 } } },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Meter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TrackHeader: mono 5 × 30. */
export const Mono: Story = {};

/** ChannelStrip: two 6 px bars, 3 px apart. */
export const Stereo: Story = { args: { level: [0.72, 0.66], length: 112 } };

/** Top 10% reads in --ph-solo (proposed hot zone). */
export const Hot: Story = { args: { level: [0.97, 0.93], length: 112 } };

/** Transport stopped: reads 0. */
export const Stopped: Story = { args: { level: [0.8, 0.8], length: 112, stopped: true } };

/** Fills a sized parent. */
export const Fill: Story = {
  render: () => (
    <div style={{ display: "flex", height: 230, gap: 12 }}>
      <Meter level={[0.6, 0.55]} length="fill" />
      <Meter level={0.4} length="fill" />
    </div>
  ),
};

/** Imperative handle at 30 Hz with 20 dB/s release and peak hold. */
export const LiveRef: Story = {
  render: () => (
    <div style={row}>
      <LiveViaRef />
      <LiveViaRef stereo length={112} />
      <LiveViaRef stereo hold length={112} />
      <span style={caption}>ref.current.set(l, r)</span>
    </div>
  ),
};

/** `subscribe` prop + transport stop. */
export const LiveSubscribe: Story = { render: () => <Transport /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={row}>
        <Meter level={0.72} />
        <Meter level={0.64} />
        <Meter level={0} />
        <Meter level={[0.72, 0.66]} length={112} />
        <Meter level={[0.97, 0.93]} length={112} />
        <Meter level={[0.5, 0.45]} length={112} hold />
      </div>
    </ThemePair>
  ),
};
