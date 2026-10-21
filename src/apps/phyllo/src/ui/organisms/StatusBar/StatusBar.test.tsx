import { ThemeProvider } from "@phyllo/ui";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockStores, MockStoresOptions } from "../../../state/mocks";
import { PINNED_NOW, renderWithStores } from "../../../state/testUtils";
import { KEYSTEP_PORT, STORY_FILE, mockupProject } from "../AppHeader/storyFixtures";
import { StatusBar } from "./StatusBar";
import type { StatusBarProps } from "./StatusBar";

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderBar(props: StatusBarProps = {}, options: MockStoresOptions = {}) {
  const result = renderWithStores(
    <ThemeProvider mode="dark" accent="green">
      <StatusBar {...props} />
    </ThemeProvider>,
    { initialProject: mockupProject(), ...options },
  );
  stores = result.stores;
  return result.stores;
}

function evaluate(target: MockStores) {
  act(() => target.engine.getState().regenerateNow());
}

describe("StatusBar", () => {
  it("should say the engine hasn't started before the first evaluation", () => {
    // Arrange / Act
    renderBar();

    // Assert
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText("Not started · press Play")).toBeInTheDocument();
  });

  it("should show Live and the evaluation age once the program is evaluated", () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
    const target = renderBar();

    // Act
    evaluate(target);

    // Assert
    expect(screen.getByText("Live · re-evaluates on every change")).toBeInTheDocument();
    expect(screen.getByText("evaluated 0.0 s ago")).toBeInTheDocument();
  });

  it("should tick the evaluation age every second", async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
    const target = renderBar();
    evaluate(target);

    // Act
    await act(() => vi.advanceTimersByTimeAsync(3000));

    // Assert
    expect(screen.getByText("evaluated 3.0 s ago")).toBeInTheDocument();
  });

  it("should show the error count and first message when the engine rejects the code", () => {
    // Arrange
    const target = renderBar();
    evaluate(target);

    // Act
    act(() => {
      void target.engineHost.get().evaluate({ code: "ERROR", lines: { kick: { start: 1, end: 1 } }, scope: "song" });
    });

    // Assert
    expect(screen.getByRole("button", { name: /1 error · .*ERROR is not defined/ })).toBeInTheDocument();
    expect(screen.queryByText("Live · re-evaluates on every change")).not.toBeInTheDocument();
  });

  it("should open the code drawer when the error is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const target = renderBar();
    evaluate(target);
    act(() => {
      void target.engineHost.get().evaluate({ code: "ERROR", lines: { kick: { start: 1, end: 1 } }, scope: "song" });
    });

    // Act
    await user.click(screen.getByRole("button", { name: /1 error/ }));

    // Assert
    expect(target.settings.getState().settings.codeDrawer.open).toBe(true);
  });

  it("should hand the error to onErrorClick instead when the screen wants it", async () => {
    // Arrange
    const user = userEvent.setup();
    const onErrorClick = vi.fn();
    const target = renderBar({ onErrorClick });
    evaluate(target);
    act(() => {
      void target.engineHost.get().evaluate({ code: "ERROR", lines: { kick: { start: 1, end: 1 } }, scope: "song" });
    });

    // Act
    await user.click(screen.getByRole("button", { name: /1 error/ }));

    // Assert
    expect(onErrorClick).toHaveBeenCalledWith(expect.objectContaining({ message: "ERROR is not defined" }));
    expect(target.settings.getState().settings.codeDrawer.open).toBeNull();
  });

  it("should show the system output with its rate and open Settings on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const target = renderBar({}, { initialSettings: { audio: { sampleRate: 48000 } } });
    const open = vi.spyOn(target.native, "openSettingsWindow").mockResolvedValue();

    // Act
    await user.click(screen.getByRole("button", { name: "System default · 48 kHz" }));

    // Assert
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("should name a chosen output device and a 44.1 kHz rate", () => {
    // Arrange / Act
    renderBar({}, { initialSettings: { audio: { outputDevice: "MacBook Pro Speakers", sampleRate: 44100 } } });

    // Assert
    expect(screen.getByRole("button", { name: "MacBook Pro Speakers · 44.1 kHz" })).toBeInTheDocument();
  });

  it("should list enabled MIDI inputs by device name", () => {
    // Arrange / Act
    renderBar({}, { initialSettings: { midi: { enabledPorts: [KEYSTEP_PORT] } } });

    // Assert
    expect(screen.getByRole("button", { name: "MIDI in: KeyStep 37" })).toBeInTheDocument();
  });

  it("should say there is no MIDI input when none is enabled", () => {
    // Arrange / Act
    renderBar();

    // Assert
    expect(screen.getByRole("button", { name: "No MIDI input" })).toBeInTheDocument();
  });

  it("should say Not saved yet for a project that was never filed", () => {
    // Arrange / Act
    renderBar();

    // Assert
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
  });

  it("should show the autosave time and the shortened file path", async () => {
    // Arrange
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
    const target = renderBar({}, { initialFilePath: STORY_FILE });

    // Act
    act(() => target.project.getState().dispatch({ type: "project/setFavorite", favorite: true }));
    await act(() => vi.advanceTimersByTimeAsync(1600));

    // Assert
    expect(screen.getByText("Autosaved 12:41 ·")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "~/Music/Phyllo/Untitled Groove.phyllo" })).toBeInTheDocument();
  });

  it("should reveal the file in Finder when the path is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const target = renderBar({}, { initialFilePath: STORY_FILE });
    const reveal = vi.spyOn(target.native, "revealInFinder").mockResolvedValue();

    // Act
    await user.click(screen.getByRole("button", { name: "~/Music/Phyllo/Untitled Groove.phyllo" }));

    // Assert
    expect(reveal).toHaveBeenCalledWith(STORY_FILE);
  });

  it("should show a save failure instead of the autosave time", async () => {
    // Arrange
    const target = renderBar({}, { initialFilePath: STORY_FILE });
    vi.spyOn(target.native, "projectWrite").mockRejectedValue(new Error("Disk is full"));

    // Act
    await act(() => target.project.getState().save());

    // Assert
    await waitFor(() => expect(screen.getByText("Couldn't save · Disk is full")).toBeInTheDocument());
  });
});
