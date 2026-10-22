import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeEngine } from "../../../state/fakeEngine";
import type { MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { CODE_EDITOR_PREFS_KEY } from "./codeEditorPrefs";
import { SettingsLayout } from "./SettingsLayout";
import type { SettingsLayoutProps } from "./SettingsLayout";
import { SAMPLE_FOLDERS, SAMPLE_MIDI_PORTS, createSettingsNative } from "./SettingsLayout.fixtures";
import type { SettingsNativeOptions } from "./SettingsLayout.fixtures";

const SOUND_URLS = ["https://strudel.b-cdn.net/a.wav", "https://strudel.b-cdn.net/b.wav"];

interface RenderOptions {
  native?: SettingsNativeOptions;
  stores?: MockStoresOptions;
  props?: SettingsLayoutProps;
}

function renderSettings(options: RenderOptions = {}) {
  const controls = createSettingsNative(options.native);
  const result = renderWithStores(<SettingsLayout listSoundUrls={async () => SOUND_URLS} {...options.props} />, {
    native: controls.native,
    ...options.stores,
  });
  return { ...result, controls, settings: () => result.stores.settings.getState().settings };
}

const region = (name: string) => within(screen.getByRole("region", { name }));

describe("SettingsLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("should list the eight sections in the nav and as landmarks", () => {
    // Arrange
    renderSettings();

    // Act
    const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));

    // Assert
    const names = ["General", "Appearance", "Audio", "MIDI & OSC", "Sample folders", "Shortcuts", "Code editor", "System"];
    for (const name of names) {
      expect(nav.getByRole("link", { name })).toBeInTheDocument();
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("should highlight General first and the clicked section after a nav click", async () => {
    // Arrange
    const user = userEvent.setup();
    renderSettings();
    const nav = within(screen.getByRole("navigation", { name: "Settings sections" }));
    expect(nav.getByRole("link", { name: "General" })).toHaveAttribute("aria-current", "true");

    // Act
    await user.click(nav.getByRole("link", { name: "Audio" }));

    // Assert
    expect(nav.getByRole("link", { name: "Audio" })).toHaveAttribute("aria-current", "true");
    expect(nav.getByRole("link", { name: "General" })).not.toHaveAttribute("aria-current");
  });

  it("should leave the URL hash alone on a nav click", async () => {
    // Arrange
    const user = userEvent.setup();
    window.location.hash = "#/settings";
    renderSettings();

    // Act
    await user.click(screen.getByRole("link", { name: "MIDI & OSC" }));

    // Assert
    expect(window.location.hash).toBe("#/settings");
  });

  it("should switch the default interface to Pro", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();

    // Act
    await user.click(region("General").getByRole("radio", { name: "Pro" }));

    // Assert
    expect(settings().uiMode).toBe("pro");
  });

  it("should turn tips off and on with the switch", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const tips = region("General").getByRole("switch", { name: "Show tips in Guided mode" });

    // Act
    await user.click(tips);

    // Assert
    expect(settings().tips.hidden).toBe(true);
    expect(tips).not.toBeChecked();
  });

  it("should restart the tips from step one", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings({ stores: { initialSettings: { tips: { step: 4, hidden: true } } } });

    // Act
    await user.click(region("General").getByRole("button", { name: "Restart tips" }));

    // Assert
    expect(settings().tips).toEqual({ step: 1, hidden: false });
  });

  it("should show the projects folder and reveal it in Finder", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings();
    expect(await region("General").findByText("/Phyllo")).toBeInTheDocument();

    // Act
    await user.click(region("General").getByRole("button", { name: "Show in Finder" }));

    // Assert
    expect(controls.revealed).toEqual(["/Phyllo"]);
  });

  it("should offer the look-ahead as a Select and apply the chosen value", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const select = region("Audio").getByRole("combobox", { name: "Scheduling look-ahead" });
    expect(select).toHaveValue("100");

    // Act
    await user.selectOptions(select, "250");

    // Assert
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "50 ms",
      "100 ms (default)",
      "150 ms",
      "250 ms",
    ]);
    expect(settings().audio.lookaheadMs).toBe(250);
  });

  it("should keep a custom saved look-ahead selectable alongside the presets", () => {
    // Arrange
    renderSettings({ stores: { initialSettings: { audio: { lookaheadMs: 120 } } } });

    // Act
    const select = region("Audio").getByRole("combobox", { name: "Scheduling look-ahead" });

    // Assert
    expect(select).toHaveValue("120");
    expect(within(select).getByRole("option", { name: "120 ms" })).toBeInTheDocument();
  });

  it("should disable the output device Select and say why when the web view can't switch devices", async () => {
    // Arrange
    renderSettings();

    // Act
    const select = region("Audio").getByRole("combobox", { name: "Output device" });

    // Assert
    expect(select).toBeDisabled();
    expect(await region("Audio").findByText(/can’t switch output devices/i)).toBeInTheDocument();
  });

  it("should list the engine's devices and save the chosen one", async () => {
    // Arrange
    vi.stubGlobal("AudioContext", class FakeAudioContext { setSinkId() {} });
    const user = userEvent.setup();
    const engine = Object.assign(createFakeEngine({ ready: true }), {
      listOutputDevices: async () => [
        { id: "default", label: "Default" },
        { id: "dac", label: "Scarlett 2i2 USB" },
      ],
    });
    const { settings } = renderSettings({ stores: { engine } });
    const select = region("Audio").getByRole("combobox", { name: "Output device" });
    await waitFor(() => expect(select).toBeEnabled());

    // Act
    await user.selectOptions(select, "Scarlett 2i2 USB");

    // Assert
    expect(settings().audio.outputDevice).toBe("dac");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual(["System default", "Scarlett 2i2 USB"]);
  });

  it("should go back to the system default when System default is chosen", async () => {
    // Arrange
    vi.stubGlobal("AudioContext", class FakeAudioContext { setSinkId() {} });
    const user = userEvent.setup();
    const engine = Object.assign(createFakeEngine({ ready: true }), {
      listOutputDevices: async () => [{ id: "dac", label: "Scarlett 2i2 USB" }],
    });
    const { settings } = renderSettings({ stores: { engine, initialSettings: { audio: { outputDevice: "dac" } } } });
    const select = region("Audio").getByRole("combobox", { name: "Output device" });
    await waitFor(() => expect(select).toBeEnabled());

    // Act
    await user.selectOptions(select, "System default");

    // Assert
    expect(settings().audio.outputDevice).toBeNull();
  });

  it("should save a sample rate choice and return to matching the device", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const select = region("Audio").getByRole("combobox", { name: "Sample rate" });

    // Act
    await user.selectOptions(select, "44.1 kHz");
    const chosen = settings().audio.sampleRate;
    await user.selectOptions(select, "Match device");

    // Assert
    expect(chosen).toBe(44100);
    expect(settings().audio.sampleRate).toBeNull();
  });

  it("should say a sample rate that differs from the running engine applies after restart", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderSettings();
    stores.engineHost.get();
    const select = region("Audio").getByRole("combobox", { name: "Sample rate" });

    // Act
    await user.selectOptions(select, "44.1 kHz");

    // Assert
    expect(await region("Audio").findByText("Applies after restart. Exports can resample.")).toBeInTheDocument();
  });

  it("should not warn when the chosen rate is the one the engine runs at", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderSettings();
    stores.engineHost.get();
    const select = region("Audio").getByRole("combobox", { name: "Sample rate" });

    // Act
    await user.selectOptions(select, "48 kHz");

    // Assert
    expect(region("Audio").queryByText(/Applies after restart/)).not.toBeInTheDocument();
  });

  it("should prefetch the built-in sounds and follow the progress", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings();

    // Act
    await user.click(region("Audio").getByRole("button", { name: "Download built-in sounds for offline use" }));
    await waitFor(() => expect(controls.prefetchCalls).toHaveLength(1));
    act(() => controls.emitProgress({ done: 1, total: 2, failed: 0 }));

    // Assert
    expect(controls.prefetchCalls[0]).toEqual(SOUND_URLS);
    const bar = await region("Audio").findByRole("progressbar", { name: "Offline sound download" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemax", "2");
  });

  it("should report the result when the download finishes and show the cache size", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings();
    await user.click(region("Audio").getByRole("button", { name: "Download built-in sounds for offline use" }));
    await waitFor(() => expect(controls.prefetchCalls).toHaveLength(1));

    // Act
    await act(async () => controls.finishPrefetch({ done: 2, total: 2, failed: 0 }));

    // Assert
    expect(await region("Audio").findByText("Done. 2 files are ready offline.")).toBeInTheDocument();
    expect(await region("Audio").findByText(/2 files · 82 KB on disk/)).toBeInTheDocument();
  });

  it("should mention failed downloads", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings();
    await user.click(region("Audio").getByRole("button", { name: "Download built-in sounds for offline use" }));
    await waitFor(() => expect(controls.prefetchCalls).toHaveLength(1));

    // Act
    await act(async () => controls.finishPrefetch({ done: 2, total: 2, failed: 1 }));

    // Assert
    expect(await region("Audio").findByText(/1 of 2 couldn’t be downloaded/)).toBeInTheDocument();
  });

  it("should show an error when the sound list can't be read", async () => {
    // Arrange
    const user = userEvent.setup();
    const failing = vi.fn().mockRejectedValue(new Error("offline"));
    renderSettings({ props: { listSoundUrls: failing } });

    // Act
    await user.click(region("Audio").getByRole("button", { name: "Download built-in sounds for offline use" }));

    // Assert
    expect(await region("Audio").findByRole("alert")).toHaveTextContent("offline");
  });

  it("should clear the cache", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings({ native: { cacheStatus: { files: 1480, bytes: 60_680_000 } } });
    const clear = region("Audio").getByRole("button", { name: "Clear cache" });
    await waitFor(() => expect(clear).toBeEnabled());

    // Act
    await user.click(clear);

    // Assert
    expect(controls.cleared.count).toBe(1);
    expect(await region("Audio").findByText(/Nothing downloaded yet/)).toBeInTheDocument();
  });

  it("should list MIDI ports with direction and a code hint", async () => {
    // Arrange
    renderSettings();

    // Act
    const table = region("MIDI & OSC");

    // Assert
    expect(await table.findByText("KeyStep 37")).toBeInTheDocument();
    expect(table.getByText('.midi("IAC Driver Bus 1")')).toBeInTheDocument();
    expect(table.getAllByText("notes → note() on the selected track")).toHaveLength(2);
    expect(table.getByRole("columnheader", { name: "Direction" })).toBeInTheDocument();
  });

  it("should enable and disable a MIDI port with its switch", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const toggle = await region("MIDI & OSC").findByRole("switch", { name: "Enable KeyStep 37 (in)" });

    // Act
    await user.click(toggle);
    const enabled = settings().midi.enabledPorts;
    await user.click(toggle);

    // Assert
    expect(enabled).toEqual([SAMPLE_MIDI_PORTS[0]?.id]);
    expect(settings().midi.enabledPorts).toEqual([]);
  });

  it("should add a port to the table when one is plugged in", async () => {
    // Arrange
    const { controls } = renderSettings({ native: { ports: [] } });
    expect(await region("MIDI & OSC").findByText(/No MIDI devices found/)).toBeInTheDocument();

    // Act
    act(() => controls.plug([{ id: "in:Minilab:0", name: "Minilab", direction: "in" }]));

    // Assert
    expect(await region("MIDI & OSC").findByRole("switch", { name: "Enable Minilab (in)" })).toBeInTheDocument();
    expect(region("MIDI & OSC").queryByText(/No MIDI devices found/)).not.toBeInTheDocument();
  });

  it("should re-read the port list on Rescan devices", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings({ native: { ports: [] } });
    expect(await region("MIDI & OSC").findByText(/No MIDI devices found/)).toBeInTheDocument();
    controls.native.midiRescan = async () => [{ id: "out:Bus:0", name: "Bus", direction: "out" }];

    // Act
    await user.click(region("MIDI & OSC").getByRole("button", { name: "Rescan devices" }));

    // Assert
    expect(await region("MIDI & OSC").findByRole("switch", { name: "Enable Bus (out)" })).toBeInTheDocument();
  });

  it("should map eight knobs to CC 13 to 20 and clear the mapping", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();

    // Act
    await user.click(region("MIDI & OSC").getByRole("button", { name: "Map 8 knobs to the inspector (CC 13–20)" }));
    const mapped = Object.values(settings().midi.ccMap).map((entry) => `${entry.cc}:${entry.trackParam}`);
    await user.click(region("MIDI & OSC").getByRole("button", { name: "Clear" }));

    // Assert
    expect(mapped).toEqual(["13:gain", "14:lpf", "15:lpq", "16:shape", "17:room", "18:roomsize", "19:delay", "20:pan"]);
    expect(settings().midi.ccMap).toEqual({});
  });

  it("should list the mapped CCs after mapping", async () => {
    // Arrange
    const user = userEvent.setup();
    renderSettings();

    // Act
    await user.click(region("MIDI & OSC").getByRole("button", { name: "Map 8 knobs to the inspector (CC 13–20)" }));

    // Assert
    const list = region("MIDI & OSC").getByRole("list", { name: "Current CC mapping" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(within(list).getByText("CC 14 → lpf")).toBeInTheDocument();
  });

  it("should keep SuperDirt OSC off until its switch is turned on", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const toggle = region("MIDI & OSC").getByRole("switch", { name: "Enable SuperDirt OSC" });
    expect(toggle).not.toBeChecked();

    // Act
    await user.click(toggle);

    // Assert
    expect(settings().osc.enabled).toBe(true);
  });

  it("should save the OSC host and port when the fields lose focus", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const host = region("MIDI & OSC").getByRole("textbox", { name: "OSC host" });
    const port = region("MIDI & OSC").getByRole("textbox", { name: "OSC port" });

    // Act
    await user.clear(host);
    await user.type(host, "192.168.1.20");
    await user.clear(port);
    await user.type(port, "57121");
    await user.tab();

    // Assert
    expect(settings().osc).toMatchObject({ host: "192.168.1.20", port: 57121 });
  });

  it("should refuse an invalid OSC port and show the saved one again", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();
    const port = region("MIDI & OSC").getByRole("textbox", { name: "OSC port" });

    // Act
    await user.clear(port);
    await user.type(port, "99999");
    await user.tab();

    // Assert
    expect(settings().osc.port).toBe(57120);
    expect(port).toHaveValue("57120");
  });

  it("should show linked folders with their file counts and a Watching status", async () => {
    // Arrange
    const folders = Object.keys(SAMPLE_FOLDERS);

    // Act
    renderSettings({ stores: { initialSettings: { sampleFolders: folders } } });

    // Assert
    const library = region("Sample folders");
    expect(await library.findByText("312 files")).toBeInTheDocument();
    expect(await library.findByText("1,204 files")).toBeInTheDocument();
    expect(library.getAllByText("Watching")).toHaveLength(2);
  });

  it("should flag a folder that can't be scanned", async () => {
    // Arrange
    renderSettings({
      native: { folders: { "/Volumes/Gone": null } },
      stores: { initialSettings: { sampleFolders: ["/Volumes/Gone"] } },
    });

    // Act
    const status = await region("Sample folders").findByText("Not found");

    // Assert
    expect(status).toBeInTheDocument();
    expect(region("Sample folders").queryByText("Watching")).not.toBeInTheDocument();
  });

  it("should link the folder chosen in the native dialog", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings({ native: { pickedFolder: "/Users/pat/Loops" } });

    // Act
    await user.click(region("Sample folders").getByRole("button", { name: "Link a folder…" }));

    // Assert
    await waitFor(() => expect(settings().sampleFolders).toEqual(["/Users/pat/Loops"]));
  });

  it("should not link anything when the dialog is cancelled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings({ native: { pickedFolder: null } });

    // Act
    await user.click(region("Sample folders").getByRole("button", { name: "Link a folder…" }));

    // Assert
    expect(settings().sampleFolders).toEqual([]);
  });

  it("should unlink a folder", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings({ stores: { initialSettings: { sampleFolders: ["/Users/pat/Music/Samples"] } } });

    // Act
    await user.click(await region("Sample folders").findByRole("button", { name: "Unlink" }));

    // Assert
    expect(settings().sampleFolders).toEqual([]);
  });

  it("should reveal a linked folder in Finder", async () => {
    // Arrange
    const user = userEvent.setup();
    const { controls } = renderSettings({ stores: { initialSettings: { sampleFolders: ["/Users/pat/Music/Samples"] } } });

    // Act
    await user.click(await region("Sample folders").findByRole("button", { name: "Show in Finder" }));

    // Assert
    expect(controls.revealed).toEqual(["/Users/pat/Music/Samples"]);
  });

  it("should list the shortcuts in grouped tables with key glyphs", () => {
    // Arrange
    renderSettings();

    // Act
    const shortcuts = region("Shortcuts");

    // Assert
    expect(shortcuts.getByRole("table", { name: "Transport" })).toBeInTheDocument();
    const exportRow = shortcuts.getByRole("row", { name: /Export/ });
    expect(within(exportRow).getByText("⌘E")).toBeInTheDocument();
  });

  it("should keep the code font size in localStorage within 12 to 16", async () => {
    // Arrange
    const user = userEvent.setup();
    renderSettings();
    const slider = region("Code editor").getByRole("slider", { name: "Font size" });
    slider.focus();

    // Act
    await user.keyboard("{End}{ArrowRight}");

    // Assert
    expect(JSON.parse(window.localStorage.getItem(CODE_EDITOR_PREFS_KEY) ?? "{}")).toMatchObject({ fontSize: 16 });
    expect(region("Code editor").getByText("16 px")).toBeInTheDocument();
  });

  it("should keep line numbers on or off in localStorage", async () => {
    // Arrange
    const user = userEvent.setup();
    renderSettings();
    const toggle = region("Code editor").getByRole("switch", { name: "Show line numbers" });
    expect(toggle).toBeChecked();

    // Act
    await user.click(toggle);

    // Assert
    expect(toggle).not.toBeChecked();
    expect(JSON.parse(window.localStorage.getItem(CODE_EDITOR_PREFS_KEY) ?? "{}")).toMatchObject({ lineNumbers: false });
  });

  it("should start the system switches at their defaults", () => {
    // Arrange
    renderSettings();

    // Act
    const system = region("System");

    // Assert
    expect(system.getByRole("switch", { name: "Media keys control playback" })).toBeChecked();
    expect(system.getByRole("switch", { name: "Keep playing from the menu bar" })).not.toBeChecked();
    expect(system.getByRole("switch", { name: "Open .phyllo and .strudel files with Phyllo" })).toBeChecked();
    expect(system.getByRole("switch", { name: "Autosave and version history" })).toBeChecked();
  });

  it("should save a system switch change", async () => {
    // Arrange
    const user = userEvent.setup();
    const { settings } = renderSettings();

    // Act
    await user.click(region("System").getByRole("switch", { name: "Keep playing from the menu bar" }));

    // Assert
    expect(settings().system).toEqual({ mediaKeys: true, menuBar: true, fileAssociations: true, autosave: true, reopenLastProject: false });
  });

  it("should call onOpenHistory from Open version history", async () => {
    // Arrange
    const user = userEvent.setup();
    const onOpenHistory = vi.fn();
    renderSettings({ props: { onOpenHistory } });

    // Act
    await user.click(region("System").getByRole("button", { name: "Open version history…" }));

    // Assert
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("should disable Open version history when no handler is given", () => {
    // Arrange
    renderSettings();

    // Act
    const button = region("System").getByRole("button", { name: "Open version history…" });

    // Assert
    expect(button).toBeDisabled();
  });
});
