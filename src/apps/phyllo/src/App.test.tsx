import { findTrack, serializeProject } from "@phyllo/model";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import type { NativeApi } from "./native/api";
import type { MenuActionEvent, MenuItemState, OpenFilesEvent } from "./native/types";
import { PhylloProvider } from "./state";
import { createMockNative, createMockStores, fixtureProject, seedLibrary } from "./state/mocks";
import type { MockStores, MockStoresOptions } from "./state/mocks";
import { AppThemeProvider } from "./ui/shell";
import { LAST_PROJECT_KEY } from "./ui/shell/startup";

/** Browser NativeApi with the OS event streams (menu, open files) driven by the test. */
function nativeWithEvents(overrides: Partial<NativeApi> = {}) {
  const base = createMockNative();
  const listeners: { menu?: (event: MenuActionEvent) => void; open?: (event: OpenFilesEvent) => void } = {};
  const menuStates: MenuItemState[] = [];
  const pending: string[] = [];
  const native: NativeApi = {
    ...base,
    onMenuAction: async (callback) => {
      listeners.menu = callback;
      return () => undefined;
    },
    menuSetState: async (state) => {
      menuStates.push(state);
    },
    onOpenFiles: async (callback) => {
      listeners.open = callback;
      return () => undefined;
    },
    takePendingOpenFiles: async () => pending.splice(0),
    ...overrides,
  };
  return {
    native,
    menuStates,
    pending,
    menu: (event: MenuActionEvent) => act(() => listeners.menu?.(event)),
    openFiles: (paths: string[]) => act(() => listeners.open?.({ paths })),
  };
}

let stores: MockStores | undefined;

interface RenderOptions extends MockStoresOptions {
  /** A settings file existed before launch (not a first launch). */
  savedSettings?: boolean;
  /** Projects in the library before launch; resolves their paths. */
  library?: Parameters<typeof seedLibrary>[1];
  /** Path of the "last open project" (index into `library`). */
  lastOpen?: number;
  settingsOnly?: boolean;
}

async function renderApp(options: RenderOptions = {}) {
  const { savedSettings = false, library = [], lastOpen, settingsOnly = false, ...storeOptions } = options;
  stores = createMockStores(storeOptions);
  const paths = await seedLibrary(stores.native, library);
  if (savedSettings) await stores.native.settingsStore.save({ uiMode: "guided" });
  if (lastOpen !== undefined) localStorage.setItem(LAST_PROJECT_KEY, paths[lastOpen]!);
  const user = userEvent.setup();
  const result = render(
    <PhylloProvider stores={stores} autoStart={false}>
      <AppThemeProvider>
        <App settingsOnly={settingsOnly} isMac={false} openUrl={() => undefined} />
      </AppThemeProvider>
    </PhylloProvider>,
  );
  return { ...result, user, stores, paths };
}

const returning = { savedSettings: true, library: [fixtureProject()], lastOpen: 0 } as const;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
});

afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

