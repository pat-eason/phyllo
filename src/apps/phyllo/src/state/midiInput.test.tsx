import { createTrack, findTrack } from "@phyllo/model";
import type { Settings } from "@phyllo/model";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMidiInput } from "../hooks";
import type { MidiPortInfo } from "../native/types";
import { AUDIO_HINT, previewForNote } from "./midiInput";
import { createMockStores, fixtureProject } from "./mocks";
import type { MockStores } from "./mocks";
import { IAC_OUT, KEYSTEP, LAUNCH_CONTROL, observedEngine, withFakeMidi } from "./nativeInputs.testkit";
import { renderWithStores } from "./testUtils";

const QUICK_MAP: Settings["midi"]["ccMap"] = {
  "13": { trackParam: "gain", cc: 13 },
  "14": { trackParam: "lpf", cc: 14 },
};

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

interface SetupOptions {
  ports?: MidiPortInfo[];
  enabled?: string[];
  selected?: string | null;
  ready?: boolean;
}

async function setup({ ports = [KEYSTEP, LAUNCH_CONTROL, IAC_OUT], enabled = [KEYSTEP.id, LAUNCH_CONTROL.id], selected = "kick", ready = true }: SetupOptions = {}) {
  const midi = withFakeMidi(ports);
  const observed = observedEngine({ ready });
  const project = fixtureProject();
  stores = createMockStores({
    native: midi.native,
    engine: observed.engine,
    initialProject: { ...project, ui: { ...project.ui, selectedTrack: selected } },
    initialSettings: { midi: { enabledPorts: enabled, ccMap: QUICK_MAP } },
  });
  await stores.start();
  return { stores, midi, observed };
}

const bass = (s: MockStores) => findTrack(s.project.getState().project, "bass");

function Hint() {
  const { hint, dismissHint } = useMidiInput();
  if (!hint) return null;
  return (
    <p role="status">
      {hint}
      <button type="button" onClick={dismissHint}>
        Dismiss
      </button>
    </p>
  );
}

