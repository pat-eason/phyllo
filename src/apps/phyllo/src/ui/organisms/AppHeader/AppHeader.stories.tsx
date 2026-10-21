import { Button, Icon } from "@phyllo/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ViewTabs } from "../ViewTabs";
import type { ViewName } from "../ViewTabs";
import { AppHeader } from "./AppHeader";
import { storeOptions } from "./storyFixtures";
import { Seed } from "./StorySeed";

const meta = {
  title: "Organisms/AppHeader",
  component: AppHeader,
  parameters: { stores: storeOptions() },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "100vh", background: "var(--ph-bg)" }}>
        <Story />
      </div>
    ),
  ],
  args: { onExport: () => {}, onVersionHistory: () => {} },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Arrange, dark, Guided (png/01). */
export const Guided: Story = {};

/** Arrange, light, Pro: BPM caption shows `setcpm(30)` (png/02). */
export const ProLight: Story = {
  globals: { theme: "light" },
  parameters: { stores: storeOptions({ initialSettings: { uiMode: "pro" } }) },
};

export const Pro: Story = {
  parameters: { stores: storeOptions({ initialSettings: { uiMode: "pro" } }) },
};

/** Transport running: the play key shows Pause and position/cycle tick without re-rendering the header. */
export const Playing: Story = {
  decorators: [
    (Story) => (
      <Seed play>
        <Story />
      </Seed>
    ),
  ],
};

export const Light: Story = { globals: { theme: "light" } };

/** No MIDI input enabled: the record key is hidden. */
export const NoMidi: Story = {
  parameters: { stores: storeOptions({ initialSettings: { midi: { enabledPorts: [] } } }) },
};

/** Project menu open (Rename, Save, Save As…, Version History…). */
export const MenuOpen: Story = {
  play: ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']")?.click();
  },
};

/** Narrow window: the three groups wrap without overlapping (1100 px target). */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 1100 }}>
        <Story />
      </div>
    ),
  ],
};

function compactStory(current: ViewName, withLibrary: boolean, actions: React.ReactNode): Story {
  return {
    args: {
      variant: "compact",
      viewTabs: <ViewTabs current={current} withLibrary={withLibrary} onNavigate={() => {}} />,
      actions,
    },
  };
}

const bpmText = (
  <span style={{ font: "var(--ph-text-code)", color: "var(--ph-muted)" }}>120 BPM</span>
);

/** Pattern editor (png/04): view tabs plus "Play pattern". */
export const CompactPattern: Story = compactStory(
  "pattern",
  false,
  <>
    <Button variant="primary" iconStart="play">
      Play pattern
    </Button>
    {bpmText}
  </>,
);

/** Mixer (png/05): view tabs plus a hint. */
export const CompactMixer: Story = compactStory(
  "mixer",
  false,
  <span style={{ color: "var(--ph-muted)" }}>
    Faders write <code>.gain()</code> · sends write <code>.room()</code> and <code>.delay()</code> on the track&apos;s bus
  </span>,
);

/** Groove library (png/08): no open project, Library tab first, Import… and New groove. */
const libraryStory = compactStory(
  "library",
  true,
  <>
    <Button>Import…</Button>
    <Button variant="primary">
      <Icon name="plus" size={14} />
      New groove
    </Button>
  </>,
);
export const CompactLibrary: Story = { args: { ...libraryStory.args, hideProjectName: true } };

/** Guided start (png/03): no project name, no tabs. */
export const CompactGuidedStart: Story = {
  args: {
    variant: "compact",
    hideProjectName: true,
    actions: (
      <>
        <Button>Open project…</Button>
        <Button variant="ghost">I know Strudel — skip to Pro</Button>
      </>
    ),
  },
};
