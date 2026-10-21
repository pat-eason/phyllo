import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { Surface } from "../../atoms/Surface";
import { ThemePair } from "../../stories/ThemePair";
import { ParamKnob, type ParamKnobProps } from "./ParamKnob";
import { FIXTURE_SPECS, type FixtureParam } from "./paramKnobFixtures";

/** Bass track values from the Arrange mockup (real units). lpf is driven by a sine modifier. */
const BASS: Record<FixtureParam, number> = {
  gain: 0.78,
  lpf: 1577,
  lpq: 10,
  shape: 0.3,
  room: 0.2,
  roomsize: 4,
  delay: 0,
  pan: 0.5,
};
const GUIDED: FixtureParam[] = ["gain", "lpf", "room", "delay", "pan", "shape"];
const PRO: FixtureParam[] = ["gain", "lpf", "lpq", "shape", "room", "roomsize", "delay", "pan"];

const plate = (cols: number): CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  gap: "12px 6px",
  padding: "14px 8px 10px",
  justifyItems: "center",
});

function Live(props: Omit<ParamKnobProps, "onChange">) {
  const [value, setValue] = useState(props.value);
  return <ParamKnob {...props} value={value} onChange={setValue} />;
}

/** The Inspector knob plate: Guided 3 × 2, Pro 4 × 2. */
function KnobPlate({ mode }: { mode: "guided" | "pro" }) {
  const list = mode === "guided" ? GUIDED : PRO;
  return (
    <Surface material="plate" style={{ width: 288, ...plate(mode === "guided" ? 3 : 4) }}>
      {list.map((p) => (
        <Live
          key={p}
          param={p}
          spec={FIXTURE_SPECS[p]}
          value={BASS[p]}
          mode={mode}
          modulated={p === "lpf"}
          modulationText={p === "lpf" ? "~400–1.4k" : undefined}
        />
      ))}
    </Surface>
  );
}

const meta = {
  title: "Molecules/ParamKnob",
  component: ParamKnob,
  args: {
    param: "lpf",
    spec: FIXTURE_SPECS.lpf,
    value: 1577,
    mode: "guided",
    modulated: false,
    disabled: false,
    onChange: () => {},
  },
  argTypes: { spec: { control: false } },
  render: (args) => (
    <Surface material="plate" style={{ display: "inline-flex", padding: "14px 16px 10px" }}>
      <Live {...args} />
    </Surface>
  ),
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof ParamKnob>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Guided: friendly legend, code caption. */
export const Guided: Story = {};

/** Pro: code legend (mono), value caption. */
export const Pro: Story = { args: { mode: "pro" } };

/** A modifier drives lpf: amber ring; Pro shows the modulation range as the value. */
export const Modulated: Story = { args: { mode: "pro", modulated: true, modulationText: "~400–1.4k" } };

export const ModulatedGuided: Story = { args: { modulated: true, modulationText: "~400–1.4k" } };

/** Patterned value (`.gain("[.45 .7]*4")`): modulated, pattern text as the value. */
export const Patterned: Story = { args: { param: "gain", spec: FIXTURE_SPECS.gain, value: "[.45 .7]*4", mode: "pro" } };

/** Unset lpf: knob fully open, "off". */
export const Unset: Story = { args: { value: null, mode: "pro" } };

/** Bipolar ring from 12 o'clock; value text L16. */
export const Pan: Story = { args: { param: "pan", spec: FIXTURE_SPECS.pan, value: 0.42, mode: "pro" } };

export const PanGuided: Story = { args: { param: "pan", spec: FIXTURE_SPECS.pan, value: 0.62 } };

export const Disabled: Story = { args: { disabled: true } };

export const GuidedPlate: Story = { render: () => <KnobPlate mode="guided" /> };

export const ProPlate: Story = { render: () => <KnobPlate mode="pro" /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <KnobPlate mode="guided" />
        <KnobPlate mode="pro" />
      </div>
    </ThemePair>
  ),
};
