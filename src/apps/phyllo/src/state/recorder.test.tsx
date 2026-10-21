import { createTrack, findTrack } from "@phyllo/model";
import type { Track } from "@phyllo/model";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useRecorder } from "../hooks";
import { createMockStores, fixtureProject } from "./mocks";
import type { MockStores } from "./mocks";
import { KEYSTEP, observedEngine, withFakeMidi } from "./nativeInputs.testkit";
import type { FakeMidiNative, ObservedEngine } from "./nativeInputs.testkit";
import { foldCycles, quantizeTake, takeToPattern } from "./recorder";
import type { RecordedNote } from "./recorder";
import { renderWithStores } from "./testUtils";

const NO_LOOP = { enabled: false, startBar: 1, endBar: 1 };
const drums = (): Track => createTrack("drum", { id: "drums" });
const keys = (): Track => createTrack("melodic", { id: "keys", source: { sound: "gm_epiano1" } });

/** `[cycle, note]` pairs → recorded notes at velocity 100. */
const notes = (...hits: [number, number][]): RecordedNote[] => hits.map(([cycle, note]) => ({ cycle, note, velocity: 100 }));

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

async function setup(selected: string | null = "kick") {
  const midi = withFakeMidi([KEYSTEP]);
  const observed = observedEngine();
  const project = fixtureProject();
  stores = createMockStores({
    native: midi.native,
    engine: observed.engine,
    initialProject: { ...project, ui: { ...project.ui, selectedTrack: selected } },
    initialSettings: { midi: { enabledPorts: [KEYSTEP.id], ccMap: {} } },
  });
  await stores.start();
  return { stores, midi, observed };
}

/** Plays each `[cycle, note]` as a note-on while the engine reports that cycle. */
function playAt(midi: FakeMidiNative, observed: ObservedEngine, hits: [number, number][]) {
  for (const [cycle, note] of hits) {
    observed.setCycle(cycle);
    midi.noteOn(KEYSTEP.id, note);
  }
}

const pattern = (s: MockStores, id: string) => findTrack(s.project.getState().project, id)?.pattern;

function RecordButton() {
  const { armed, recording, arm, lastTake } = useRecorder();
  return (
    <div>
      <button type="button" aria-pressed={armed} onClick={() => arm(!armed)}>
        Record
      </button>
      <p>{recording ? "Recording" : "Idle"}</p>
      {lastTake && <p>Last take: {lastTake.status}</p>}
    </div>
  );
}

