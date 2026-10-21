import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createFakeEngine } from "../../../state/fakeEngine";
import type { MockStoresOptions } from "../../../state/mocks";
import { SettingsLayout } from "./SettingsLayout";
import { SAMPLE_FOLDERS, SAMPLE_MIDI_PORTS, createSettingsNative } from "./SettingsLayout.fixtures";
import { ThemeScope } from "./ThemeScope";

const withThemeScope: Decorator = (Story) => (
  <ThemeScope>
    <Story />
  </ThemeScope>
);

const meta = {
  title: "Organisms/SettingsLayout",
  component: SettingsLayout,
  decorators: [withThemeScope],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SettingsLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const stores = (options: MockStoresOptions = {}): { stores: MockStoresOptions } => ({
  stores: {
    native: createSettingsNative().native,
    initialSettings: { appearance: { mode: "dark", accent: "green" } },
    ...options,
  },
});

const BUILT_IN_URLS = Array.from({ length: 1480 }, (_, index) => `https://strudel.b-cdn.net/sound${index}.wav`);
const listSoundUrls = async () => BUILT_IN_URLS;

/** Full page, dark, Guided, green; the nav highlights the section in view. */
export const Dark: Story = {
  args: { listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "dark", accent: "green" } } }),
};

/** Full page in the light theme (the PNG target `07-settings.png`). */
export const Light: Story = {
  args: { listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "light", accent: "green" } } }),
};

export const Pro: Story = {
  args: { listSoundUrls },
  parameters: stores({ initialSettings: { uiMode: "pro", appearance: { mode: "dark", accent: "green" } } }),
};

export const General: Story = {
  args: { initialSection: "general", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "light", accent: "green" } } }),
};

export const Appearance: Story = {
  args: { initialSection: "appearance", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "light", accent: "green" } } }),
};

/** Red accent: record and mute turn magenta (D28), so the picker says so and the preview shows the record key. */
export const AppearanceRed: Story = {
  args: { initialSection: "appearance", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "dark", accent: "red" } } }),
};

const deviceEngine = Object.assign(createFakeEngine({ ready: true }), {
  listOutputDevices: async () => [
    { id: "default", label: "Default" },
    { id: "speakers", label: "MacBook Pro Speakers" },
    { id: "dac", label: "Scarlett 2i2 USB" },
  ],
});

/** Devices the engine lists, with "System default" first. */
export const AudioDevices: Story = {
  args: { initialSection: "audio", listSoundUrls },
  parameters: stores({ engine: deviceEngine, initialSettings: { appearance: { mode: "light", accent: "green" }, audio: { outputDevice: "speakers" } } }),
};

/** The platform can't switch outputs (only the system default is listed): the Select is disabled and says why. */
export const AudioNoDeviceSwitching: Story = {
  args: { initialSection: "audio", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "dark", accent: "green" } } }),
};

const downloading = createSettingsNative({ cacheStatus: { files: 0, bytes: 0 } });

/** "Download built-in sounds for offline use" with 612 of 1,480 files done. */
export const OfflineDownloadInProgress: Story = {
  args: { initialSection: "audio", listSoundUrls },
  parameters: stores({ native: downloading.native, initialSettings: { appearance: { mode: "dark", accent: "green" } } }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /download built-in sounds/i }));
    await waitFor(() => expect(downloading.prefetchCalls).toHaveLength(1));
    downloading.emitProgress({ done: 612, total: BUILT_IN_URLS.length, failed: 3 });
    await canvas.findByRole("progressbar");
  },
};

const cached = createSettingsNative({ cacheStatus: { files: 1480, bytes: 60_680_000 } });

/** Sounds already downloaded: size line and an enabled "Clear cache". */
export const OfflineCached: Story = {
  args: { initialSection: "audio", listSoundUrls },
  parameters: stores({ native: cached.native, initialSettings: { appearance: { mode: "light", accent: "green" } } }),
};

const withPorts = createSettingsNative();

/** Device table with two inputs and an output; one input is on, SuperDirt is off. */
export const MidiWithPorts: Story = {
  args: { initialSection: "midi", listSoundUrls },
  parameters: stores({
    native: withPorts.native,
    initialSettings: {
      appearance: { mode: "light", accent: "green" },
      midi: { enabledPorts: [SAMPLE_MIDI_PORTS[0]?.id ?? "", SAMPLE_MIDI_PORTS[2]?.id ?? ""] },
    },
  }),
};

const ccMapped = createSettingsNative();

/** After "Map 8 knobs to the inspector (CC 13–20)", with SuperDirt on. */
export const MidiCcMapped: Story = {
  args: { initialSection: "midi", listSoundUrls },
  parameters: stores({
    native: ccMapped.native,
    initialSettings: { appearance: { mode: "dark", accent: "blue" }, osc: { enabled: true } },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /map 8 knobs/i }));
    await canvas.findByRole("list", { name: /current cc mapping/i });
  },
};

const noPorts = createSettingsNative({ ports: [] });

export const MidiNoDevices: Story = {
  args: { initialSection: "midi", listSoundUrls },
  parameters: stores({ native: noPorts.native, initialSettings: { appearance: { mode: "dark", accent: "green" } } }),
};

const folders = createSettingsNative({
  folders: { ...SAMPLE_FOLDERS, "/Volumes/Unplugged/Loops": null },
});

export const SampleFolders: Story = {
  args: { initialSection: "library", listSoundUrls },
  parameters: stores({
    native: folders.native,
    initialSettings: {
      appearance: { mode: "light", accent: "teal" },
      sampleFolders: [...Object.keys(SAMPLE_FOLDERS), "/Volumes/Unplugged/Loops"],
    },
  }),
};

export const SampleFoldersEmpty: Story = {
  args: { initialSection: "library", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "dark", accent: "green" } } }),
};

export const Shortcuts: Story = {
  args: { initialSection: "shortcuts", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "dark", accent: "green" } } }),
};

export const CodeEditor: Story = {
  args: { initialSection: "editor", listSoundUrls },
  parameters: stores({ initialSettings: { appearance: { mode: "light", accent: "green" } } }),
};

export const System: Story = {
  args: { initialSection: "system", listSoundUrls, onOpenHistory: () => {} },
  parameters: stores({ initialSettings: { appearance: { mode: "dark", accent: "purple" }, system: { menuBar: true } } }),
};
