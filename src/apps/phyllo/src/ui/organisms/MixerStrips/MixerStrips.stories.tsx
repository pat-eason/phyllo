import type { Meta, StoryObj } from "@storybook/react-vite";
import { fixtureProject } from "../../../state/mocks";
import { mixerProject, playingEngine } from "../ChannelStrip/fixtures";
import { MixerStrips } from "./MixerStrips";

const meta = {
  title: "Organisms/MixerStrips",
  component: MixerStrips,
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MixerStrips>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The House starter as it comes (4 tracks on orbit 1), stopped. */
export const HouseStarter: Story = { parameters: { stores: { initialProject: fixtureProject() } } };

/** House dressed like png/05-mixer.png (Bass selected on orbit 2), playing so meters move. */
export const Playing: Story = { parameters: { stores: { initialProject: mixerProject(), engine: playingEngine() } } };
