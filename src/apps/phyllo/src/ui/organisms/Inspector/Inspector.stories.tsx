import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MockStoresOptions } from "../../../state/mocks";
import { Inspector } from "./Inspector";
import { MOCKUP_BASS, codeTrack, inspectorProject } from "./inspectorFixtures";

/** The inspector at its Arrange size: 320 px wide, full window height (900 px at the PNGs' 1×). */
function Frame() {
  return (
    <div style={{ display: "flex", width: 320, height: "100vh", background: "var(--ph-bg)" }}>
      <Inspector onEditPattern={() => {}} />
    </div>
  );
}

const meta = {
  title: "Organisms/Inspector",
  component: Frame,
} satisfies Meta<typeof Frame>;

export default meta;
type Story = StoryObj<typeof meta>;

const stores = (options: MockStoresOptions) => ({ stores: options });

export const NoSelection: Story = {
  parameters: stores({ initialProject: inspectorProject(null) }),
};

/** PNG 01: Guided bass, six knobs, Try one. */
export const GuidedBass: Story = {
  parameters: stores({ initialProject: inspectorProject("bass", { bass: { pattern: "<c2 eb2 g2 bb1>*2" } }), initialSettings: { uiMode: "guided" } }),
};

export const GuidedDrums: Story = {
  parameters: stores({ initialProject: inspectorProject("kick"), initialSettings: { uiMode: "guided" } }),
};

/** PNG 02: Pro bass, eight knobs (lpf modulated by the sweep), modifier chain. */
export const ProBassWithModifiers: Story = {
  parameters: stores({ initialProject: inspectorProject("bass", { bass: MOCKUP_BASS }), initialSettings: { uiMode: "pro" } }),
};

/** Guided with "Slow filter sweep" applied: Brightness shows the amber modulated ring. */
export const ModulatedKnob: Story = {
  parameters: stores({
    initialProject: inspectorProject("bass", {
      bass: {
        pattern: "<c2 eb2 g2 bb1>*2",
        modifiers: [{ id: "m-sweep", code: ".lpf(sine.range(400,1400).slow(8))", label: "Slow filter sweep", enabled: true, origin: "suggestion" }],
      },
    }),
    initialSettings: { uiMode: "guided" },
  }),
};

/** Hats' gain is a pattern (`"[.4 .7]*4"`), shown as a patterned knob (SPEC §9). */
export const PatternedGainHats: Story = {
  parameters: stores({ initialProject: inspectorProject("hats"), initialSettings: { uiMode: "pro" } }),
};

/** An imported pattern Strudel can't parse: the error shows under the field; nothing is committed. */
export const InvalidPattern: Story = {
  parameters: stores({ initialProject: inspectorProject("bass", { bass: { pattern: "<a1 c2 g1" } }), initialSettings: { uiMode: "guided" } }),
};

/** The engine reports an evaluation error for this track (the fake engine fails on `ERROR`). */
export const EngineError: Story = {
  parameters: stores({
    initialProject: inspectorProject("bass", { bass: { modifiers: [{ id: "m-bad", code: ".ERROR()", enabled: true }] } }),
    initialSettings: { uiMode: "pro" },
  }),
};

export const CodeTrack: Story = {
  parameters: stores({ initialProject: inspectorProject("pad", {}, [codeTrack()]), initialSettings: { uiMode: "pro" } }),
};

/** A MIDI controller knob mapped to the bass cutoff (Settings › MIDI): "CC 13" on the lpf knob. */
export const MidiCcMapped: Story = {
  parameters: stores({
    initialProject: inspectorProject("bass", { bass: MOCKUP_BASS }),
    initialSettings: { uiMode: "pro", midi: { ccMap: { "13": { trackParam: "lpq", cc: 13 }, "14": { trackParam: "gain", cc: 14 } } } },
  }),
};

export const LightPro: Story = {
  globals: { theme: "light", accent: "green" },
  parameters: stores({ initialProject: inspectorProject("bass", { bass: MOCKUP_BASS }), initialSettings: { uiMode: "pro" } }),
};

export const LightGuided: Story = {
  globals: { theme: "light", accent: "blue" },
  parameters: stores({ initialProject: inspectorProject("bass", { bass: { pattern: "<c2 eb2 g2 bb1>*2" } }), initialSettings: { uiMode: "guided" } }),
};
