import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { SoundRow, type SoundRef } from "./SoundRow";

const noop = () => {};
const bd: SoundRef = { source: "bank", name: "bd", bank: "RolandTR909" };

const meta = {
  title: "Molecules/SoundRow",
  component: SoundRow,
  args: { code: "bd", friendly: "Bass drum", mode: "guided", onPreview: noop, dragData: bd },
  render: (args) => (
    <ul style={{ margin: 0, padding: 24, width: 320, listStyle: "none" }}>
      <SoundRow {...args} />
    </ul>
  ),
} satisfies Meta<typeof SoundRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Guided: Story = {};
export const Pro: Story = { args: { mode: "pro" } };
export const Active: Story = { args: { active: true } };
export const Previewing: Story = { args: { previewing: true, active: true } };
export const LongNames: Story = {
  args: { code: "gm_acoustic_guitar_nylon", friendly: "Acoustic guitar (nylon string, soundfont)", mode: "guided" },
};

/** Only one preview at a time; Space previews, Enter inserts, and the row drags natively. */
function Library({ mode }: { mode: "guided" | "pro" }) {
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [selected, setSelected] = useState("cp");
  const [last, setLast] = useState("");
  const sounds = [
    { code: "bd", friendly: "Bass drum" },
    { code: "cp", friendly: "Clap" },
    { code: "sd", friendly: "Snare" },
    { code: "hh", friendly: "Closed hat" },
  ];
  return (
    <>
      <ul style={{ margin: 0, padding: 0, width: 300, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
        {sounds.map((s) => (
          <SoundRow
            key={s.code}
            {...s}
            mode={mode}
            active={selected === s.code}
            previewing={previewing === s.code}
            dragData={{ source: "bank", name: s.code, bank: "RolandTR909" }}
            onPreview={() => setPreviewing((p) => (p === s.code ? null : s.code))}
            onInsert={() => setLast(`Inserted ${s.code}`)}
            onFocus={() => setSelected(s.code)}
          />
        ))}
      </ul>
      <p style={{ margin: "12px 0 0", font: "400 11px var(--ph-font-mono)", color: "var(--ph-muted)" }}>{last}</p>
    </>
  );
}
export const GuidedList: Story = { render: () => <Library mode="guided" /> };
export const ProList: Story = { render: () => <Library mode="pro" /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <ul style={{ margin: 0, padding: 0, width: 280, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
        <SoundRow {...meta.args} />
        <SoundRow {...meta.args} code="cp" friendly="Clap" active />
        <SoundRow {...meta.args} code="sd" friendly="Snare" previewing />
        <SoundRow {...meta.args} code="hh" friendly="Closed hat" mode="pro" />
      </ul>
    </ThemePair>
  ),
};

/** `previewTabbable={false}`: the row is the tab stop (roving lists); the preview button stays clickable. */
export const PreviewOutOfTabOrder: Story = { args: { previewTabbable: false } };
