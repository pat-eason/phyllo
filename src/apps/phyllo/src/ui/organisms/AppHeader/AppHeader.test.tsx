import { ThemeProvider } from "@phyllo/ui";
import type { ThemeMode } from "@phyllo/ui";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockStores, MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { ViewTabs } from "../ViewTabs";
import { AppHeader } from "./AppHeader";
import type { AppHeaderProps } from "./AppHeader";
import { KEYSTEP_PORT, mockupProject } from "./storyFixtures";

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderHeader(props: AppHeaderProps = {}, options: MockStoresOptions & { theme?: ThemeMode } = {}) {
  const { theme = "dark", ...storeOptions } = options;
  const result = renderWithStores(
    <ThemeProvider mode={theme} accent="green">
      <AppHeader {...props} />
    </ThemeProvider>,
    { initialProject: mockupProject(), ...storeOptions },
  );
  stores = result.stores;
  return { ...result, stores: result.stores };
}

describe("AppHeader", () => {
  it("should show the project, transport and readout in the full variant", () => {
    // Arrange / Act
    renderHeader();

    // Assert
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Untitled Groove/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Transport" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "120 BPM, edit tempo" })).toBeInTheDocument();
    expect(screen.getByText("C minor")).toBeInTheDocument();
    expect(screen.getByText("KEY · 4/4")).toBeInTheDocument();
    expect(screen.getByText("BAR · BEAT · 16TH")).toBeInTheDocument();
    expect(screen.getByText("CYCLE")).toBeInTheDocument();
  });

  it("should caption BPM with TAP in Guided and the setcpm form in Pro", async () => {
    // Arrange
    const user = userEvent.setup();
    renderHeader();
    expect(screen.getByText("BPM · TAP")).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("radio", { name: "Pro" }));

    // Assert
    expect(screen.getByText("BPM · setcpm(30)")).toBeInTheDocument();
  });

  it("should switch Guided/Pro without touching the project", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    const before = stores.project.getState().project;

    // Act
    await user.click(screen.getByRole("radio", { name: "Pro" }));

    // Assert
    expect(stores.settings.getState().settings.uiMode).toBe("pro");
    expect(stores.project.getState().project).toBe(before);
    expect(screen.getByRole("radio", { name: "Pro" })).toBeChecked();
  });

  it("should play and pause from the play key", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();

    // Act
    await user.click(screen.getByRole("button", { name: "Play" }));

    // Assert
    await waitFor(() => expect(stores.transport.getState().playing).toBe(true));
    await user.click(await screen.findByRole("button", { name: "Pause" }));
    expect(stores.transport.getState().playing).toBe(false);
  });

  it("should arm recording only when a MIDI input is enabled", () => {
    // Arrange / Act
    renderHeader();

    // Assert
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("should not offer recording when only a MIDI output is enabled", () => {
    // Arrange / Act
    renderHeader({}, { initialSettings: { midi: { enabledPorts: ["out:IAC Bus 1"] } } });

    // Assert
    expect(screen.queryByRole("button", { name: "Record" })).not.toBeInTheDocument();
  });

  it("should offer the record key and arm it when a MIDI input is enabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader({}, { initialSettings: { midi: { enabledPorts: [KEYSTEP_PORT] } } });

    // Act
    await user.click(screen.getByRole("button", { name: "Record" }));

    // Assert
    expect(stores.transport.getState().recordArmed).toBe(true);
  });

  it("should toggle loop and the metronome", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    const loopBefore = stores.transport.getState().loop.enabled;

    // Act
    await user.click(screen.getByRole("button", { name: "Loop" }));
    await user.click(screen.getByRole("button", { name: "Metronome" }));

    // Assert
    expect(stores.transport.getState().loop.enabled).toBe(!loopBefore);
    expect(stores.transport.getState().metronome).toBe(true);
    expect(screen.getByRole("button", { name: "Metronome" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should click on every beat of the bar once the metronome is on", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();

    // Act
    await user.click(screen.getByRole("button", { name: "Metronome" }));
    await user.click(screen.getByRole("button", { name: "Play" }));

    // Assert
    expect(stores.fakeEngine.metronome).toEqual({ on: true, beatsPerBar: 4 });
  });

  it("should stop clicking when the metronome is switched off during playback", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    await user.click(screen.getByRole("button", { name: "Play" }));
    await user.click(screen.getByRole("button", { name: "Metronome" }));

    // Act
    await user.click(screen.getByRole("button", { name: "Metronome" }));

    // Assert
    expect(stores.fakeEngine.metronome).toEqual({ on: false, beatsPerBar: 4 });
  });

  it("should edit the tempo in place", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();

    // Act
    await user.click(screen.getByRole("button", { name: "120 BPM, edit tempo" }));
    await user.keyboard("{Control>}a{/Control}128{Enter}");

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(128);
    expect(screen.getByRole("button", { name: "128 BPM, edit tempo" })).toBeInTheDocument();
  });

  it("should clamp a typed tempo to 40-240", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();

    // Act
    await user.click(screen.getByRole("button", { name: "120 BPM, edit tempo" }));
    await user.keyboard("{Control>}a{/Control}999{Enter}");

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(240);
  });

  it("should set the tempo from taps on the BPM caption", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    const now = vi.spyOn(Date, "now");
    const caption = screen.getByText("BPM · TAP");

    // Act: four taps 400 ms apart = 150 BPM
    for (const at of [10_000, 10_400, 10_800, 11_200]) {
      now.mockReturnValue(at);
      await user.click(caption);
    }

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(150);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should set the tempo from T presses while the BPM cell has focus", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    const now = vi.spyOn(Date, "now");
    screen.getByRole("button", { name: "120 BPM, edit tempo" }).focus();

    // Act: three taps 600 ms apart = 100 BPM
    for (const at of [5_000, 5_600, 6_200]) {
      now.mockReturnValue(at);
      await user.keyboard("t");
    }

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(100);
  });

  it("should restart tap tempo after a long pause", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    const now = vi.spyOn(Date, "now");
    screen.getByRole("button", { name: "120 BPM, edit tempo" }).focus();

    // Act: 100 BPM pair, a 10 s gap, then a lone tap that must not average in the gap
    for (const at of [1_000, 1_600, 11_600]) {
      now.mockReturnValue(at);
      await user.keyboard("t");
    }

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(100);
  });

  it("should update the position readout from the transport feed", async () => {
    // Arrange
    vi.useFakeTimers();
    const { stores } = renderHeader();
    const position = () => screen.getByText(/^\d+\.\d+\.\d+$/).textContent;
    expect(position()).toBe("1.1.1");

    // Act
    await act(async () => {
      await stores.transport.getState().play();
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Assert
    expect(position()).not.toBe("1.1.1");
    expect(stores.transport.getState().playing).toBe(true);
  });

  it("should toggle the theme to the opposite of the one showing", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader({}, { theme: "light" });

    // Act
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    // Assert
    expect(stores.settings.getState().settings.appearance.mode).toBe("dark");
  });

  it("should pick an explicit theme when the setting is Match system", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader({}, { theme: "system", initialSettings: { appearance: { mode: "system" } } });
    const showing = document.documentElement.dataset["theme"];

    // Act
    await user.click(screen.getByRole("button", { name: /Switch to (dark|light) theme/ }));

    // Assert
    expect(stores.settings.getState().settings.appearance.mode).toBe(showing === "dark" ? "light" : "dark");
  });

  it("should open the settings screen in the app window", async () => {
    // Arrange
    const user = userEvent.setup();
    renderHeader();

    // Act
    await user.click(screen.getByRole("button", { name: "Settings" }));

    // Assert
    await waitFor(() => expect(window.location.hash).toBe("#/settings"));
  });

  it("should call onExport and carry the tip anchor on the Export button", async () => {
    // Arrange
    const user = userEvent.setup();
    const onExport = vi.fn();
    renderHeader({ onExport });
    const exportButton = screen.getByRole("button", { name: "Export" });

    // Act
    await user.click(exportButton);

    // Assert
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(exportButton).toHaveAttribute("data-tip-target", "header-export");
  });

  it("should outline Export while the tip coach points at it", () => {
    // Arrange
    const { stores } = renderHeader({}, { initialSettings: { tips: { step: 5 } } });
    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).not.toHaveAttribute("data-tip-highlight");

    // Act
    act(() => stores.tips.getState().showMe());

    // Assert
    expect(exportButton).toHaveAttribute("data-tip-highlight");
  });

  it("should list the project menu actions and close on Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    renderHeader({ onVersionHistory: vi.fn() });
    const trigger = screen.getByRole("button", { name: /Untitled Groove/ });

    // Act
    await user.click(trigger);

    // Assert
    const menu = screen.getByRole("menu", { name: "Project" });
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "Rename",
      "Save",
      "Save As…",
      "Version History…",
    ]);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("should move through the items with the arrow keys", async () => {
    // Arrange
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();

    // Act
    await user.keyboard("{ArrowDown}");

    // Assert
    expect(screen.getByRole("menuitem", { name: "Save" })).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Version History…" })).toBeDisabled();
  });

  it("should rename the project inline", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    await user.keyboard("{Control>}a{/Control}Night Bus{Enter}");

    // Assert
    expect(stores.project.getState().project.name).toBe("Night Bus");
    expect(screen.getByRole("button", { name: /Night Bus/ })).toHaveFocus();
  });

  it("should keep the name when the rename is cancelled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));

    // Act
    await user.keyboard("Oops{Escape}");

    // Assert
    expect(stores.project.getState().project.name).toBe("Untitled Groove");
    expect(screen.queryByRole("textbox", { name: "Project name" })).not.toBeInTheDocument();
  });

  it("should save and save as from the menu", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader();
    vi.spyOn(stores.native, "saveDialog").mockResolvedValue("/Users/pat/Music/Phyllo/Copy.phyllo");

    // Act
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));
    await user.click(screen.getByRole("menuitem", { name: "Save" }));
    await waitFor(() => expect(stores.project.getState().filePath).not.toBeNull());
    const savedAt = stores.project.getState().filePath;
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));
    await user.click(screen.getByRole("menuitem", { name: "Save As…" }));

    // Assert
    expect(savedAt).toMatch(/Untitled Groove\.phyllo$/);
    await waitFor(() => expect(stores.project.getState().filePath).toBe("/Users/pat/Music/Phyllo/Copy.phyllo"));
  });

  it("should open version history through the screen's handler", async () => {
    // Arrange
    const user = userEvent.setup();
    const onVersionHistory = vi.fn();
    renderHeader({ onVersionHistory });
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Version History…" }));

    // Assert
    expect(onVersionHistory).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("should reveal the file in Finder once the project has a path", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderHeader({}, { initialFilePath: "/Users/pat/Music/Phyllo/Untitled Groove.phyllo" });
    const reveal = vi.spyOn(stores.native, "revealInFinder").mockResolvedValue();
    await user.click(screen.getByRole("button", { name: /Untitled Groove/ }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: "Show in Finder" }));

    // Assert
    expect(reveal).toHaveBeenCalledWith("/Users/pat/Music/Phyllo/Untitled Groove.phyllo");
  });

  it("should show the logo, project name, tabs and actions without transport", async () => {
    // Arrange
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderHeader({
      variant: "compact",
      viewTabs: <ViewTabs current="pattern" onNavigate={onNavigate} />,
      actions: <button type="button">Play pattern</button>,
    });

    // Act
    await user.click(screen.getByRole("button", { name: "Mixer" }));

    // Assert
    expect(screen.getByText("Untitled Groove")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pattern" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Play pattern" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Transport" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export" })).not.toBeInTheDocument();
    expect(onNavigate).toHaveBeenCalledWith("mixer");
  });

  it("should leave out the project name on the guided start screen", () => {
    // Arrange / Act
    renderHeader({ variant: "compact", hideProjectName: true });

    // Assert
    expect(screen.queryByText("Untitled Groove")).not.toBeInTheDocument();
  });
});
