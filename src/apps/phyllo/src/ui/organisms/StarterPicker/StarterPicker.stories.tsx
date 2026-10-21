import type { Meta, StoryObj } from "@storybook/react-vite";
import { toShareUrl } from "@phyllo/engine";
import type { Project } from "@phyllo/model";
import { userEvent, within } from "storybook/test";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAppStores } from "../../../hooks";
import { fixtureProject, seedLibrary } from "../../../state/mocks";
import { StarterPicker } from "./StarterPicker";

const DAY_MS = 86_400_000;
const daysAgo = (days: number): string => new Date(Date.now() - days * DAY_MS).toISOString();

// `lead` is each project's first-track colour, which the recent list uses as its swatch (png/03-guided-start.png: amber, violet, teal).
const grooves = (count: number): Project[] =>
  [
    { name: "Untitled Groove", modified: daysAgo(0.1), starter: "house", lead: "#F5C25B" },
    { name: "Night bus", modified: daysAgo(2), starter: "lofi", lead: "#B9A2FF" },
    { name: "Euclid study 2", modified: daysAgo(9), starter: "euclid", lead: "#5ECFC8" },
    { name: "Rainy keys", modified: daysAgo(21), starter: "lofi", lead: "#8AB4FF" },
    { name: "Stage select", modified: daysAgo(40), starter: "stage", lead: "#F59AC7" },
    { name: "Older sketch", modified: daysAgo(120), starter: "ambient", lead: "#FF9C7A" },
  ]
    .slice(0, count)
    .map(({ name, modified, starter, lead }, i) => ({
      ...fixtureProject({ id: `prj_story_${i}`, name, modified }),
      tracks: fixtureProject()
        .tracks.slice(0, starter === "ambient" ? 2 : 4)
        .map((track, index) => (index === 0 ? { ...track, color: lead } : track)),
    }));

/** Writes `projects` into the mock library, then renders the children once it has scanned them. */
function WithLibrary({ projects, children }: { projects: Project[]; children: ReactNode }) {
  const { native, library } = useAppStores();
  const [ready, setReady] = useState(projects.length === 0);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    void seedLibrary(native, projects)
      .then(() => library.getState().refresh())
      .then(() => setReady(true));
  }, [native, library, projects]);
  return ready ? children : null;
}

const meta = {
  title: "Organisms/StarterPicker",
  component: StarterPicker,
  args: { onOpened: () => {} },
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <WithLibrary projects={grooves(3)}>
      <StarterPicker {...args} />
    </WithLibrary>
  ),
} satisfies Meta<typeof StarterPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** House groove selected, three recent projects (matches `png/03-guided-start.png`). */
export const Default: Story = {};

export const LofiSelected: Story = { args: { initialStarter: "lofi" } };

export const BlankSelected: Story = { args: { initialStarter: "blank" } };

/** Tempo nudged away from the starter's 124: the `setcpm` line follows. */
export const TempoChanged: Story = { args: { initialStarter: "house", initialBpm: 132 } };

/** Key moved from A minor to F minor: bass and lead are transposed, drums stay. */
export const KeyChanged: Story = { args: { initialStarter: "stage", initialKey: "F minor" } };

export const RecentEmpty: Story = {
  render: (args) => <StarterPicker {...args} />,
};

/** The list caps at five, newest first. */
export const RecentFull: Story = {
  render: (args) => (
    <WithLibrary projects={grooves(6)}>
      <StarterPicker {...args} />
    </WithLibrary>
  ),
};

async function importLink(canvasElement: HTMLElement, link: string): Promise<void> {
  const canvas = within(canvasElement);
  const field = await canvas.findByRole("textbox", { name: "strudel.cc link" });
  await userEvent.click(field);
  await userEvent.paste(link);
  await userEvent.click(canvas.getByRole("button", { name: "Import" }));
}

/** A strudel.cc link that fails to parse, shown inline under the field with its line and column. */
export const LinkImportError: Story = {
  play: ({ canvasElement }) => importLink(canvasElement, toShareUrl('$: s("bd*4")\n$: s("hh*8").gain(')),
};

/** Short `?id` links can't be decoded offline. */
export const ShortLinkError: Story = {
  play: ({ canvasElement }) => importLink(canvasElement, "https://strudel.cc/?abc123xyz"),
};

/** Screen supplies its own AppHeader: the picker renders only the page. */
export const WithoutHeader: Story = { args: { showHeader: false } };
