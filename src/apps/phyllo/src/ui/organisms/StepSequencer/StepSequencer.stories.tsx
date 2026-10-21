import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useTransport } from "../../../hooks";
import type { MockStoresOptions } from "../../../state/mocks";
import { PatternTools } from "../PatternTools";
import { drumsTrack, editorProject, leadTrack } from "./fixtures";
import { PatternEditorProvider } from "./PatternEditorProvider";
import { StepSequencer } from "./StepSequencer";

function Frame({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", minHeight: "100vh", background: "var(--ph-bg)" }}>{children}</div>;
}

/** Starts the (fake) transport so the current step ring moves. */
function PlayOnMount() {
  const { play } = useTransport();
  useEffect(() => {
    play().catch(() => {
      // The fake engine always starts; nothing to recover from in a story.
    });
  }, [play]);
  return null;
}

const drums: MockStoresOptions = { initialProject: editorProject("drums") };
const pro: MockStoresOptions = { initialProject: editorProject("drums"), initialSettings: { uiMode: "pro" } };
const hats: MockStoresOptions = { initialProject: editorProject("hats") };
const unfit: MockStoresOptions = {
  initialProject: editorProject("drums", [drumsTrack({ pattern: "<bd sd>*2, hh*[8 12]" }), leadTrack()]),
};
const lead: MockStoresOptions = { initialProject: editorProject("lead") };
const bass: MockStoresOptions = { initialProject: editorProject("bass") };

const meta = {
  title: "Organisms/StepSequencer",
  component: StepSequencer,
  parameters: { stores: drums, defaultRow: "oh" },
  render: (args, { parameters }) => (
    <PatternEditorProvider defaultRow={(parameters["defaultRow"] as string | null | undefined) ?? null}>
      <Frame>
        <StepSequencer {...args} />
      </Frame>
    </PatternEditorProvider>
  ),
} satisfies Meta<typeof StepSequencer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mockup state: one-call drum kit, Open hat selected, its velocity lane below. */
export const DrumSteps: Story = {};

/** Pro mode: same grid; the pattern field drops its Guided hint. */
export const Pro: Story = { parameters: { stores: pro } };

/** Playing: the current step is ringed (DOM writes from `subscribePosition`, no re-render). */
export const Playing: Story = {
  render: (args) => (
    <PatternEditorProvider defaultRow="oh">
      <PlayOnMount />
      <Frame>
        <StepSequencer {...args} />
      </Frame>
    </PatternEditorProvider>
  ),
};

/** A hats track whose velocity lives in `.gain("[.4 .7]*4")`. */
export const SingleRowVelocity: Story = { parameters: { stores: hats, defaultRow: null } };

/** Pattern that can't be shown as steps: text only, plus "Replace with a step pattern". */
export const UnfitPattern: Story = { parameters: { stores: unfit } };

/** Melodic note track in the piano roll (A minor, snap to key). */
export const PianoRoll: Story = { parameters: { stores: lead } };

/** Melodic track whose `<…>` pattern changes every cycle: the piano roll refuses it. */
export const PianoRollUnfit: Story = { parameters: { stores: bass } };

/** Code tab: the track's generated line(s) and its pattern field. */
export const CodeTab: Story = { args: { defaultTab: "code" } };

/** The whole Pattern editor body (StepSequencer + PatternTools), for comparing with `png/04-pattern-editor.png`. */
export const WithTools: Story = {
  render: (args) => (
    <PatternEditorProvider defaultRow="oh">
      <Frame>
        <StepSequencer {...args} />
        <PatternTools />
      </Frame>
    </PatternEditorProvider>
  ),
};
