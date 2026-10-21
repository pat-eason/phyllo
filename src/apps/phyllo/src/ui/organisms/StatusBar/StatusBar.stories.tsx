import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { STORY_FILE, storeOptions } from "../AppHeader/storyFixtures";
import { Seed } from "../AppHeader/StorySeed";
import { StatusBar } from "./StatusBar";

const meta = {
  title: "Organisms/StatusBar",
  component: StatusBar,
  parameters: { stores: storeOptions({ initialFilePath: STORY_FILE, timing: { autosaveMs: 50 } }) },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "var(--ph-bg)" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StatusBar>;

export default meta;
type Story = StoryObj<typeof meta>;

const playingAndAutosaved: Decorator = (Story) => (
  <Seed play autosave>
    <Story />
  </Seed>
);

/** Evaluated, MIDI keyboard enabled, autosaved to a file (png/01). */
export const Live: Story = { decorators: [playingAndAutosaved] };

export const Light: Story = { decorators: [playingAndAutosaved], globals: { theme: "light" } };

/** The engine rejected the code: error dot, count and first message (click opens the code drawer). */
export const EngineError: Story = {
  decorators: [
    (Story) => (
      <Seed error autosave>
        <Story />
      </Seed>
    ),
  ],
};

/** A new project that has never been filed. */
export const NotSavedYet: Story = {
  parameters: { stores: storeOptions({ initialFilePath: null }) },
  decorators: [
    (Story) => (
      <Seed>
        <Story />
      </Seed>
    ),
  ],
};

/** Nothing evaluated yet, no MIDI input, system audio output. */
export const Idle: Story = {
  parameters: { stores: storeOptions({ initialSettings: { midi: { enabledPorts: [] } } }) },
};

/** A custom output device is selected and the rate is pinned. */
export const CustomOutput: Story = {
  parameters: {
    stores: storeOptions({
      initialFilePath: STORY_FILE,
      initialSettings: { audio: { outputDevice: "MacBook Pro Speakers", sampleRate: 44100 } },
    }),
  },
  decorators: [playingAndAutosaved],
};

/** Narrow window: items wrap onto a second line. */
export const Narrow: Story = {
  decorators: [
    playingAndAutosaved,
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
};