describe("midiInput", () => {
  it("should open only the enabled input ports", async () => {
    // Act
    const { stores: s, midi } = await setup({ enabled: [KEYSTEP.id, IAC_OUT.id] });

    // Assert
    expect([...midi.openInputs]).toEqual([KEYSTEP.id]);
    expect(s.midiInput.getState().openPorts).toEqual([KEYSTEP.id]);
  });

  it("should not touch MIDI at all while no input is enabled", async () => {
    // Act
    const { midi } = await setup({ enabled: [] });

    // Assert
    expect(midi.listCalls).toBe(0);
    expect(midi.openInputs.size).toBe(0);
  });

  it("should open a newly enabled input and close a disabled one", async () => {
    // Arrange
    const { stores: s, midi } = await setup({ enabled: [KEYSTEP.id] });

    // Act
    act(() => s.settings.getState().set("midi", { enabledPorts: [LAUNCH_CONTROL.id] }));

    // Assert
    await vi.waitFor(() => expect([...midi.openInputs]).toEqual([LAUNCH_CONTROL.id]));
    expect(s.midiInput.getState().openPorts).toEqual([LAUNCH_CONTROL.id]);
  });

  it("should re-open an enabled input when it is plugged back in", async () => {
    // Arrange
    const { stores: s, midi } = await setup({ enabled: [KEYSTEP.id] });
    midi.setPorts([IAC_OUT]);
    await vi.waitFor(() => expect(s.midiInput.getState().openPorts).toEqual([]));

    // Act
    midi.setPorts([KEYSTEP, IAC_OUT]);

    // Assert
    await vi.waitFor(() => expect(s.midiInput.getState().openPorts).toEqual([KEYSTEP.id]));
    expect([...midi.openInputs]).toEqual([KEYSTEP.id]);
  });

  it("should play the selected drum track's kit sound for a GM drum note with velocity as gain", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup({ selected: "kick" });
    s.engineHost.get();

    // Act
    midi.noteOn(KEYSTEP.id, 38, 127);

    // Assert
    expect(observed.previews).toEqual([{ s: "sd", bank: "RolandTR909", gain: 1 }]);
  });

  it("should play the selected melodic track's instrument at the played pitch", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup({ selected: "bass" });
    s.engineHost.get();

    // Act
    midi.noteOn(KEYSTEP.id, 45, 64);

    // Assert
    expect(observed.previews).toEqual([{ s: "sawtooth", note: 45, gain: 0.5 }]);
  });

  it("should stay silent when no track is selected", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup({ selected: null });
    s.engineHost.get();

    // Act
    midi.noteOn(KEYSTEP.id, 60);

    // Assert
    expect(observed.previews).toEqual([]);
  });

  it("should ignore notes from an input that is not enabled", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup({ enabled: [KEYSTEP.id] });
    s.engineHost.get();
    await midi.native.midiOpenInput(LAUNCH_CONTROL.id); // open elsewhere, but not enabled here

    // Act
    midi.noteOn(LAUNCH_CONTROL.id, 36);

    // Assert
    expect(observed.previews).toEqual([]);
  });

  it("should ignore notes and show a dismissable hint once while audio is not started", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores: s, midi, observed } = await setup({ ready: false });
    renderWithStores(<Hint />, { stores: s });

    // Act
    act(() => midi.noteOn(KEYSTEP.id, 36));
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    act(() => midi.noteOn(KEYSTEP.id, 36));

    // Assert
    expect(observed.previews).toEqual([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should show the start-audio hint text", async () => {
    // Arrange
    const { stores: s, midi } = await setup({ ready: false });
    renderWithStores(<Hint />, { stores: s });

    // Act
    act(() => midi.noteOn(KEYSTEP.id, 36));

    // Assert
    expect(await screen.findByRole("status")).toHaveTextContent(AUDIO_HINT);
  });

  it("should set the mapped knob on the selected track from a CC", async () => {
    // Arrange
    const { stores: s, midi } = await setup({ selected: "bass" });

    // Act
    midi.cc(LAUNCH_CONTROL.id, 14, 127);

    // Assert
    expect(bass(s)?.params.lpf).toBe(8000);
  });

  it("should ignore a CC that is not in the map", async () => {
    // Arrange
    const { stores: s, midi } = await setup({ selected: "bass" });

    // Act
    midi.cc(LAUNCH_CONTROL.id, 99, 0);

    // Assert
    expect(bass(s)?.params).toEqual({ lpf: 900 });
    expect(s.project.getState().canUndo).toBe(false);
  });

  it("should write a fast CC sweep at most once per 33 ms and end on its last value", async () => {
    // Arrange
    vi.useFakeTimers();
    const { stores: s, midi } = await setup({ selected: "bass" });
    const seen: unknown[] = [];
    const off = s.project.subscribe((state, prev) => {
      const now = findTrack(state.project, "bass")?.params.lpf;
      if (now !== findTrack(prev.project, "bass")?.params.lpf) seen.push(now);
    });

    // Act: 10 values over 30 ms
    for (let i = 0; i < 10; i++) {
      midi.cc(LAUNCH_CONTROL.id, 14, 100 + i);
      vi.advanceTimersByTime(3);
    }
    vi.advanceTimersByTime(400);
    off();

    // Assert
    expect(seen).toEqual([5036, 5946]); // CC 100 at once, then the latest (109) on the 33 ms tick
  });

  it("should undo a whole CC burst in one step", async () => {
    // Arrange
    vi.useFakeTimers();
    const { stores: s, midi } = await setup({ selected: "bass" });
    for (const value of [10, 40, 80, 127]) {
      midi.cc(LAUNCH_CONTROL.id, 14, value);
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(300);

    // Act
    act(() => s.project.getState().undo());

    // Assert
    expect(bass(s)?.params.lpf).toBe(900);
    expect(s.project.getState().canUndo).toBe(false);
  });

  it("should start a new undo step after 300 ms without CCs", async () => {
    // Arrange
    vi.useFakeTimers();
    const { stores: s, midi } = await setup({ selected: "bass" });
    midi.cc(LAUNCH_CONTROL.id, 14, 127);
    vi.advanceTimersByTime(301);
    midi.cc(LAUNCH_CONTROL.id, 14, 0);
    vi.advanceTimersByTime(301);

    // Act
    act(() => s.project.getState().undo());

    // Assert
    expect(bass(s)?.params.lpf).toBe(8000);
  });

  it("should map a played note onto each track kind's sound", () => {
    // Arrange
    const kick = createTrack("drum", { source: { bank: "RolandTR909" } });
    const lead = createTrack("chord", { source: { sound: "gm_epiano1" } });
    const sample = createTrack("sample", { pattern: "<vox ~> ~" });
    const code = createTrack("code");

    // Act
    const sounds = [
      previewForNote(kick, 42, 127),
      previewForNote(kick, 20, 127),
      previewForNote(lead, 60, 127),
      previewForNote(sample, 60, 127),
      previewForNote(code, 60, 127),
    ];

    // Assert
    expect(sounds).toEqual([
      { s: "hh", bank: "RolandTR909", gain: 1 },
      null,
      { s: "gm_epiano1", note: 60, gain: 1 },
      { s: "vox", gain: 1 },
      null,
    ]);
  });
});
