import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Surface } from "../Surface";
import { Knob, type KnobSize } from "./Knob";

const legend: CSSProperties = { font: "var(--ph-text-legend)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ph-legend)" };
const value: CSSProperties = { font: "400 10.5px/1.2 var(--ph-font-mono)", color: "var(--ph-muted)" };
const caption: CSSProperties = { font: "600 11px/1.2 var(--ph-font-ui)", color: "var(--ph-text)" };

/** Stand-in for ParamKnob: knob + legend + value, owning the state. */
function LabelledKnob({
  name,
  initial,
  format,
  modulated,
  bipolar,
  size = 56,
  color,
  defaultValue,
}: {
  name: string;
  initial: number;
  format: (v: number) => string;
  modulated?: boolean;
  bipolar?: boolean;
  size?: KnobSize;
  color?: string;
  defaultValue?: number;
}) {
  const [v, setV] = useState(initial);
  const text = format(v);
  return (
    <div style={{ width: size === 56 ? 78 : 52, display: "flex", flexDirection: "column", alignItems: "center", gap: size === 56 ? 3 : 1 }}>
      <Knob
        value={v}
        onChange={setV}
        label={name}
        valueText={text}
        modulated={modulated}
        bipolar={bipolar}
        size={size}
        color={color}
        defaultValue={defaultValue ?? initial}
      />
      <span style={size === 56 ? legend : caption}>{name}</span>
      <span style={value}>{text}</span>
    </div>
  );
}

const fixed2 = (v: number) => v.toFixed(2);
const hz = (v: number) => {
  const f = 200 + v * v * 7800;
  return f >= 1000 ? `${(f / 1000).toFixed(1)}k Hz` : `${Math.round(f)} Hz`;
};
const pan = (v: number) => (Math.abs(v - 0.5) < 0.005 ? "C" : v < 0.5 ? `L${Math.round((0.5 - v) * 200)}` : `R${Math.round((v - 0.5) * 200)}`);

/** The Kit's plate: VOLUME · BRIGHTNESS (modulated) · SPACE. */
function KitPlate() {
  return (
    <Surface material="plate" style={{ display: "flex", gap: 6, padding: "12px 10px 8px" }}>
      <LabelledKnob name="Volume" initial={0.78} format={fixed2} />
      <LabelledKnob name="Brightness" initial={0.42} format={() => "~400–1.4k"} modulated />
      <LabelledKnob name="Space" initial={0.2} format={fixed2} />
    </Surface>
  );
}

/** Mixer sends: flat 34 px knobs in the track color. */
function Sends() {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <LabelledKnob name="Space" initial={0.25} format={(v) => `.room ${v.toFixed(2)}`} size={34} color="var(--ph-track-2)" />
      <LabelledKnob name="Echo" initial={0.03} format={(v) => `.delay ${v.toFixed(2)}`} size={34} color="var(--ph-track-2)" />
    </div>
  );
}

const meta = {
  title: "Atoms/Knob",
  component: Knob,
  args: { value: 0.78, label: "Volume", valueText: "0.78", size: 56, modulated: false, bipolar: false, disabled: false, onChange: () => {} },
  argTypes: { size: { control: "inline-radio", options: [56, 34] }, value: { control: { type: "range", min: 0, max: 1, step: 0.01 } } },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Knob>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** A modifier drives the parameter: amber ring. */
export const Modulated: Story = { args: { value: 0.42, label: "Brightness", valueText: "400 to 1.4k Hz, modulated", modulated: true } };

/** Pan: ring grows from 12 o'clock. */
export const Bipolar: Story = { args: { value: 0.3, label: "Pan", valueText: "L40", bipolar: true } };

export const Minimum: Story = { args: { value: 0, valueText: "0.00" } };

export const Maximum: Story = { args: { value: 1, valueText: "1.00" } };

/** 34 px mixer send: track + ring only. */
export const Small: Story = { args: { size: 34, value: 0.25, label: "Space", valueText: "0.25", color: "var(--ph-track-1)" } };

export const Disabled: Story = { args: { disabled: true } };

/** Drag vertically (Shift = fine), wheel, arrows, Home/End, double-click resets. */
export const OnPlate: Story = { render: () => <KitPlate /> };

export const Interactive: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <LabelledKnob name="Brightness" initial={0.5} format={hz} defaultValue={1} />
      <LabelledKnob name="Pan" initial={0.5} format={pan} bipolar />
    </div>
  ),
};

function InterceptDemo() {
  const [v, setV] = useState(0.5);
  const [pending, setPending] = useState<number | null>(null);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Knob
        label="Brightness"
        valueText={`${Math.round(v * 100)}%`}
        value={v}
        modulated
        onChange={setV}
        onBlockedChange={(_direction, next) => setPending(next)}
      />
      <div style={value}>
        {pending === null ? "Focus the knob and press an arrow key." : `Replace the modifier with ${Math.round(pending * 100)}%?`}
        {pending === null ? null : (
          <button
            type="button"
            onClick={() => {
              setV(pending);
              setPending(null);
            }}
          >
            Replace
          </button>
        )}
      </div>
    </div>
  );
}

/** Modulated + `onBlockedChange`: keys, wheel and double-click report the attempted value instead of changing it, so the parent can confirm. */
export const ModulatedIntercept: Story = { render: () => <InterceptDemo /> };

export const MixerSends: Story = { render: () => <Sends /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <KitPlate />
      <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <LabelledKnob name="Pan" initial={0.3} format={pan} bipolar />
        <Sends />
        <Knob value={0.6} onChange={() => {}} label="Disabled" valueText="0.60" disabled />
      </div>
    </ThemePair>
  ),
};
