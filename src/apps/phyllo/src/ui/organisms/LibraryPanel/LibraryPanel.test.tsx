import { findTrack } from "@phyllo/model";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { NativeApi } from "../../../native/api";
import { createMockNative } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { LibraryPanel, MODIFIER_DRAG_MIME } from ".";
import type { LibraryPanelHandle } from ".";

const FOLDER = "/Users/pat/Music/Samples";

function nativeWithSamples(extra: Partial<NativeApi> = {}): NativeApi {
  return {
    ...createMockNative(),
    sampleFolderScan: async (path) => ({
      path,
      files: [
        { name: "vox", path: `${path}/vox.wav`, ext: "wav" },
        { name: "kick_dusty", path: `${path}/kick_dusty.wav`, ext: "wav" },
      ],
    }),
    ...extra,
  };
}

const guided: MockStoresOptions = { initialSettings: { uiMode: "guided" } };
const pro: MockStoresOptions = { initialSettings: { uiMode: "pro" } };

function dragEvent() {
  const data = new Map<string, string>();
  return {
    data,
    dataTransfer: { setData: (type: string, value: string) => data.set(type, value), effectAllowed: "" },
  };
}

function drumRows() {
  return within(screen.getByRole("list", { name: "Drum sounds" })).getAllByRole("listitem");
}

