import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { StepCell } from "./StepCell";

const beats: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, width: 640 };
const beat: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 4 };

const parse = (pattern: string) => [...pattern].map((c) => c === "x");

/**
 * Minimal StepRow: 4 beat groups, paint mode (press then drag across cells), optional playhead.
 * Pointer clicks are handled on pointer-down, so `onClick` prevents the cell's own toggle for them.
 */
function Row({
  label,
  color,
  pattern,
  playing = false,
  selected = false,
  velocities,
}: {
  label: string;
  color: string;
  pattern: string;
  playing?: boolean;
  selected?: boolean;
  velocities?: number[];
}) {
  const [steps, setSteps] = useState(() => parse(pattern));
  const [head, setHead] = useState(playing ? 0 : -1);
  const paint = useRef<boolean | null>(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setHead((h) => (h + 1) % 16), 125);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    const stop = () => {
      paint.current = null;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);

  const set = (i: number, on: boolean) => setSteps((s) => s.map((v, j) => (j === i ? on : v)));

  return (
    <div style={beats}>
      {[0, 1, 2, 3].map((b) => (
        <div key={b} style={beat}>
          {[0, 1, 2, 3].map((s) => {
            const i = b * 4 + s;
            return (
              <StepCell
                key={i}
                index={i}
                rowLabel={label}
                color={color}
                on={steps[i] ?? false}
                beatStart={s === 0}
                playing={i === head}
                rowSelected={selected}
                velocity={velocities?.[i]}
                onChange={(on) => set(i, on)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  paint.current = !steps[i];
                  set(i, paint.current);
                }}
                onPointerEnter={() => {
                  if (paint.current !== null) set(i, paint.current);
                }}
                onClick={(e) => {
                  if (e.detail > 0) e.preventDefault();
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The Kit strip: off · beat · on · off · beat · on · on · off. */
function KitStrip() {
  const cells: [boolean, boolean][] = [
    [false, false],
    [true, false],
    [false, true],
    [false, false],
    [true, false],
    [false, true],
    [false, true],
    [false, false],
  ];
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {cells.map(([beatStart, on], i) => (
        <StepCell
          key={i}
          index={i}
          rowLabel="Kit"
          color="var(--ph-track-1)"
          on={on}
          beatStart={beatStart}
          onChange={() => {}}
          style={{ width: 30 }}
        />
      ))}
    </div>
  );
}

const meta = {
  title: "Atoms/StepCell",
  component: StepCell,
  args: {
    on: false,
    color: "var(--ph-track-1)",
    index: 4,
    rowLabel: "Kick",
    style: { width: 30 },
    beatStart: false,
    playing: false,
    rowSelected: false,
    readOnly: false,
    disabled: false,
    onChange: () => {},
  },
  argTypes: { velocity: { control: { type: "range", min: 0, max: 1, step: 0.05 } } },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof StepCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

/** First step of a beat, off. */
export const Beat: Story = { args: { beatStart: true } };

export const On: Story = { args: { on: true } };

/** Velocity 0.3: fill opacity 0.45 + 0.55·v. */
export const Velocity: Story = { args: { on: true, velocity: 0.3 } };

/** Playhead on this step. */
export const Playing: Story = { args: { playing: true } };

export const PlayingOn: Story = { args: { playing: true, on: true } };

export const RowSelected: Story = { args: { rowSelected: true } };

/** Euclid preview cell. */
export const ReadOnly: Story = { args: { readOnly: true, on: true } };

export const Disabled: Story = { args: { disabled: true } };

/** 16 steps: click or press-and-drag to paint; Space/Enter toggles the focused step. */
export const Sequence: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Row label="Kick" color="var(--ph-track-1)" pattern="x...x...x...x..." playing />
      <Row label="Clap" color="var(--ph-track-2)" pattern="....x.......x..." />
      <Row label="Closed hat" color="var(--ph-track-3)" pattern="x.x.x.x.x.x.x.x." velocities={[1, 0.55, 0.8, 0.5, 0.95, 0.5, 0.75, 0.45, 1, 0.55, 0.8, 0.5, 0.9, 0.5, 0.7, 0.6]} />
      <Row label="Open hat" color="var(--ph-track-5)" pattern="..x...x...x...x." selected />
    </div>
  ),
};

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <KitStrip />
      <div style={{ display: "flex", gap: 4 }}>
        <StepCell index={0} rowLabel="Demo" color="var(--ph-track-3)" on onChange={() => {}} velocity={0.3} style={{ width: 30 }} />
        <StepCell index={1} rowLabel="Demo" color="var(--ph-track-3)" on onChange={() => {}} playing style={{ width: 30 }} />
        <StepCell index={2} rowLabel="Demo" color="var(--ph-track-3)" on={false} onChange={() => {}} playing style={{ width: 30 }} />
        <StepCell index={3} rowLabel="Demo" color="var(--ph-track-3)" on={false} onChange={() => {}} rowSelected style={{ width: 30 }} />
        <StepCell index={4} rowLabel="Demo" color="var(--ph-track-3)" on onChange={() => {}} readOnly style={{ width: 30 }} />
        <StepCell index={5} rowLabel="Demo" color="var(--ph-track-3)" on={false} onChange={() => {}} disabled style={{ width: 30 }} />
      </div>
    </ThemePair>
  ),
};
