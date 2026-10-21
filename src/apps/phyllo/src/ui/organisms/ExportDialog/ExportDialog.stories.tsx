import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@phyllo/ui";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NativeError } from "../../../native/errors";
import { ExportDialog } from "./ExportDialog";
import { createExportFixture, exportStoreOptions } from "./fixtures";
import type { ExportFixture } from "./fixtures";

const GHOST_LANES: [string, string, string][] = [
  ["25%", "75%", "#7FD98A"],
  ["25%", "75%", "#5ECFC8"],
  ["0%", "100%", "#8AB4FF"],
  ["25%", "75%", "#F5C25B"],
  ["0%", "62%", "#B9A2FF"],
  ["62%", "38%", "#F59AC7"],
];

/** A faint timeline behind the scrim (the mockup's "dimmed app") plus an Export button to reopen the dialog. */
function DialogStory({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "var(--ph-bg)", overflow: "hidden" }}>
      <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "120px 280px 0", opacity: 0.35 }}>
        {GHOST_LANES.map(([left, width, color], i) => (
          <div key={i} style={{ position: "relative", height: 46, borderBottom: "1px solid var(--ph-line)" }}>
            <div style={{ position: "absolute", top: 4, bottom: 4, left, width, borderRadius: 6, background: color }} />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 16, left: 16 }}>
        <Button variant="primary" tone="inverse" iconStart="export" onClick={() => setOpen(true)}>
          Export
        </Button>
      </div>
      <ExportDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

const meta = {
  title: "Organisms/ExportDialog",
  component: DialogStory,
} satisfies Meta<typeof DialogStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const withFixture = (fixture: ExportFixture) => ({ stores: exportStoreOptions(fixture) });

export const Mixdown: Story = {
  parameters: withFixture(createExportFixture()),
};

export const LoopRegion: Story = {
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("radio", { name: /Loop region/ }));
  },
};

export const Section: Story = {
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("radio", { name: /A section/ }));
  },
};

export const Stems: Story = {
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /Stems/ }));
  },
};

export const Midi: Story = {
  name: "MIDI",
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /MIDI/ }));
  },
};

export const Code: Story = {
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /Code/ }));
  },
};

/** FLAC in the browser build: Export is disabled with the reason (the desktop app writes FLAC). */
export const Validation: Story = {
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(await canvas.findByRole("combobox", { name: "Format" }), "FLAC");
  },
};

export const Rendering: Story = {
  parameters: withFixture(createExportFixture("pending")),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Export WAV" }));
    await canvas.findByRole("progressbar");
  },
};

export const Done: Story = {
  parameters: withFixture(createExportFixture()),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Export WAV" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent("Export finished");
  },
};

const failing = createExportFixture();
failing.native.exportBegin = () => Promise.reject(new NativeError("io", "The disk is full (36 MB needed)."));

export const Failed: Story = {
  parameters: withFixture(failing),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Export WAV" }));
    await canvas.findByRole("alert");
  },
};

const background = createExportFixture("manual");

/** "Keep working" closes the dialog; the finished export shows as a Toast with Reveal (06-export-dialog.png, top right). */
export const FinishedInBackground: Story = {
  parameters: withFixture(background),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Export WAV" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Keep working" }));
    background.finishRender();
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Export finished"));
  },
};
