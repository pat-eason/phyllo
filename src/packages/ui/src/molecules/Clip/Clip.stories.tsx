import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactNode } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Clip, type ClipProps, type ClipViz } from "./Clip";

/** Kit / Main mockup data: bass line 0 3 7 −2 (×2), Cm7 Fm7 Ab^7 G7. */
const melodic: ClipViz = {
  kind: "melodic",
  notes: [0, 3, 7, -2, 0, 3, 7, -2].map((p, i) => ({ t: i / 8, d: 1 / 8, pitch: (p + 2) / 9 })),
};
const chord: ClipViz = {
  kind: "chord",
  chords: [
    [0, 3, 7],
    [5, 8, 12],
    [8, 12, 15],
    [7, 11, 14],
  ].map((c, i) => ({ t: i / 4, d: 1 / 4, pitches: c.map((p) => p / 15) })),
};
const kick: ClipViz = { kind: "drum", ticks: [0, 0.25, 0.5, 0.75] };
const clap: ClipViz = { kind: "drum", ticks: [0.25, 0.75] };
const hats: ClipViz = { kind: "drum", ticks: Array.from({ length: 8 }, (_, i) => i / 8) };
const sample: ClipViz = { kind: "sample" };
const peaks: ClipViz = {
  kind: "sample",
  peaks: Array.from({ length: 32 }, (_, i) => Math.max(0.08, Math.abs(Math.sin(i * 0.7)) * (1 - (i % 8) / 10))),
};
/** `<c2 eb2 g2 bb1>*2` bar by bar (engine `clipViz(track, cycle)`). */
const perBar: ClipViz[] = [
  [0, 0.43],
  [0.86, 0.29],
  [0, 0.43],
  [0.86, 0.29],
].map(([a = 0, b = 0]) => ({ kind: "melodic", notes: [{ t: 0, d: 0.5, pitch: a }, { t: 0.5, d: 0.5, pitch: b }] }));

const lane = (width: number, children: ReactNode) => <div style={{ width, height: 46 }}>{children}</div>;
const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, width: 600 };
const caption: CSSProperties = { font: "400 10.5px/1.4 var(--ph-font-mono)", color: "var(--ph-muted)" };

function Cell({ name, bars = 1, ...rest }: Omit<ClipProps, "startBar" | "endBar"> & { bars?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ height: 46 }}>
        <Clip name={name} startBar={1} endBar={bars} {...rest} />
      </div>
      <span style={caption}>{name}</span>
    </div>
  );
}

/** The Kit's Molecules › Clip grid: drum · melodic · chord / sample · muted · selected. */
function KitGrid() {
  return (
    <div style={grid}>
      <Cell name="drum" bars={4} color="var(--ph-track-1)" label="bd*4" viz={kick} />
      <Cell name="melodic" color="var(--ph-track-4)" label="<c2 eb2 g2 bb1>*2" viz={melodic} />
      <Cell name="chord" color="var(--ph-track-5)" label="<Cm7 Fm7 Ab^7 G7>" viz={chord} />
      <Cell name="sample" color="var(--ph-track-7)" label="vox" viz={sample} bars={3} />
      <Cell name="muted" color="var(--ph-track-6)" label="c4 [eb4 g4] ~ bb4" viz={melodic} audible={false} />
      <Cell name="selected" color="var(--ph-track-4)" label="<c2 eb2 g2 bb1>*2" viz={melodic} selected />
    </div>
  );
}

const meta = {
  title: "Molecules/Clip",
  component: Clip,
  args: {
    name: "Bass",
    startBar: 9,
    endBar: 16,
    color: "var(--ph-track-4)",
    label: "<c2 eb2 g2 bb1>*2",
    viz: perBar,
    selected: false,
    audible: true,
    dragging: false,
  },
  render: (args) => lane(328, <Clip {...args} />),
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Clip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Melodic, one viz per bar (the 8-bar Bass clip from Arrange). */
export const Melodic: Story = {};

export const Drum: Story = { args: { name: "Kick", color: "var(--ph-track-1)", label: "bd*4", viz: kick } };

/** Clap on 2 and 4. */
export const DrumOffbeat: Story = { args: { name: "Clap", color: "var(--ph-track-2)", label: "~ cp", viz: clap } };

export const DrumDense: Story = { args: { name: "Hats", color: "var(--ph-track-3)", label: "hh*8", viz: hats } };

export const Chord: Story = {
  args: { name: "Keys", color: "var(--ph-track-5)", label: "<Cm7 Fm7 Ab^7 G7>", viz: chord, startBar: 1, endBar: 2 },
};

/** No peaks yet: deterministic placeholder envelope. */
export const Sample: Story = { args: { name: "Vox chop", color: "var(--ph-track-7)", label: "vox", viz: sample, startBar: 17, endBar: 20 } };

export const SamplePeaks: Story = { args: { name: "Vox chop", color: "var(--ph-track-7)", label: "vox", viz: peaks, startBar: 17, endBar: 20 } };

/** Code-only track (no picture): code badge. */
export const Code: Story = {
  args: { name: "Code", color: "var(--ph-track-3)", label: 'stack(s("bd*2"), note("c3"))', viz: { kind: "code" } },
};

/** Track selected: 2 px text-color ring. */
export const Selected: Story = { args: { selected: true } };

/** Muted or not soloed. */
export const Muted: Story = { args: { audible: false } };

/** Mid-drag: lifted shadow, grabbing cursor, edge grips shown. */
export const Dragging: Story = { args: { selected: true, dragging: true, onResizeStart: () => {}, onMoveStart: () => {} } };

/** Edge handles (hover to see the grips): pointer-down reports the edge; the "Timeline" here resizes by 1 bar per 40 px. */
export const Resizable: Story = {
  render: function Render(args) {
    const [range, setRange] = useState({ start: 9, end: 12 });
    const [drag, setDrag] = useState<string | null>(null);
    const begin = (edge: "start" | "end" | "move", x0: number) => {
      const r0 = range;
      setDrag(edge);
      const move = (e: PointerEvent) => {
        const d = Math.round((e.clientX - x0) / 40);
        if (edge === "start") setRange({ start: Math.min(r0.end, r0.start + d), end: r0.end });
        else if (edge === "end") setRange({ start: r0.start, end: Math.max(r0.start, r0.end + d) });
        else setRange({ start: r0.start + d, end: r0.end + d });
      };
      const up = () => {
        setDrag(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    return (
      <div style={{ position: "relative", width: 640, height: 46 }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: (range.start - 9) * 40, width: (range.end - range.start + 1) * 40 }}>
          <Clip
            {...args}
            startBar={range.start}
            endBar={range.end}
            dragging={drag !== null}
            onResizeStart={(edge, e) => begin(edge, e.clientX)}
            onMoveStart={(e) => begin("move", e.clientX)}
          />
        </div>
      </div>
    );
  },
};

export const Kit: Story = { render: () => <KitGrid /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <KitGrid />
    </ThemePair>
  ),
};
