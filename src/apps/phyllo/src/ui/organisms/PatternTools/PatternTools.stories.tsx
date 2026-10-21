import type { Meta, StoryObj } from "@storybook/react-vite";
import type { MockStoresOptions } from "../../../state/mocks";
import { PatternEditorProvider } from "../StepSequencer";
import { drumsTrack, editorProject, leadTrack } from "../StepSequencer/fixtures";
import { PatternTools } from "./PatternTools";

const drums: MockStoresOptions = { initialProject: editorProject("drums") };
const pro: MockStoresOptions = { initialProject: editorProject("drums"), initialSettings: { uiMode: "pro" } };
const feel: MockStoresOptions = {
  initialProject: editorProject("drums", [
    drumsTrack({
      modifiers: [
        { id: "f1", code: ".swingBy(1/6, 4)", enabled: true, origin: "feel", label: "Swing" },
        { id: "f2", code: ".degradeBy(.1)", enabled: true, origin: "feel", label: "Chance to skip" },
        { id: "f3", code: ".lastOf(4, x => x.fast(2))", enabled: true, origin: "feel", label: "Fill every 4th cycle" },
      ],
    }),
    leadTrack(),
  ]),
};
const melodic: MockStoresOptions = { initialProject: editorProject("lead") };

const meta = {
  title: "Organisms/PatternTools",
  component: PatternTools,
  parameters: { stores: drums },
  render: (args) => (
    <PatternEditorProvider defaultRow="oh">
      <div style={{ display: "flex", justifyContent: "flex-end", minHeight: "100vh", background: "var(--ph-bg)" }}>
        <PatternTools {...args} style={{ maxWidth: 420 }} />
      </div>
    </PatternEditorProvider>
  ),
} satisfies Meta<typeof PatternTools>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Guided: Euclid preview for the selected row (Open hat), feel sliders off, cheat sheet. */
export const EuclidPreview: Story = {};

/** Pro mode: no plain-language lines under the feel sliders. */
export const Pro: Story = { parameters: { stores: pro } };

/** Swing, Chance to skip and Fill applied (read back from the track's modifiers with matchFeel). */
export const FeelApplied: Story = { parameters: { stores: feel } };

/** Melodic track: Euclid explains it needs a drum row; Feel still applies to the whole track. */
export const MelodicTrack: Story = { parameters: { stores: melodic } };
