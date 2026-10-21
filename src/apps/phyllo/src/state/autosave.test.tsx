import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProject, useProjectFile } from "../hooks";
import { formatAutosaved } from "./format";
import type { MockStores } from "./mocks";
import { PINNED_NOW, renderWithStores } from "./testUtils";

function AutosaveStatus() {
  const { dispatch } = useProject();
  const { autosavedAt, filePath } = useProjectFile();
  return (
    <div>
      <output aria-label="Autosave">{formatAutosaved(autosavedAt) ?? "not yet"}</output>
      <output aria-label="Path">{filePath ?? "unsaved"}</output>
      <button type="button" onClick={() => dispatch({ type: "tempo/set", bpm: 128 })}>
        Faster
      </button>
    </div>
  );
}

let stores: MockStores | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

describe("autosave", () => {
  it("should save 1.5 s after the last change, not before", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<AutosaveStatus />));
    await user.click(screen.getByRole("button", { name: "Faster" }));

    // Act
    await act(() => vi.advanceTimersByTimeAsync(1400));
    const before = screen.getByRole("status", { name: "Autosave" }).textContent;
    await act(() => vi.advanceTimersByTimeAsync(200));

    // Assert
    expect(before).toBe("not yet");
    expect(screen.getByRole("status", { name: "Autosave" })).toHaveTextContent("Autosaved 12:41");
    expect(screen.getByRole("status", { name: "Path" })).toHaveTextContent("/Phyllo/Untitled Groove.phyllo");
  });

  it("should restart the countdown on every change", async () => {
    // Arrange
    ({ stores } = renderWithStores(<AutosaveStatus />));
    const { dispatch } = stores.project.getState();
    dispatch({ type: "tempo/set", bpm: 126 });
    await act(() => vi.advanceTimersByTimeAsync(1000));

    // Act
    act(() => dispatch({ type: "tempo/set", bpm: 127 }));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    // Assert
    expect(stores.project.getState().autosavedAt).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(stores.project.getState().autosavedAt).not.toBeNull();
  });

  it("should take a version history snapshot with each autosave", async () => {
    // Arrange
    ({ stores } = renderWithStores(<AutosaveStatus />));
    act(() => stores?.project.getState().dispatch({ type: "tempo/set", bpm: 126 }));

    // Act
    await act(() => vi.advanceTimersByTimeAsync(1500));

    // Assert
    expect(await stores.project.getState().listHistory()).toHaveLength(1);
  });

  it("should not autosave when autosave is off in settings", async () => {
    // Arrange
    ({ stores } = renderWithStores(<AutosaveStatus />, { initialSettings: { system: { autosave: false } } }));
    act(() => stores?.project.getState().dispatch({ type: "tempo/set", bpm: 126 }));

    // Act
    await act(() => vi.advanceTimersByTimeAsync(5000));

    // Assert
    expect(stores.project.getState().autosavedAt).toBeNull();
    expect(stores.project.getState().dirty).toBe(true);
  });

  it("should not autosave a selection change", async () => {
    // Arrange
    ({ stores } = renderWithStores(<AutosaveStatus />));
    act(() => stores?.project.getState().dispatch({ type: "ui/select", trackId: "bass" }));

    // Act
    await act(() => vi.advanceTimersByTimeAsync(5000));

    // Assert
    expect(stores.project.getState().filePath).toBeNull();
  });
});