describe("LibraryPanel", () => {
  it("should name the third tab Starters in Guided and Snippets in Pro", () => {
    // Arrange / Act
    const first = renderWithStores(<LibraryPanel />, guided);
    const guidedTabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    first.unmount();
    renderWithStores(<LibraryPanel />, pro);

    // Assert
    expect(guidedTabs).toEqual(["Sounds", "Samples", "Starters"]);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Sounds", "Samples", "Snippets"]);
  });

  it("should show friendly names first in Guided and code names first in Pro", () => {
    // Arrange / Act
    const first = renderWithStores(<LibraryPanel />, guided);
    const guidedRow = drumRows()[0]?.textContent;
    first.unmount();
    renderWithStores(<LibraryPanel />, pro);

    // Assert
    expect(guidedRow).toBe("Bass drumbd");
    expect(drumRows()[0]).toHaveTextContent("bdBass drum");
  });

  it("should list the sounds of the selected drum bank", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<LibraryPanel />, guided);
    expect(screen.queryByRole("button", { name: "Preview Cowbell" })).not.toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "TR-808" }));

    // Assert
    expect(screen.getByRole("button", { name: "TR-808" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Preview Cowbell" })).toBeInTheDocument();
  });

  it("should preview a drum sound with its bank through the engine", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel />, guided);

    // Act
    await user.click(screen.getByRole("button", { name: "Preview Snare" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.previews).toEqual([{ s: "sd", bank: "RolandTR909" }]));
  });

  it("should preview a synth chip with a note", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel />, guided);

    // Act
    await user.click(screen.getByRole("button", { name: "sawtooth" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.previews).toEqual([{ s: "sawtooth", note: "c3" }]));
  });

  it("should carry a sound reference when a row is dragged", () => {
    // Arrange
    renderWithStores(<LibraryPanel />, guided);
    const { data, dataTransfer } = dragEvent();

    // Act
    fireEvent.dragStart(drumRows()[1] as HTMLElement, { dataTransfer });

    // Assert
    expect(JSON.parse(data.get("application/x-phyllo-sound") ?? "null")).toEqual({ source: "bank", name: "sd", bank: "RolandTR909" });
  });

  it("should carry a synth reference when a chip is dragged", () => {
    // Arrange
    renderWithStores(<LibraryPanel />, guided);
    const { data, dataTransfer } = dragEvent();

    // Act
    fireEvent.dragStart(screen.getByRole("button", { name: "supersaw" }), { dataTransfer });

    // Assert
    expect(JSON.parse(data.get("application/x-phyllo-sound") ?? "null")).toEqual({ source: "synth", name: "supersaw" });
  });

  it("should swap the sound of the selected drum track on Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel />, guided);
    act(() => stores.project.getState().dispatch({ type: "ui/select", trackId: "kick" }));
    const snare = drumRows()[1] as HTMLElement;

    // Act
    snare.focus();
    await user.keyboard("{Enter}");

    // Assert
    expect(findTrack(stores.project.getState().project, "kick")?.pattern).toBe("sd*4");
  });

  it("should change the sound of the selected melodic track when an instrument chip gets Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel />, guided);
    act(() => stores.project.getState().dispatch({ type: "ui/select", trackId: "bass" }));

    // Act
    screen.getByRole("button", { name: "Marimba" }).focus();
    await user.keyboard("{Enter}");

    // Assert
    expect(findTrack(stores.project.getState().project, "bass")?.source.sound).toBe("gm_marimba");
  });

  it("should add a new track on Enter when nothing is selected", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel />, guided);
    act(() => stores.project.getState().dispatch({ type: "ui/select", trackId: null }));
    const before = stores.project.getState().project.tracks.length;

    // Act
    screen.getByRole("button", { name: "triangle" }).focus();
    await user.keyboard("{Enter}");

    // Assert
    const { project } = stores.project.getState();
    expect(project.tracks).toHaveLength(before + 1);
    expect(project.tracks.at(-1)).toMatchObject({ kind: "melodic", source: { sound: "triangle" } });
    expect(project.ui.selectedTrack).toBe(project.tracks.at(-1)?.id);
  });

  it("should filter by plain words in Guided and replace the groups with the results", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<LibraryPanel />, guided);

    // Act
    await user.type(screen.getByRole("searchbox", { name: "Search sounds" }), "warm bass");

    // Assert
    expect(screen.getByRole("button", { name: "sawtooth" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Electric bass" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your folders" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Drum sounds" })).not.toBeInTheDocument();
  });

  it("should explain an empty search and clear it", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<LibraryPanel />, guided);
    await user.type(screen.getByRole("searchbox", { name: "Search sounds" }), "zzzz");
    expect(screen.getByText("No sounds match “zzzz”")).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "Clear search" }));

    // Assert
    expect(screen.getByRole("searchbox", { name: "Search sounds" })).toHaveValue("");
    expect(screen.getByRole("list", { name: "Drum sounds" })).toBeInTheDocument();
  });

  it("should focus the search field through the imperative handle", () => {
    // Arrange
    const ref = createRef<LibraryPanelHandle>();
    renderWithStores(<LibraryPanel ref={ref} />, pro);

    // Act
    act(() => ref.current?.focusSearch());

    // Assert
    expect(screen.getByRole("searchbox", { name: "Search sounds" })).toHaveFocus();
  });

  it("should list linked folders with file counts and expand them to files", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<LibraryPanel initialTab="samples" />, {
      native: nativeWithSamples(),
      initialSettings: { uiMode: "guided", sampleFolders: [FOLDER] },
    });

    // Act
    const folder = await screen.findByRole("button", { name: /^…\/Music\/Samples/ });
    await screen.findByText("Watching");
    await user.click(folder);

    // Assert
    expect(folder).toHaveTextContent("2");
    expect(folder).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Preview vox.wav" })).toBeInTheDocument();
  });

  it("should preview a sample by its name", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="samples" />, {
      native: nativeWithSamples(),
      initialSettings: { uiMode: "guided", sampleFolders: [FOLDER] },
    });
    await user.click(await screen.findByRole("button", { name: /^…\/Music\/Samples/ }));

    // Act
    await user.click(screen.getByRole("button", { name: "Preview kick_dusty.wav" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.previews).toEqual([{ s: "kick_dusty" }]));
  });

  it("should link a folder chosen in the native dialog", async () => {
    // Arrange
    const user = userEvent.setup();
    const openDialog = vi.fn(async () => "/Users/pat/Loops");
    const { stores } = renderWithStores(<LibraryPanel initialTab="samples" />, {
      native: nativeWithSamples({ openDialog }),
      initialSettings: { uiMode: "guided" },
    });
    expect(screen.getByText("No sample folders yet")).toBeInTheDocument();

    // Act
    await user.click(screen.getByRole("button", { name: "Link a folder…" }));

    // Assert
    expect(openDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    await waitFor(() => expect(stores.settings.getState().settings.sampleFolders).toEqual(["/Users/pat/Loops"]));
    expect(await screen.findByRole("button", { name: /^\/Users\/pat\/Loops/ })).toBeInTheDocument();
  });

  it("should unlink a folder", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="samples" />, {
      native: nativeWithSamples(),
      initialSettings: { uiMode: "guided", sampleFolders: [FOLDER] },
    });

    // Act
    await user.click(await screen.findByRole("button", { name: `Unlink ${FOLDER}` }));

    // Assert
    expect(stores.settings.getState().settings.sampleFolders).toEqual([]);
  });

  it("should start the chosen starter at once when the project has no unsaved changes", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="extras" />, guided);
    expect(stores.project.getState().dirty).toBe(false);

    // Act
    await user.click(screen.getByRole("button", { name: /Lo-fi keys/ }));

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(82);
  });

  it("should ask before replacing a project with unsaved changes", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="extras" />, guided);
    act(() => stores.project.getState().dispatch({ type: "track/setMute", trackId: "kick", mute: true }));
    expect(stores.project.getState().dirty).toBe(true);

    // Act
    await user.click(screen.getByRole("button", { name: /Lo-fi keys/ }));

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(124);
    const confirm = screen.getByRole("group", { name: "Confirm new groove" });

    // Act
    await user.click(within(confirm).getByRole("button", { name: "Start new groove" }));

    // Assert
    expect(stores.project.getState().project.tempo.bpm).toBe(82);
  });

  it("should keep the project when the confirmation is dismissed", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="extras" />, guided);
    act(() => stores.project.getState().dispatch({ type: "track/setMute", trackId: "kick", mute: true }));
    await user.click(screen.getByRole("button", { name: /Lo-fi keys/ }));

    // Act
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    // Assert
    expect(screen.queryByRole("group", { name: "Confirm new groove" })).not.toBeInTheDocument();
    expect(stores.project.getState().project.tempo.bpm).toBe(124);
  });

  it("should mark the starter list as the starter-picker tip anchor", () => {
    // Arrange / Act
    renderWithStores(<LibraryPanel initialTab="extras" />, guided);

    // Assert
    expect(screen.getAllByRole("group", { name: "Starters" })[0]).toHaveAttribute("data-tip-target", "starter-picker");
  });

  it("should add a snippet to the selected track on Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="extras" />, pro);
    act(() => stores.project.getState().dispatch({ type: "ui/select", trackId: "bass" }));

    // Act
    screen.getByRole("listitem", { name: /^hpf:/ }).focus();
    await user.keyboard("{Enter}");

    // Assert
    const modifiers = findTrack(stores.project.getState().project, "bass")?.modifiers ?? [];
    expect(modifiers.at(-1)).toMatchObject({ code: ".hpf(300)", enabled: true });
  });

  it("should tell the user to select a track when a snippet is added with nothing selected", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<LibraryPanel initialTab="extras" />, pro);
    act(() => stores.project.getState().dispatch({ type: "ui/select", trackId: null }));

    // Act
    screen.getByRole("listitem", { name: /^hpf:/ }).focus();
    await user.keyboard("{Enter}");

    // Assert
    expect(screen.getByRole("status")).toHaveTextContent("Select a track first");
    expect(screen.getByRole("button", { name: /Add \.hpf\(300\)/ })).toBeDisabled();
  });

  it("should carry the template when a snippet is dragged", () => {
    // Arrange
    renderWithStores(<LibraryPanel initialTab="extras" />, pro);
    const { data, dataTransfer } = dragEvent();

    // Act
    fireEvent.dragStart(screen.getByRole("listitem", { name: /^hpf:/ }), { dataTransfer });

    // Assert
    expect(JSON.parse(data.get(MODIFIER_DRAG_MIME) ?? "null")).toEqual({
      name: "hpf",
      code: ".hpf(300)",
      label: "Cut the low end below 300 Hz",
    });
  });

  it("should filter snippets by name", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<LibraryPanel initialTab="extras" />, pro);

    // Act
    await user.type(screen.getByRole("searchbox", { name: "Search" }), "lpf");

    // Assert
    expect(screen.getByRole("listitem", { name: /^lpf:/ })).toBeInTheDocument();
    expect(screen.queryByRole("listitem", { name: /^hpf:/ })).not.toBeInTheDocument();
  });
});
