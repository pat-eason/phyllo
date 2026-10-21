import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Readout, type ReadoutCell, type ReadoutSubscribe } from "./Readout";

const guided: ReadoutCell[] = [
  { id: "position", value: "13.2.1", caption: "BAR · BEAT · 16TH", mono: true, minWidth: 112 },
  { id: "bpm", value: "120", caption: "BPM · TAP", mono: true, onActivate: () => {} },
  { id: "key", value: "C minor", caption: "KEY · 4/4", onActivate: () => {} },
  { id: "cycle", value: "12.25", caption: "CYCLE", mono: true },
];

const pro: ReadoutCell[] = guided.map((cell) => (cell.id === "bpm" ? { ...cell, caption: "BPM · setcpm(30)" } : cell));

const meta = {
  title: "Molecules/Readout",
  component: Readout,
  args: { cells: guided },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Readout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Guided: Story = {};
export const Pro: Story = { args: { cells: pro } };

/** Click the tempo to edit it in place (Enter commits, Escape cancels); wheel or Arrow Up/Down nudges. */
function EditableTempo() {
  const [bpm, setBpm] = useState(120);
  const cells: ReadoutCell[] = guided.map((cell) =>
    cell.id === "bpm"
      ? {
          ...cell,
          value: String(bpm),
          label: `Tempo ${bpm} BPM, edit`,
          onActivate: undefined,
          onEdit: (text) => {
            const next = Number(text);
            if (Number.isFinite(next)) setBpm(Math.min(300, Math.max(20, Math.round(next))));
          },
          onNudge: (delta) => setBpm((b) => Math.min(300, Math.max(20, b + delta))),
        }
      : cell,
  );
  return <Readout cells={cells} />;
}

export const EditableBpm: Story = { render: () => <EditableTempo /> };

/** The "TAP" caption is its own button (`onCaptionClick`), separate from the editable value. */
function TapTempo() {
  const cells: ReadoutCell[] = guided.map((cell) =>
    cell.id === "bpm"
      ? { ...cell, label: "Tempo 120 BPM, edit", onEdit: () => undefined, onCaptionClick: () => undefined }
      : cell,
  );
  return <Readout cells={cells} />;
}

export const TapCaption: Story = { render: () => <TapTempo /> };

/** Position and cycle driven through `subscribe`: React renders the cells once; the text is written to the DOM. */
const clock: ReadoutSubscribe = (write) => {
  const start = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    const beats = ((now - start) / 1000) * 2;
    const bar = Math.floor(beats / 4) + 1;
    const beat = (Math.floor(beats) % 4) + 1;
    const sixteenth = (Math.floor(beats * 4) % 4) + 1;
    write(`${bar}.${beat}.${sixteenth}`);
    frame = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(frame);
};

const cycleClock: ReadoutSubscribe = (write) => {
  const start = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    write(((now - start) / 2000).toFixed(2));
    frame = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(frame);
};

export const LiveSubscribed: Story = {
  args: {
    cells: guided.map((cell) =>
      cell.id === "position"
        ? { ...cell, value: "1.1.1", subscribe: clock }
        : cell.id === "cycle"
          ? { ...cell, value: "0.00", subscribe: cycleClock }
          : cell,
    ),
  },
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
        <Readout cells={guided} />
        <Readout cells={pro} />
      </div>
    </ThemePair>
  ),
};