describe("App", () => {
  it("should open Guided start on first launch", async () => {
    // Arrange / Act
    await renderApp();

    // Assert
    expect(await screen.findByRole("heading", { name: /Start from a seed/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/start");
  });

  it("should reopen last session's project in Arrange", async () => {
    // Arrange / Act
    await renderApp(returning);

    // Assert
    expect(await screen.findByRole("complementary", { name: "Track inspector" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/arrange");
    expect(screen.getByRole("list", { name: "Tracks" })).toBeInTheDocument();
  });

  it("should show the Library when no project was open last session", async () => {
    // Arrange / Act
    await renderApp({ savedSettings: true, library: [fixtureProject({ name: "Night bus" })] });

    // Assert
    expect(await screen.findByRole("button", { name: /Open Night bus/ })).toBeInTheDocument();
    expect(window.location.hash).toBe("#/library");
  });

  it("should switch screens with ⌘1 / ⌘2 / ⌘3 and ⇧⌘L", async () => {
    // Arrange
    const { user } = await renderApp(returning);
    await screen.findByRole("complementary", { name: "Track inspector" });

    // Act / Assert
    await user.keyboard("{Control>}2{/Control}");
    expect(await screen.findByRole("textbox", { name: "Live code" })).toBeInTheDocument();
    await user.keyboard("{Control>}3{/Control}");
    expect(await screen.findByRole("main", { name: "Mixer" })).toBeInTheDocument();
    await user.keyboard("{Shift>}{Control>}L{/Control}{/Shift}");
    expect(await screen.findByRole("main", { name: "Groove library" })).toBeInTheDocument();
    await user.keyboard("{Control>}1{/Control}");
    expect(await screen.findByRole("main", { name: "Arrange" })).toBeInTheDocument();
  });

  it("should mute the selected track with M, but not while typing in a field", async () => {
    // Arrange
    const { user, stores } = await renderApp(returning);
    const inspector = await screen.findByRole("complementary", { name: "Track inspector" });
    const selected = () => findTrack(stores.project.getState().project, stores.project.getState().project.ui.selectedTrack);
    expect(selected()).toBeDefined();

    // Act
    await user.click(within(inspector).getByRole("textbox", { name: /Pattern/ }));
    await user.keyboard("m");

    // Assert
    expect(selected()?.mute).toBe(false);

    // Act
    await act(async () => (document.activeElement as HTMLElement | null)?.blur());
    await user.keyboard("m");

    // Assert
    expect(selected()?.mute).toBe(true);
  });

  it("should ask Save / Don't save / Cancel before New replaces unsaved changes when autosave is off", async () => {
    // Arrange
    const { user, stores } = await renderApp({ ...returning, initialSettings: { system: { autosave: false } } });
    await screen.findByRole("complementary", { name: "Track inspector" });
    act(() => stores.project.getState().dispatch({ type: "project/rename", name: "Edited groove" }));

    // Act
    await user.keyboard("{Control>}n{/Control}");
    const dialog = await screen.findByRole("alertdialog", { name: /Save changes to “Edited groove”/ });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    // Assert
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(window.location.hash).toBe("#/arrange");

    // Act
    await user.keyboard("{Control>}n{/Control}");
    await user.click(await screen.findByRole("button", { name: "Don't save" }));

    // Assert
    expect(await screen.findByRole("heading", { name: /Start from a seed/ })).toBeInTheDocument();
  });

  it("should save first when Save is chosen in the unsaved-changes dialog", async () => {
    // Arrange
    const { user, stores, paths } = await renderApp({ ...returning, initialSettings: { system: { autosave: false } } });
    await screen.findByRole("complementary", { name: "Track inspector" });
    act(() => stores.project.getState().dispatch({ type: "project/rename", name: "Keep me" }));

    // Act
    await user.keyboard("{Control>}n{/Control}");
    await user.click(await screen.findByRole("button", { name: "Save" }));

    // Assert
    expect(await screen.findByRole("heading", { name: /Start from a seed/ })).toBeInTheDocument();
    expect(await stores.native.projectRead(paths[0]!)).toContain('"name": "Keep me"');
  });

  it("should flush autosave instead of asking when autosave is on", async () => {
    // Arrange
    const { user, stores, paths } = await renderApp(returning);
    await screen.findByRole("complementary", { name: "Track inspector" });
    act(() => stores.project.getState().dispatch({ type: "project/rename", name: "Autosaved" }));

    // Act
    await user.keyboard("{Control>}n{/Control}");

    // Assert
    expect(await screen.findByRole("heading", { name: /Start from a seed/ })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(await stores.native.projectRead(paths[0]!)).toContain('"name": "Autosaved"');
  });

  it("should list version history newest first and restore a snapshot as an undoable change", async () => {
    // Arrange
    const events = nativeWithEvents();
    const project = fixtureProject({ name: "Current" });
    const { user, stores } = await renderApp({ ...returning, library: [project], native: events.native });
    await screen.findByRole("complementary", { name: "Track inspector" });
    await stores.native.historySnapshot(project.id, serializeProject({ ...project, name: "First draft" }));
    await stores.native.historySnapshot(project.id, serializeProject(project));

    // Act
    await events.menu({ id: "file.history" });
    const dialog = await screen.findByRole("dialog", { name: "Version history" });
    const versions = within(dialog).getAllByRole("listitem");

    // Assert
    expect(versions).toHaveLength(2);
    expect(within(versions[0]!).getByText("Latest")).toBeInTheDocument();

    // Act
    await user.click(within(versions[1]!).getByRole("button", { name: /Restore version/ }));

    // Assert
    await waitFor(() => expect(stores.project.getState().project.name).toBe("First draft"));
    expect(screen.queryByRole("dialog", { name: "Version history" })).not.toBeInTheDocument();
    await act(async () => (document.activeElement as HTMLElement | null)?.blur());
    await user.keyboard("{Control>}z{/Control}");
    expect(stores.project.getState().project.name).toBe("Current");
  });

  it("should run native menu actions through the same action table", async () => {
    // Arrange
    const events = nativeWithEvents();
    const { stores, paths } = await renderApp({
      savedSettings: true,
      library: [fixtureProject(), fixtureProject({ name: "Second" })],
      lastOpen: 0,
      native: events.native,
    });
    await screen.findByRole("complementary", { name: "Track inspector" });
    const loopBefore = stores.transport.getState().loop.enabled;

    // Act / Assert
    await events.menu({ id: "view.mixer" });
    expect(await screen.findByRole("main", { name: "Mixer" })).toBeInTheDocument();
    await events.menu({ id: "transport.loop" });
    expect(stores.transport.getState().loop.enabled).toBe(!loopBefore);
    await events.menu({ id: "view.uiMode" });
    expect(stores.settings.getState().settings.uiMode).toBe("pro");
    await events.menu({ id: "file.openRecent", path: paths[1]! });
    await waitFor(() => expect(stores.project.getState().project.name).toBe("Second"));
    expect(await screen.findByRole("main", { name: "Arrange" })).toBeInTheDocument();
  });

  it("should keep the menu's Play label, check marks and mode label in sync", async () => {
    // Arrange
    const events = nativeWithEvents();
    const { stores } = await renderApp({ ...returning, native: events.native });
    await screen.findByRole("complementary", { name: "Track inspector" });

    // Act
    act(() => stores.settings.getState().setUiMode("pro"));

    // Assert
    await waitFor(() => expect(events.menuStates).toContainEqual({ id: "view.uiMode", text: "Switch to Guided" }));
    expect(events.menuStates).toContainEqual({ id: "transport.playPause", text: "Play" });
    expect(events.menuStates).toContainEqual({ id: "view.theme.system", checked: true });
  });

  it("should open files from the OS only while Settings › System allows it", async () => {
    // Arrange
    const events = nativeWithEvents();
    const { stores, paths } = await renderApp({
      savedSettings: true,
      library: [fixtureProject(), fixtureProject({ name: "From Finder" })],
      lastOpen: 0,
      native: events.native,
    });
    await screen.findByRole("complementary", { name: "Track inspector" });

    // Act
    act(() => stores.settings.getState().set("system", { fileAssociations: false }));
    await events.openFiles([paths[1]!]);

    // Assert
    expect(stores.project.getState().project.name).not.toBe("From Finder");

    // Act
    act(() => stores.settings.getState().set("system", { fileAssociations: true }));
    await events.openFiles(["/Users/me/notes.txt", paths[1]!]);

    // Assert
    await waitFor(() => expect(stores.project.getState().project.name).toBe("From Finder"));
  });

  it("should open a file handed over at cold start in Arrange", async () => {
    // Arrange
    const events = nativeWithEvents();
    const base = createMockNative();
    await base.strudelWrite("/Users/me/beat.strudel", '$: s("bd*4")');
    events.native.strudelRead = base.strudelRead;
    events.pending.push("/Users/me/beat.strudel");

    // Act
    const { stores } = await renderApp({ native: events.native });

    // Assert
    expect(await screen.findByRole("main", { name: "Arrange" })).toBeInTheDocument();
    expect(stores.project.getState().project.name).toBe("beat");
  });

  it("should import a .strudel file from the Library and open it", async () => {
    // Arrange
    const base = createMockNative();
    await base.strudelWrite("/Users/me/loop.strudel", '$: s("hh*8")');
    const events = nativeWithEvents({ openDialog: async () => ["/Users/me/loop.strudel"], strudelRead: base.strudelRead });
    const { user, stores } = await renderApp({ savedSettings: true, library: [fixtureProject()], native: events.native });
    const header = await screen.findByRole("banner");

    // Act
    await user.click(within(header).getByRole("button", { name: "Import…" }));

    // Assert
    expect(await screen.findByRole("main", { name: "Arrange" })).toBeInTheDocument();
    expect(stores.project.getState().project.name).toBe("loop");
    expect(stores.project.getState().filePath).toMatch(/loop\.phyllo$/);
  });

  it("should solo the edited track only while Play pattern plays", async () => {
    // Arrange
    const { user, stores } = await renderApp(returning);
    await screen.findByRole("complementary", { name: "Track inspector" });
    const trackId = stores.project.getState().project.ui.selectedTrack ?? stores.project.getState().project.tracks[0]!.id;
    act(() => window.location.assign(`#/pattern/${trackId}`));
    const play = await screen.findByRole("button", { name: "Play pattern" });
    const solo = () => findTrack(stores.project.getState().project, trackId)?.solo;

    // Act
    await user.click(play);

    // Assert
    await waitFor(() => expect(stores.transport.getState().playing).toBe(true));
    expect(solo()).toBe(true);

    // Act
    await user.click(screen.getByRole("button", { name: "Stop pattern" }));

    // Assert
    await waitFor(() => expect(solo()).toBe(false));
    expect(stores.project.getState().canUndo).toBe(false);
  });

  it("should render only Settings in the Settings window", async () => {
    // Arrange / Act
    await renderApp({ settingsOnly: true });

    // Assert
    expect(await screen.findByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Transport" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument();
  });
});
