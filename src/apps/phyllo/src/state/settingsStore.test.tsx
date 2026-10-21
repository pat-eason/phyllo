import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCodeDrawer, useSettings, useUiMode } from "../hooks";
import { createMockNative, createMockStores } from "./mocks";
import type { MockStores } from "./mocks";
import { defaultSettings, mergeSettings } from "./settingsModel";
import type { SettingsChannel } from "./settingsStore";
import { renderWithStores } from "./testUtils";

function SettingsPanel() {
  const { settings, set } = useSettings();
  const { mode, setMode } = useUiMode();
  const drawer = useCodeDrawer();
  return (
    <div>
      <output aria-label="Mode">{mode}</output>
      <output aria-label="Drawer">{drawer.open ? "open" : "closed"}</output>
      <output aria-label="Accent">{settings.appearance.accent}</output>
      <button type="button" onClick={() => setMode("pro")}>
        Pro
      </button>
      <button type="button" onClick={drawer.toggle}>
        Toggle code
      </button>
      <button type="button" onClick={() => set("osc", { enabled: true, port: 57121 })}>
        Enable OSC
      </button>
    </div>
  );
}

/** Two windows' channels wired to each other in memory. */
function linkedChannels(): [SettingsChannel, SettingsChannel] {
  const listeners: [Set<(raw: unknown) => void>, Set<(raw: unknown) => void>] = [new Set(), new Set()];
  const make = (self: 0 | 1): SettingsChannel => ({
    post: (value) => listeners[self === 0 ? 1 : 0].forEach((l) => l(structuredClone(value))),
    subscribe(callback) {
      listeners[self].add(callback);
      return () => listeners[self].delete(callback);
    },
    close: () => listeners[self].clear(),
  });
  return [make(0), make(1)];
}

const created: MockStores[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const s of created.splice(0)) s.dispose();
  vi.useRealTimers();
});

describe("settingsStore", () => {
  it("should fall back to defaults for invalid stored values and keep valid ones", () => {
    // Arrange
    const raw = { appearance: { mode: "neon", accent: "teal" }, audio: { lookaheadMs: 5000 }, library: { tileSize: 9 }, extra: 1 };

    // Act
    const merged = mergeSettings(raw);

    // Assert
    expect(merged.appearance).toEqual({ mode: "system", accent: "teal" });
    expect(merged.audio.lookaheadMs).toBe(1000);
    expect(merged.library.tileSize).toBe(4);
    expect(merged).not.toHaveProperty("extra");
  });

  it("should have the documented defaults", () => {
    // Arrange + Act
    const settings = defaultSettings();

    // Assert
    expect(settings).toEqual({
      appearance: { mode: "system", accent: "green" },
      uiMode: "guided",
      audio: { outputDevice: null, sampleRate: null, lookaheadMs: 100 },
      midi: { enabledPorts: [], ccMap: {} },
      osc: { enabled: false, host: "127.0.0.1", port: 57120 },
      sampleFolders: [],
      system: { mediaKeys: true, menuBar: false, fileAssociations: true, autosave: true },
      tips: { hidden: false, step: 1 },
      library: { view: "grid", tileSize: 2, sort: "edited" },
      codeDrawer: { open: null },
    });
  });

  it("should load persisted settings over the defaults on start", async () => {
    // Arrange
    const native = createMockNative();
    await native.settingsStore.save({ appearance: { accent: "orange" }, uiMode: "pro" });
    const stores = createMockStores({ native });
    created.push(stores);

    // Act
    renderWithStores(<SettingsPanel />, { stores, autoStart: true });
    await act(() => vi.advanceTimersByTimeAsync(0));

    // Assert
    expect(screen.getByRole("status", { name: "Accent" })).toHaveTextContent("orange");
    expect(screen.getByRole("status", { name: "Mode" })).toHaveTextContent("pro");
  });

  it("should persist a change after the save debounce", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { stores } = renderWithStores(<SettingsPanel />);
    created.push(stores);
    await act(() => stores.start());

    // Act
    await user.click(screen.getByRole("button", { name: "Pro" }));
    const beforeDebounce = await stores.native.settingsStore.load();
    await act(() => vi.advanceTimersByTimeAsync(300));

    // Assert
    expect(beforeDebounce).toBeNull();
    expect(await stores.native.settingsStore.load()).toEqual(expect.objectContaining({ uiMode: "pro" }));
  });

  it("should open the code drawer by default in Pro and let the user override it", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { stores } = renderWithStores(<SettingsPanel />);
    created.push(stores);
    const guidedDefault = screen.getByRole("status", { name: "Drawer" }).textContent;

    // Act
    await user.click(screen.getByRole("button", { name: "Pro" }));
    const proDefault = screen.getByRole("status", { name: "Drawer" }).textContent;
    await user.click(screen.getByRole("button", { name: "Toggle code" }));

    // Assert
    expect(guidedDefault).toBe("closed");
    expect(proDefault).toBe("open");
    expect(screen.getByRole("status", { name: "Drawer" })).toHaveTextContent("closed");
  });

  it("should configure OSC natively when the setting changes", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const native = createMockNative();
    const oscConfigure = vi.spyOn(native, "oscConfigure");
    const { stores } = renderWithStores(<SettingsPanel />, { native });
    created.push(stores);
    await act(() => stores.start());

    // Act
    await user.click(screen.getByRole("button", { name: "Enable OSC" }));

    // Assert
    expect(oscConfigure).toHaveBeenLastCalledWith({ enabled: true, host: "127.0.0.1", port: 57121 });
  });

  it("should apply the look-ahead to the engine when it changes", async () => {
    // Arrange
    const { stores } = renderWithStores(<SettingsPanel />);
    created.push(stores);
    await act(() => stores.start());
    stores.engineHost.get();

    // Act
    act(() => stores.settings.getState().set("audio", { lookaheadMs: 250 }));

    // Assert
    expect(stores.fakeEngine.getLookahead()).toBe(250);
  });

  it("should sync a change made in another window without saving it again", async () => {
    // Arrange
    const [mainChannel, settingsChannel] = linkedChannels();
    const main = createMockStores({ settingsChannel: mainChannel });
    const settingsWindow = createMockStores({ settingsChannel: settingsChannel });
    created.push(main, settingsWindow);
    const save = vi.spyOn(main.native.settingsStore, "save");
    renderWithStores(<SettingsPanel />, { stores: main });

    // Act
    act(() => settingsWindow.settings.getState().set("appearance", { accent: "purple" }));
    await act(() => vi.advanceTimersByTimeAsync(300));

    // Assert
    expect(screen.getByRole("status", { name: "Accent" })).toHaveTextContent("purple");
    expect(save).not.toHaveBeenCalled();
  });
});
