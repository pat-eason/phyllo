import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import type { NativeApi } from "../../../native/api";
import type { SampleFile } from "../../../native/types";
import { createMockNative } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";
import { LibraryPanel } from "./LibraryPanel";

/** The panel as the Arrange screen hosts it: a 248 px column the full height of the window. */
function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", width: 248, height: "100vh", background: "var(--ph-bg)" }}>{children}</div>;
}

const meta = {
  title: "Organisms/LibraryPanel",
  component: LibraryPanel,
  decorators: [
    (Story) => (
      <Frame>
        <Story />
      </Frame>
    ),
  ],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof LibraryPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const guided: MockStoresOptions = { initialSettings: { uiMode: "guided" } };

const pro: MockStoresOptions = { initialSettings: { uiMode: "pro" } };

function files(folder: string, names: readonly string[]): SampleFile[] {
  return names.map((name) => ({ name, path: `${folder}/${name}.wav`, ext: "wav" }));
}

const SAMPLES_DIR = "/Users/pat/Music/Samples";
const LOOPS_DIR = "/Users/pat/Music/Field recordings";

const SCANS: Record<string, SampleFile[]> = {
  [SAMPLES_DIR]: files(SAMPLES_DIR, ["vox", "vox_chop_1", "vox_chop_2", "kick_dusty", "snare_tape", "hat_vinyl", "rim_wood", "pad_swell", "riser", "texture_rain"]),
  [LOOPS_DIR]: files(LOOPS_DIR, ["cafe", "street", "train", "birds"]),
};

/** A browser NativeApi that pretends two folders are linked and can link a third. */
function nativeWithFolders(): NativeApi {
  const native = createMockNative();
  return {
    ...native,
    sampleFolderScan: async (path) => ({ path, files: SCANS[path] ?? [] }),
    openDialog: async () => "/Users/pat/Music/New folder",
  };
}

const withFolders = (options: MockStoresOptions): MockStoresOptions => ({
  ...options,
  native: nativeWithFolders(),
  initialSettings: { ...options.initialSettings, sampleFolders: [SAMPLES_DIR, LOOPS_DIR] },
});

export const GuidedSounds: Story = { parameters: { stores: withFolders(guided) } };

export const ProSounds: Story = { parameters: { stores: withFolders(pro) } };

export const SamplesWithFolders: Story = {
  args: { initialTab: "samples" },
  parameters: { stores: withFolders(guided) },
  play: async ({ canvasElement }) => {
    const folder = await within(canvasElement).findByRole("button", { name: /^…\/Music\/Samples/ });
    await userEvent.click(folder);
  },
};

export const SamplesEmpty: Story = {
  args: { initialTab: "samples" },
  parameters: { stores: guided },
};

export const Starters: Story = {
  args: { initialTab: "extras" },
  parameters: { stores: guided },
};

export const Snippets: Story = {
  args: { initialTab: "extras" },
  parameters: { stores: pro },
};

export const SearchNoResults: Story = {
  parameters: { stores: guided },
  play: async ({ canvasElement }) => {
    const search = within(canvasElement).getByRole("searchbox", { name: "Search sounds" });
    await userEvent.type(search, "zzzz");
    await expect(within(canvasElement).getByText(/No sounds match/)).toBeInTheDocument();
  },
};

export const SearchResults: Story = {
  parameters: { stores: withFolders(guided) },
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("searchbox", { name: "Search sounds" }), "warm bass");
  },
};
