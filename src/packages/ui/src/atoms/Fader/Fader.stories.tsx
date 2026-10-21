import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { Meter } from "../Meter";
import { Fader } from "./Fader";
import { formatDb } from "./faderScale";

const readout: CSSProperties = { font: "600 12px/1.2 var(--ph-font-mono)", color: "var(--ph-text)", textAlign: "center" };
const box: CSSProperties = { display: "flex", gap: 10, padding: "8px 12px", borderRadius: 12, background: "var(--ph-bg)", border: "1px solid var(--ph-line)" };

/** Channel-strip slice: fader + stereo meter + dB readout. */
function StripFader({ name, initial, meter }: { name: string; initial: number; meter: [number, number] }) {
  const [db, setDb] = useState(initial);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <Fader db={db} onChange={setDb} label={`${name} volume`} />
        <Meter level={meter} length="fill" />
      </div>
      <span style={readout}>{formatDb(db)}</span>
    </div>
  );
}

/** The Kit's compact fader + meters box. */
function KitBox() {
  const [db, setDb] = useState(-2.2);
  return (
    <div style={box}>
      <Fader db={db} onChange={setDb} label="Volume" height={96} scale={[6, 0, -12, -48]} />
      <Meter level={[0.72, 0.66]} length="fill" />
      <Meter level={0.7} style={{ alignSelf: "center" }} />
    </div>
  );
}

const meta = {
  title: "Atoms/Fader",
  component: Fader,
  args: { db: -2.2, label: "Kick volume", height: 230, defaultDb: 0, disabled: false, onChange: () => {} },
  argTypes: { db: { control: { type: "range", min: -60, max: 6, step: 0.1 } } },
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof Fader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Unity: Story = { args: { db: 0 } };

export const Maximum: Story = { args: { db: 6 } };

/** −∞: pinned to the bottom. */
export const Silent: Story = { args: { db: -60 } };

export const Disabled: Story = { args: { disabled: true } };

/** Kit size: 96 px throw, four labels. */
export const Compact: Story = { render: () => <KitBox /> };

/** Drag (Shift = fine), wheel, arrows ±0.5 dB (Shift ±3), Home/End, double-click → 0 dB. */
export const Interactive: Story = { render: () => <StripFader name="Bass" initial={-2.2} meter={[0.7, 0.7]} /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <KitBox />
        <StripFader name="Kick" initial={-1.7} meter={[0.74, 0.72]} />
        <StripFader name="Lead" initial={-60} meter={[0, 0]} />
      </div>
    </ThemePair>
  ),
};
