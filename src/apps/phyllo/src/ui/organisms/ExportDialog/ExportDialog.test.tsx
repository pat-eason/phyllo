import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeError } from "../../../native/errors";
import { PhylloProvider } from "../../../state/PhylloProvider";
import { renderWithStores } from "../../../state/testUtils";
import { ToastProvider } from "../../toasts";
import { ExportDialog } from "./ExportDialog";
import { createExportFixture, exportStoreOptions } from "./fixtures";
import type { RenderMode } from "./fixtures";

function renderDialog(mode: RenderMode = "instant", extra: Parameters<typeof exportStoreOptions>[1] = {}) {
  const fixture = createExportFixture(mode);
  const onClose = vi.fn();
  const user = userEvent.setup();
  const view = renderWithStores(
    <ToastProvider>
      <ExportDialog open onClose={onClose} />
    </ToastProvider>,
    exportStoreOptions(fixture, extra),
  );
  return { ...view, fixture, onClose, user };
}

describe("ExportDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should open as a labelled modal on Mixdown with the range group focused", async () => {
    // Arrange
    renderDialog();

    // Act
    const dialog = screen.getByRole("dialog", { name: "Export" });

    // Assert
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("button", { name: /Mixdown/ })).toHaveAttribute("aria-current", "page");
    const song = within(dialog).getByRole("radio", { name: /Whole song/ });
    expect(song).toHaveTextContent("Whole songBars 1–32 · 1:04");
    expect(song).toHaveFocus();
    expect(within(dialog).getByRole("radio", { name: /Loop region/ })).toHaveTextContent("Bars 9–16 · 0:16");
    expect(await within(dialog).findByDisplayValue("/Phyllo/Exports/Untitled Groove.wav")).toBeInTheDocument();
  });

  it("should move the range selection with the arrow keys", async () => {
    // Arrange
    const { user } = renderDialog();

    // Act
    await user.keyboard("{ArrowRight}{ArrowRight}");

    // Assert
    expect(screen.getByRole("radio", { name: /A section/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Section" })).toHaveDisplayValue("Intro · bars 1–8 · 0:16");
  });

  it("should switch tabs and show each tab's form", async () => {
    // Arrange
    const { user } = renderDialog();

    // Act
    await user.click(screen.getByRole("button", { name: /Stems/ }));

    // Assert
    expect(screen.getByRole("button", { name: /Stems/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("checkbox", { name: "Kick" })).toBeChecked();
    expect(await screen.findByRole("button", { name: "Export 4 stems" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /MIDI/ }));
    expect(screen.getByRole("combobox", { name: "Tracks" })).toHaveDisplayValue("One track per pattern");
    await user.click(screen.getByRole("button", { name: /Code/ }));
    expect(screen.getByRole("radio", { name: /strudel\.cc link/ })).toBeInTheDocument();
  });

  it("should disable Export with a reason when the path is empty", async () => {
    // Arrange
    const { user } = renderDialog();
    const path = await screen.findByRole("textbox", { name: "Save to" });

    // Act
    await user.clear(path);

    // Assert
    const exportButton = screen.getByRole("button", { name: "Export WAV" });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAccessibleDescription("Choose where to save the file.");
  });

  it("should explain that FLAC needs the desktop app and offer no 32-bit float for it", async () => {
    // Arrange
    const { user } = renderDialog();

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Format" }), "FLAC");

    // Assert
    expect(screen.getByRole("button", { name: "Export FLAC" })).toHaveAccessibleDescription(
      "FLAC export needs the desktop app; the browser can only write WAV.",
    );
    const depth = screen.getByRole("combobox", { name: "Bit depth" });
    expect(within(depth).queryByRole("option", { name: "32-bit float" })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue("/Phyllo/Exports/Untitled Groove.flac")).toBeInTheDocument();
  });

  it("should export, show the result and reveal the file", async () => {
    // Arrange
    const { user, fixture } = renderDialog();
    const reveal = vi.spyOn(fixture.native, "revealInFinder");
    const exportButton = await screen.findByRole("button", { name: "Export WAV" });

    // Act
    await user.click(exportButton);
    const done = await screen.findByRole("status");
    const focusedWhenDone = document.activeElement;
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // Assert
    expect(done).toHaveTextContent("Export finished");
    expect(done).toHaveTextContent("Untitled Groove.wav · 1:08 · 24-bit");
    expect(reveal).toHaveBeenCalledWith("Untitled Groove.wav");
    expect(focusedWhenDone).toBe(screen.getByRole("button", { name: "Done" }));
  });

  it("should show progress while rendering and go back to the form on cancel", async () => {
    // Arrange
    const { user } = renderDialog("pending");
    await user.click(await screen.findByRole("button", { name: "Export WAV" }));

    // Act
    const bar = await screen.findByRole("progressbar", { name: "Export progress" });
    await user.click(screen.getByRole("button", { name: "Cancel export" }));

    // Assert
    expect(bar).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export WAV" })).toBeEnabled();
  });

  it("should keep Escape from closing while rendering and close with Escape when idle", async () => {
    // Arrange
    const { user, onClose } = renderDialog("pending");
    await user.click(await screen.findByRole("button", { name: "Export WAV" }));
    await screen.findByRole("progressbar");

    // Act
    await user.keyboard("{Escape}");
    const closedWhileBusy = onClose.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Cancel export" }));
    await user.keyboard("{Escape}");

    // Assert
    expect(closedWhileBusy).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should show a failed export with its reason and retry it", async () => {
    // Arrange
    const { user, fixture } = renderDialog();
    vi.spyOn(fixture.native, "exportBegin").mockRejectedValueOnce(new NativeError("io", "disk full"));
    await user.click(await screen.findByRole("button", { name: "Export WAV" }));

    // Act
    const reason = (await screen.findByRole("alert")).textContent;
    await user.click(screen.getByRole("button", { name: "Try again" }));

    // Assert
    expect(reason).toContain("disk full");
    expect(await screen.findByRole("status")).toHaveTextContent("Export finished");
  });

  it("should copy a strudel.cc link from the Code tab", async () => {
    // Arrange
    const { user } = renderDialog();
    await user.click(screen.getByRole("button", { name: /Code/ }));
    await user.click(screen.getByRole("radio", { name: /strudel\.cc link/ }));

    // Act
    await user.click(screen.getByRole("button", { name: "Copy link" }));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
    await expect(navigator.clipboard.readText()).resolves.toMatch(/^https:\/\/strudel\.cc\/#/);
  });

  it("should finish tip step 5 after an export", async () => {
    // Arrange
    const { user, stores } = renderDialog("instant", { initialSettings: { tips: { step: 5, hidden: false } } });

    // Act
    await user.click(screen.getByRole("button", { name: /MIDI/ }));
    await user.click(await screen.findByRole("button", { name: "Export MIDI" }));
    await screen.findByRole("status");

    // Assert
    expect(stores.settings.getState().settings.tips.hidden).toBe(true);
  });

  it("should trap Tab focus inside the dialog", async () => {
    // Arrange
    const { user } = renderDialog();
    const done = await screen.findByRole("button", { name: "Export WAV" });
    done.focus();

    // Act
    await user.tab();

    // Assert
    expect(screen.getByRole("button", { name: /Mixdown/ })).toHaveFocus();
    await user.tab({ shift: true });
    expect(done).toHaveFocus();
  });

  it("should keep rendering after Keep working and show a Toast with Reveal when done", async () => {
    // Arrange
    const { user, fixture, onClose, rerender, stores } = renderDialog("manual");
    await user.click(await screen.findByRole("button", { name: "Export WAV" }));
    await user.click(await screen.findByRole("button", { name: "Keep working" }));
    rerender(
      <PhylloProvider stores={stores} autoStart={false}>
        <ToastProvider>
          <ExportDialog open={false} onClose={onClose} />
        </ToastProvider>
      </PhylloProvider>,
    );

    // Act
    fixture.finishRender();
    const toast = await screen.findByRole("status");

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toast).toHaveTextContent("Untitled Groove.wav · 1:08 · 24-bit");
    expect(within(toast).getByRole("button", { name: "Reveal" })).toBeInTheDocument();
  });
});
