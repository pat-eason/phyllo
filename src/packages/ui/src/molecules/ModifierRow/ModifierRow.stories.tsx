import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThemePair } from "../../stories/ThemePair";
import { ModifierRow } from "./ModifierRow";

interface Mod {
  id: string;
  code: string;
  description: string;
  enabled: boolean;
  error?: string;
}

const MODS: Mod[] = [
  { id: "a", code: ".lpf(sine.range(400, 1400).slow(8))", description: "Filter follows a slow sine · 8 cycles", enabled: true },
  { id: "b", code: ".sometimes(x => x.ply(2))", description: "Doubles ~50% of notes", enabled: true },
  { id: "c", code: ".lastOf(4, rev)", description: "Reverses the last cycle of every 4", enabled: false },
];

/**
 * "Modifiers · applied in order": drag a handle (or focus it and press ↑/↓, or ⌥↑/⌥↓ on the code) to
 * reorder; double-click or Enter on the code to edit (Enter commits, Esc cancels); Delete removes.
 */
function Chain({ initial = MODS }: { initial?: Mod[] }) {
  const [mods, setMods] = useState(initial);
  const patch = (id: string, p: Partial<Mod>) => setMods((ms) => ms.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const move = (id: string, delta: number) =>
    setMods((ms) => {
      const from = ms.findIndex((m) => m.id === id);
      const to = Math.min(ms.length - 1, Math.max(0, from + delta));
      if (from < 0 || to === from) return ms;
      const next = ms.slice();
      const [item] = next.splice(from, 1);
      if (item) next.splice(to, 0, item);
      return next;
    });
  return (
    <div role="list" aria-label="Modifiers" style={{ display: "flex", flexDirection: "column", gap: 8, width: 272 }}>
      {mods.map((m) => (
        <ModifierRow
          key={m.id}
          code={m.code}
          description={m.description}
          enabled={m.enabled}
          error={m.error}
          onEnabledChange={(enabled) => patch(m.id, { enabled })}
          onEdit={(code) => patch(m.id, { code, error: code.includes("(") ? undefined : "Expected a call like .fast(2)" })}
          onMove={(d) => move(m.id, d)}
          onRemove={() => setMods((ms) => ms.filter((x) => x.id !== m.id))}
        />
      ))}
    </div>
  );
}

const meta = {
  title: "Molecules/ModifierRow",
  component: ModifierRow,
  args: {
    code: ".sometimes(x => x.ply(2))",
    description: "Doubles ~50% of notes",
    enabled: true,
    onEnabledChange: () => {},
    onRemove: () => {},
    onMove: () => {},
    onEdit: () => {},
  },
  render: (args) => (
    <div role="list" style={{ width: 272 }}>
      <ModifierRow {...args} />
    </div>
  ),
  decorators: [(Story) => <div style={{ padding: 24 }}>{Story()}</div>],
} satisfies Meta<typeof ModifierRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Enabled: Story = {};

/** Off: kept in the model, dropped from the code; code drawn in `--ph-muted` (not dimmed by opacity, so contrast holds). */
export const Disabled: Story = { args: { code: ".lastOf(4, rev)", description: "Reverses the last cycle of every 4", enabled: false } };

/** Strings, numbers and calls tinted. */
export const Tinted: Story = { args: { code: '.gain("[.45 .7]*4").pan(sine.range(0.2, 0.8))', description: "Accents and a slow auto-pan" } };

/** Code doesn't parse: red border, message below. */
export const Invalid: Story = { args: { code: ".sometimes(x => x.ply(2)", description: "Doubles ~50% of notes", error: "Missing ) after argument list" } };

/** No `onEdit`: the code is read-only. */
export const ReadOnly: Story = { args: { onEdit: undefined } };

/** Interactive list: reorder (drag / keys), edit, toggle, remove. */
export const List: Story = { render: () => <Chain /> };

export const Themes: Story = {
  render: () => (
    <ThemePair>
      <Chain
        initial={[
          ...MODS,
          { id: "d", code: ".ply(", description: "Plays every note twice", enabled: true, error: "Unexpected end of input" },
        ]}
      />
    </ThemePair>
  ),
};