describe("recorder", () => {
  it("should snap each note to the nearest 16th of its cycle", () => {
    // Act
    const take = quantizeTake(notes([0.03, 36], [0.27, 38], [1.49, 42]));

    // Assert
    expect(take).toEqual(
      new Map([
        [0, new Map([[0, [36]], [4, [38]]])],
        [1, new Map([[8, [42]]])],
      ]),
    );
  });

  it("should fold a late downbeat at the loop end back onto the loop start", () => {
    // Act
    const take = quantizeTake(notes([15.99, 36]), { enabled: true, startBar: 9, endBar: 16 });

    // Assert
    expect(take).toEqual(new Map([[8, new Map([[0, [36]]])]]));
  });

  it("should write GM drum notes as step layers, kick first", () => {
    // Act
    const result = takeToPattern(notes([0, 36], [0.25, 39], [0.5, 36], [0.75, 39], [0.25, 36], [0.75, 36]), drums(), NO_LOOP);

    // Assert
    expect(result).toEqual({ pattern: "bd*4, [~ cp]*2", bars: 1 });
  });

  it("should write melodic notes as note names with simultaneous notes stacked", () => {
    // Act
    const result = takeToPattern(notes([0, 48], [0.25, 51], [0.5, 55], [0.5, 58], [0.75, 60]), keys(), NO_LOOP);

    // Assert
    expect(result).toEqual({ pattern: "c3 eb3 [g3,bb3] c4", bars: 1 });
  });

  it("should fold several cycles into an alternation that lines up with the song cycles", () => {
    // Act: cycle 9 holds c3, cycle 10 holds d3; <a b> plays a on even cycles
    const result = takeToPattern(notes([9, 48], [10, 50], [10.5, 52]), keys(), NO_LOOP);

    // Assert
    expect(result).toEqual({ pattern: "<[d3 e3] c3>", bars: 2 });
  });

  it("should keep an empty cycle inside the take as a rest", () => {
    // Act
    const result = foldCycles(
      new Map([
        [0, "c3"],
        [1, ""],
        [2, "e3"],
      ]),
    );

    // Assert
    expect(result).toEqual({ pattern: "<c3 ~ e3>", bars: 3 });
  });

  it("should bracket layered drum cycles inside an alternation", () => {
    // Act
    const result = takeToPattern(notes([0, 36], [0.5, 36], [0, 42], [0.5, 42], [1, 36]), drums(), NO_LOOP);

    // Assert
    expect(result).toEqual({ pattern: "<[bd*2, hh*2] bd>", bars: 2 });
  });

  it("should not write anything a code track or unmapped drum notes can't represent", () => {
    // Act
    const results = [takeToPattern(notes([0, 60]), createTrack("code"), NO_LOOP), takeToPattern(notes([0, 20]), drums(), NO_LOOP)];

    // Assert
    expect(results).toEqual([null, null]);
  });

  it("should write the take onto the selected track when playback stops", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup("kick");
    act(() => s.recorder.getState().arm(true));
    await act(() => s.transport.getState().play());
    playAt(midi, observed, [
      [8, 36],
      [8.26, 38],
      [8.5, 36],
      [8.74, 38],
    ]);

    // Act
    act(() => s.transport.getState().stop());

    // Assert
    expect(pattern(s, "kick")).toBe("bd*2, [~ sd]*2");
    expect(s.recorder.getState().lastTake).toMatchObject({ status: "written", trackId: "kick", pattern: "bd*2, [~ sd]*2", noteCount: 4, bars: 1 });
  });

  it("should undo a recorded take in one step", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup("kick");
    act(() => s.recorder.getState().arm(true));
    await act(() => s.transport.getState().play());
    playAt(midi, observed, [[8, 38]]);
    act(() => s.transport.getState().stop());

    // Act
    act(() => s.project.getState().undo());

    // Assert
    expect(pattern(s, "kick")).toBe("bd*4");
    expect(s.project.getState().canUndo).toBe(false);
  });

  it("should turn a chord track into a note track when recording onto it", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup("pads");
    act(() => {
      s.project.getState().dispatch({ type: "track/add", track: createTrack("chord", { id: "pads" }) });
      s.project.getState().dispatch({ type: "ui/select", trackId: "pads" });
    });
    act(() => s.recorder.getState().arm(true));
    await act(() => s.transport.getState().play());
    playAt(midi, observed, [
      [0, 48],
      [0, 52],
      [0, 55],
    ]);

    // Act
    act(() => s.transport.getState().pause());

    // Assert
    const pads = findTrack(s.project.getState().project, "pads");
    expect(pads).toMatchObject({ kind: "melodic", pattern: "[c3,e3,g3]", source: { type: "note", sound: "gm_epiano1" } });
  });

  it("should capture nothing while the transport is not armed", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup("kick");
    await act(() => s.transport.getState().play());
    playAt(midi, observed, [[8, 38]]);

    // Act
    act(() => s.transport.getState().stop());

    // Assert
    expect(pattern(s, "kick")).toBe("bd*4");
    expect(s.recorder.getState().lastTake).toBeNull();
  });

  it("should leave the project alone and report it when no track is selected", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup(null);
    act(() => s.recorder.getState().arm(true));
    await act(() => s.transport.getState().play());
    playAt(midi, observed, [[8, 38]]);

    // Act
    act(() => s.transport.getState().stop());

    // Assert
    expect(s.project.getState().canUndo).toBe(false);
    expect(s.recorder.getState().lastTake).toMatchObject({ status: "noTrack", trackId: null, noteCount: 1 });
  });

  it("should report an empty take without touching the track", async () => {
    // Arrange
    const { stores: s } = await setup("kick");
    act(() => s.recorder.getState().arm(true));
    await act(() => s.transport.getState().play());

    // Act
    act(() => s.transport.getState().stop());

    // Assert
    expect(pattern(s, "kick")).toBe("bd*4");
    expect(s.recorder.getState().lastTake).toMatchObject({ status: "empty", trackId: "kick" });
  });

  it("should arm through useRecorder and show recording while playing", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores: s } = await setup("kick");
    renderWithStores(<RecordButton />, { stores: s });

    // Act
    await user.click(screen.getByRole("button", { name: "Record" }));
    await act(() => s.transport.getState().play());

    // Assert
    expect(screen.getByRole("button", { name: "Record" })).toHaveAttribute("aria-pressed", "true");
    expect(s.transport.getState().recordArmed).toBe(true);
    expect(screen.getByText("Recording")).toBeInTheDocument();
  });

  it("should end the take when the arm is released during playback", async () => {
    // Arrange
    const { stores: s, midi, observed } = await setup("kick");
    act(() => s.recorder.getState().arm(true));
    await act(() => s.transport.getState().play());
    playAt(midi, observed, [[8.5, 39]]);

    // Act
    act(() => s.recorder.getState().arm(false));

    // Assert
    expect(pattern(s, "kick")).toBe("~ cp");
    expect(s.transport.getState().playing).toBe(true);
    expect(s.recorder.getState().recording).toBe(false);
  });
});
