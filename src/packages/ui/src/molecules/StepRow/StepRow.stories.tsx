import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { StepRow, type StepRowHandle } from "./StepRow";

const parse = (s: string) => [...s].map((c) => c === "x");

/** PatternEditor mockup `toMini` (SPEC §4.3), enough for the story. */
function toMini(name: string, row: boolean[]): string | null {
  if (!row.some(Boolean)) return null;
  let g = 16;
  for (const cand of [1, 2, 4, 8, 16]) {
    const st = 16 / cand;
    if (row.every((on, i) => !on || i % st === 0)) {
      g = cand;
      break;
    }
  }
  const st = 16 / g;
  const tok = Array.from({ length: g }, (_, j) => (row[j * st] ? name : "~"));
  let p = g;
  for (const cand of [1, 2, 4, 8, 16]) {
    if (cand > g || g % cand) continue;
    if (tok.every((x, i) => x === tok[i % cand])) {
      p = cand;
      break;
    }
  }
  const seg = tok.slice(0, p);
  const reps = g / p;
  if (seg.length === 1) return reps > 1 ? `${seg[0]}*${reps}` : (seg[0] ?? null);
  return reps > 1 ? `[${seg.join(" ")}]*${reps}` : seg.join(" ");
}

const ROWS = [
  { sound: "bd", label: "Kick", color: "var(--ph-track-1)", steps: "x...x...x...x..." },
  { sound: "cp", label: "Clap", color: "var(--ph-track-2)", steps: "....x.......x..." },
  { sound: "hh", label: "Closed hat", color: "var(--ph-track-3)", steps: "x.x.x.x.x.x.x.x." },
  { sound: "oh", label: "Open hat", color: "var(--ph-track-5)", steps: "..x...x...x...x." },
  { sound: "rim", label: "Rimshot", color: "var(--ph-track-4)", steps: "................" },
];

const header: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "0 6px" };
const beatLabels: CSSProperties = { flex: 1, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 };
const small: CSSProperties = { font: "400 11px/1.4 var(--ph-font-mono)", color: "var(--ph-muted)" };

/** StepSequencer-shaped grid: paint by press-and-drag, Space/Enter on a cell, select a row by its label. */
function Sequencer({ playing = false, width = 1060, stepCount = 16 }: { playing?: boolean; width?: number; stepCount?: 8 | 16 }) {
  const [rows, setRows] = useState(() => Object.fromEntries(ROWS.map((r) => [r.sound, parse(r.steps.slice(0, stepCount))])));
  const [selected, setSelected] = useState("oh");
  const paint = useRef<boolean>(false);
  const handles = useRef<Record<string, StepRowHandle | null>>({});

  useEffect(() => {
    if (!playing) return;
    let step = 0;
    const id = setInterval(() => {
      for (const h of Object.values(handles.current)) h?.setCurrentStep(step);
      step = (step + 1) % stepCount;
    }, 125);
    return () => clearInterval(id);
  }, [playing, stepCount]);

  const set = (sound: string, i: number, on: boolean) =>
    setRows((rs) => ({ ...rs, [sound]: (rs[sound] ?? []).map((v, j) => (j === i ? on : v)) }));

  return (
    <div role="grid" aria-label="Drum steps" style={{ display: "flex", flexDirection: "column", gap: 8, width }}>
      <div style={header} aria-hidden="true">
        <div style={{ flex: "0 0 140px" }} />
        <div style={{ ...beatLabels, gridTemplateColumns: `repeat(${stepCount / 4}, minmax(0, 1fr))` }}>
          {Array.from({ length: stepCount / 4 }, (_, b) => b + 1).map((b) => (
            <span key={b} style={small}>
              beat {b}
            </span>
          ))}
        </div>
        <div style={{ flex: "0 0 170px", fontSize: 11, color: "var(--ph-muted)" }}>writes</div>
      </div>
      {ROWS.map((r) => {
        const steps = rows[r.sound] ?? [];
        return (
          <StepRow
            key={r.sound}
            ref={(h) => {
              handles.current[r.sound] = h;
            }}
            sound={r.sound}
            label={r.label}
            color={r.color}
            steps={steps}
            mini={toMini(r.sound, stepCount === 16 ? steps : [...steps, ...steps])}
            selected={selected === r.sound}
            onSelect={() => setSelected(r.sound)}
            onToggleStep={(i) => {
              set(r.sound, i, !steps[i]);
              setSelected(r.sound);
            }}
            onPaintStart={(i, value) => {
              paint.current = value;
              set(r.sound, i, value);
              setSelected(r.sound);
            }}
            onPaintEnter={(i) => set(r.sound, i, paint.current)}
          />
        );
      })}
    </div>
  );
}

const meta = {
  title: "Molecules/StepRow",
  component: StepRow,
  args: {
    sound: "bd",
    label: "Kick",
    color: "var(--ph-track-1)",
    steps: parse("x...x...x...x..."),
    mini: "bd*4",
    selected: false,
    onToggleStep: () => {},
    onSelect: () => {},
  },
  render: (args) => (
    <div role="grid" aria-label="Drum steps" style={{ width: 1060 }}>
      <StepRow {...args} />
    </div>
  ),
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof StepRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Row selected: tint + accent border on the label. */
export const Selected: Story = {
  args: { sound: "oh", label: "Open hat", color: "var(--ph-track-5)", steps: parse("..x...x...x...x."), mini: "[~ oh]*4", selected: true },
};

/** Nothing on: "—". */
export const Empty: Story = { args: { sound: "rim", label: "Rimshot", color: "var(--ph-track-4)", steps: parse("................"), mini: null } };

/** Current step (declarative `playingStep`; the sequencer uses the ref handle). */
export const CurrentStep: Story = { args: { playingStep: 4 } };

/** Per-step velocity fades on-cells. */
export const Velocity: Story = {
  args: {
    sound: "hh",
    label: "Closed hat",
    color: "var(--ph-track-3)",
    steps: parse("x.x.x.x.x.x.x.x."),
    mini: "hh*8",
    velocities: [1, 0, 0.5, 0, 0.9, 0, 0.45, 0, 1, 0, 0.55, 0, 0.8, 0, 0.4, 0],
  },
};

/** Five rows like the Pattern editor: paint, keyboard, row selection. */
export const Grid: Story = { render: () => <Sequencer /> };

/** Playhead driven through `ref.setCurrentStep` (no row re-render). */
export const Playing: Story = { render: () => <Sequencer playing /> };

/** 8-step rows: a ThemePair half is about 650 px wide and a 16-step row needs about 850 (cells are at least 26 px). */
export const Themes: Story = {
  render: () => (
    <ThemePair>
      <Sequencer width={640} stepCount={8} />
    </ThemePair>
  ),
};
