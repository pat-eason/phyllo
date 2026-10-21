import { findTrack } from "@phyllo/model";
import type { ProjectAction, Track, UiMode } from "@phyllo/model";
import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockStores } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { Inspector } from "./Inspector";
import { MODIFIER_DRAG_MIME } from "./inspectorModel";
import { MOCKUP_BASS, codeTrack, inspectorProject } from "./inspectorFixtures";

interface SetupOptions extends MockStoresOptions {
  selected?: string | null;
  patch?: Partial<Record<string, Partial<Track>>>;
  extra?: Track[];
  mode?: UiMode;
  fakeTimers?: boolean;
}

/** Renders the Inspector over mock stores whose `dispatch` / gesture calls are recorded (they still run). */
function setup(options: SetupOptions = {}) {
  const { selected = "bass", patch, extra, mode = "guided", fakeTimers = false, ...rest } = options;
  const stores = createMockStores({ initialProject: inspectorProject(selected, patch, extra), initialSettings: { uiMode: mode }, ...rest });
  const state = stores.project.getState();
  const dispatch = vi.fn((action: ProjectAction) => state.dispatch(action));
  const beginGesture = vi.fn(state.beginGesture);
  const endGesture = vi.fn(state.endGesture);
  stores.project.setState({ dispatch, beginGesture, endGesture });
  const onEditPattern = vi.fn();
  const view = renderWithStores(<Inspector onEditPattern={onEditPattern} />, { stores });
  const track = (id = selected ?? "bass") => findTrack(stores.project.getState().project, id);
  const actions = () => dispatch.mock.calls.map(([a]) => a);
  const user = userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {});
  return { ...view, stores, beginGesture, endGesture, onEditPattern, track, actions, user };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Inspector", () => {
  it("should ask for a selection when no track is selected", () => {
    // Arrange
    setup({ selected: null });
    // Assert
    expect(screen.getByRole("complementary", { name: "Track inspector" })).toBeInTheDocument();
    expect(screen.getByText("Select a track to shape its sound")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("should show the header, the sound code and six Guided knobs with spoken values", () => {
    // Arrange
    setup();
    // Assert
    expect(screen.getByRole("button", { name: "Bass, rename track" })).toBeInTheDocument();
    expect(screen.getByText("Sawtooth synth")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: 'Sound: s("sawtooth"). Change sound' })).toBeInTheDocument();
    expect(screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"))).toEqual(["Volume", "Brightness", "Space", "Echo", "Pan", "Grit"]);
    const brightness = screen.getByRole("slider", { name: "Brightness" });
    expect(brightness).toHaveAttribute("aria-valuetext", "Brightness 900 Hz");
    expect(brightness.parentElement).toHaveAttribute("data-tip-target", "inspector-knob-lpf");
  });

  it("should open the pattern editor for the track from Edit pattern", async () => {
    // Arrange
    const { onEditPattern, user } = setup();
    // Act
    await user.click(screen.getByRole("button", { name: "Edit pattern" }));
    // Assert
    expect(onEditPattern).toHaveBeenCalledWith("bass");
  });

  it("should show eight code-named knobs and the modifier chain in Pro", () => {
    // Arrange
    setup({ mode: "pro", patch: { bass: MOCKUP_BASS } });
    // Assert
    expect(screen.getAllByRole("slider").map((s) => s.getAttribute("aria-label"))).toEqual(["gain", "lpf", "lpq", "shape", "room", "roomsize", "delay", "pan"]);
    expect(screen.queryByRole("region", { name: "Try one" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Modifiers · applied in order" })).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("slider", { name: "lpf" })).toHaveAttribute("aria-valuetext", "Brightness modulated ~400–1.4k");
  });

  it("should dispatch track/setParam when a knob turns", async () => {
    // Arrange
    const { actions, track, user } = setup();
    screen.getByRole("slider", { name: "Volume" }).focus();
    // Act
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    // Assert
    expect(actions()).toEqual([{ type: "track/setParam", trackId: "bass", param: "gain", value: 0.9 }]);
    expect(track()?.params.gain).toBe(0.9);
  });

  it("should reset a knob to unset on double-click", async () => {
    // Arrange
    const { actions, track, user } = setup();
    // Act
    await user.dblClick(screen.getByRole("slider", { name: "Brightness" }));
    // Assert
    expect(actions()).toEqual([{ type: "track/setParam", trackId: "bass", param: "lpf", value: null }]);
    expect(track()?.params.lpf).toBeUndefined();
  });

  it("should group a knob drag into one gesture", () => {
    // Arrange
    const { beginGesture, endGesture } = setup();
    const space = screen.getByRole("slider", { name: "Space" });
    // Act
    fireEvent.pointerDown(space, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(space, { pointerId: 1, clientY: 80 });
    // Assert
    expect(beginGesture).toHaveBeenCalledTimes(1);
    expect(endGesture).toHaveBeenCalledTimes(1);
  });

  it("should take a typed value in real units after ⌥-click", async () => {
    // Arrange
    const { actions, user } = setup();
    const brightness = screen.getByRole("slider", { name: "Brightness" });
    // Act
    await user.keyboard("{Alt>}");
    await user.click(brightness);
    await user.keyboard("{/Alt}");
    const field = screen.getByRole("textbox", { name: /Brightness \(lpf\) value in Hz/ });
    await user.clear(field);
    await user.type(field, "1.6k{Enter}");
    // Assert
    expect(actions()).toEqual([{ type: "track/setParam", trackId: "bass", param: "lpf", value: 1600 }]);
    expect(brightness).toHaveFocus();
  });

  it("should reject a typed value that isn't a number", async () => {
    // Arrange
    const { actions, user } = setup();
    screen.getByRole("slider", { name: "Space" }).focus();
    // Act
    await user.keyboard("{Enter}");
    const field = screen.getByRole("textbox", { name: /Space \(room\) value/ });
    await user.clear(field);
    await user.type(field, "lots{Enter}");
    // Assert
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(actions()).toEqual([]);
  });

  it("should disable the driving modifier and set the value in one undo step when replacing a modulation", async () => {
    // Arrange
    const sweep = { id: "m-sweep", code: ".lpf(sine.range(400,1400).slow(8))", enabled: true };
    const { actions, track, stores, user } = setup({ patch: { bass: { params: {}, modifiers: [sweep] } } });
    screen.getByRole("slider", { name: "Brightness" }).focus();
    // Act
    await user.keyboard("{Home}");
    // Assert: nothing is written until the confirm says yes
    expect(actions()).toEqual([]);
    expect(screen.getByText(/Replace the modulation with a fixed value\?/)).toBeInTheDocument();
    // Act
    await user.click(screen.getByRole("button", { name: "Replace" }));
    // Assert
    expect(actions()).toEqual([
      { type: "modifier/update", trackId: "bass", modifierId: "m-sweep", patch: { enabled: false } },
      { type: "track/setParam", trackId: "bass", param: "lpf", value: 200 },
    ]);
    act(() => stores.project.getState().undo());
    expect(track()?.modifiers[0]?.enabled).toBe(true);
    expect(track()?.params.lpf).toBeUndefined();
  });

  it("should ask before replacing a modulation when an arrow key can't move the knob any further", async () => {
    // Arrange
    const sweep = { id: "m-sweep", code: ".lpf(sine.range(400,1400).slow(8))", enabled: true };
    const { actions, user } = setup({ patch: { bass: { params: {}, modifiers: [sweep] } } });
    screen.getByRole("slider", { name: "Brightness" }).focus();

    // Act
    await user.keyboard("{ArrowUp}");

    // Assert
    expect(actions()).toEqual([]);
    expect(screen.getByText(/Replace the modulation with a fixed value\?/)).toBeInTheDocument();
  });

  it("should keep the modulation when the confirm is declined", async () => {
    // Arrange
    const { actions, user } = setup({ patch: { bass: { modifiers: [{ id: "m1", code: ".lpf(sine.range(400,1400))", enabled: true }] } } });
    screen.getByRole("slider", { name: "Brightness" }).focus();
    // Act
    await user.keyboard("{End}");
    await user.click(screen.getByRole("button", { name: "Keep modulation" }));
    // Assert
    expect(actions()).toEqual([]);
    expect(screen.queryByText(/Replace the modulation/)).not.toBeInTheDocument();
  });

  it("should show a patterned gain as patterned and replace the pattern only after confirming", async () => {
    // Arrange
    const { actions, user } = setup({ selected: "hats" });
    const volume = screen.getByRole("slider", { name: "Volume" });
    volume.focus();
    // Act
    await user.keyboard("{End}");
    await user.click(screen.getByRole("button", { name: "Replace" }));
    // Assert
    expect(volume).toHaveAttribute("aria-valuetext", "Volume 1");
    expect(actions()).toEqual([{ type: "track/setParam", trackId: "hats", param: "gain", value: 1 }]);
  });

  it("should announce the patterned value on the knob", () => {
    // Arrange
    setup({ selected: "hats" });
    // Assert
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveAttribute("aria-valuetext", "Volume patterned [.4 .7]*4");
  });

  it("should commit a valid pattern ~80 ms after typing pauses, as one undo step", async () => {
    // Arrange
    vi.useFakeTimers();
    const { actions, beginGesture, endGesture, track, user } = setup({ fakeTimers: true });
    const field = screen.getByRole("textbox", { name: "Pattern" });
    // Act
    await user.clear(field);
    await user.type(field, "c2 g2");
    act(() => vi.advanceTimersByTime(100));
    // Assert
    expect(actions().at(-1)).toEqual({ type: "track/setPattern", trackId: "bass", pattern: "c2 g2" });
    expect(track()?.pattern).toBe("c2 g2");
    await user.tab();
    expect(beginGesture).toHaveBeenCalledTimes(1);
    expect(endGesture).toHaveBeenCalledTimes(1);
  });

  it("should keep the last valid pattern and show the parse error while the text is invalid", async () => {
    // Arrange
    const { actions, track, user } = setup();
    const field = screen.getByRole("textbox", { name: "Pattern" });
    // Act
    await user.clear(field);
    await user.type(field, "c2 [[eb2{Enter}");
    // Assert
    expect(screen.getByText(/^Column \d+: `\[` is never closed — add `\]`\. The last valid pattern keeps playing\.$/)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(actions().filter((a) => a.type === "track/setPattern")).toEqual([]);
    expect(track()?.pattern).toBe("<a1 a1 c2 g1>*2");
  });

  it("should not commit a pattern that parses but can't be played", async () => {
    // Arrange
    const { actions, track, user } = setup();
    const field = screen.getByRole("textbox", { name: "Pattern" });

    // Act
    await user.clear(field);
    await user.type(field, "c2*lm{Enter}");

    // Assert
    expect(screen.getByText(/`lm` isn't a number/)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(actions().filter((a) => a.type === "track/setPattern")).toEqual([]);
    expect(track()?.pattern).toBe("<a1 a1 c2 g1>*2");
  });

  it("should commit once the pattern is fixed", async () => {
    // Arrange
    const { actions, user } = setup();
    const field = screen.getByRole("textbox", { name: "Pattern" });
    await user.clear(field);
    await user.type(field, "c2 [[eb2{Enter}");
    // Act
    await user.type(field, "]{Enter}");
    // Assert
    expect(actions().filter((a) => a.type === "track/setPattern").at(-1)).toEqual({ type: "track/setPattern", trackId: "bass", pattern: "c2 [eb2]" });
    expect(screen.queryByText(/Can’t read this pattern/)).not.toBeInTheDocument();
  });

  it("should explain the pattern in Guided mode", () => {
    // Arrange
    setup({ patch: { bass: { pattern: "<c2 eb2 g2 bb1>*2" } } });
    // Assert
    expect(screen.getByText('"< >" picks the next note each time; "*2" makes that happen twice per cycle.')).toBeInTheDocument();
  });

  it("should show the engine's error for this track", () => {
    // Arrange
    const { stores } = setup({ mode: "pro" });
    // Act
    act(() => stores.engine.setState({ trackErrors: { bass: { kind: "runtime", message: "sound sawtoth not found", trackId: "bass" } } }));
    // Assert
    expect(screen.getByText("Strudel couldn’t play this track: sound sawtoth not found")).toBeInTheDocument();
  });

  it("should add a Try one suggestion as a modifier and remove it on a second click", async () => {
    // Arrange
    const { actions, track, user } = setup();
    const bouncier = screen.getByRole("button", { name: "Bouncier .swingBy(1/6, 4)" });
    // Act
    await user.click(bouncier);
    // Assert
    expect(actions().at(-1)).toMatchObject({ type: "modifier/add", trackId: "bass", modifier: { code: ".swingBy(1/6, 4)", label: "Bouncier", origin: "suggestion", enabled: true } });
    expect(bouncier).toHaveAttribute("aria-pressed", "true");
    // Act
    const addedId = track()?.modifiers[0]?.id;
    await user.click(bouncier);
    // Assert
    expect(actions().at(-1)).toEqual({ type: "modifier/remove", trackId: "bass", modifierId: addedId });
    expect(bouncier).toHaveAttribute("aria-pressed", "false");
  });

  it("should switch, reorder and remove modifiers in Pro", async () => {
    // Arrange
    const { actions, user } = setup({ mode: "pro", patch: { bass: MOCKUP_BASS } });
    // Act
    await user.click(screen.getByRole("switch", { name: "Enable .lastOf(4, rev)" }));
    screen.getByRole("button", { name: "Reorder .lastOf(4, rev)" }).focus();
    await user.keyboard("{ArrowUp}");
    await user.click(screen.getByRole("button", { name: "Remove .sometimes(x => x.ply(2))" }));
    // Assert
    expect(actions()).toEqual([
      { type: "modifier/update", trackId: "bass", modifierId: "m-rev", patch: { enabled: true } },
      { type: "modifier/move", trackId: "bass", modifierId: "m-rev", toIndex: 1 },
      { type: "modifier/remove", trackId: "bass", modifierId: "m-ply" },
    ]);
  });

  it("should add a modifier from the function search and return focus to +", async () => {
    // Arrange
    const { actions, user } = setup({ mode: "pro" });
    // Act
    await user.click(screen.getByRole("button", { name: "Add modifier" }));
    const dialog = screen.getByRole("dialog", { name: "Add a modifier" });
    await user.type(within(dialog).getByRole("searchbox", { name: "Search Strudel functions" }), "fast");
    await user.click(within(dialog).getByRole("button", { name: /^\.fast\(2\)/ }));
    // Assert
    expect(actions().at(-1)).toMatchObject({ type: "modifier/add", trackId: "bass", modifier: { code: ".fast(2)", origin: "user" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add modifier" })).toHaveFocus();
  });

  it("should add free text as a modifier with Use as typed", async () => {
    // Arrange
    const { track, user } = setup({ mode: "pro" });
    // Act
    await user.click(screen.getByRole("button", { name: "Add modifier" }));
    await user.type(screen.getByRole("searchbox", { name: "Search Strudel functions" }), ".hurry(2)");
    await user.click(screen.getByRole("button", { name: /Use as typed/ }));
    // Assert
    expect(track()?.modifiers.map((m) => m.code)).toEqual([".hurry(2)"]);
  });

  it("should accept a dropped modifier template", () => {
    // Arrange
    const { track } = setup({ mode: "pro" });
    const list = screen.getByRole("list", { name: "Modifiers · applied in order" });
    const dataTransfer = { types: [MODIFIER_DRAG_MIME], getData: (type: string) => (type === MODIFIER_DRAG_MIME ? ".degradeBy(.3)" : ""), dropEffect: "none" };
    // Act (userEvent can't drive HTML drag and drop)
    fireEvent.dragOver(list, { dataTransfer });
    fireEvent.drop(list, { dataTransfer });
    // Assert
    expect(track()?.modifiers.map((m) => m.code)).toEqual([".degradeBy(.3)"]);
  });

  it("should change a melodic track's sound from the searchable picker", async () => {
    // Arrange
    const { actions, user } = setup();
    // Act
    await user.click(screen.getByRole("button", { name: /Change sound/ }));
    await user.type(within(screen.getByRole("dialog", { name: "Choose a sound" })).getByRole("searchbox"), "square");
    await user.keyboard("{Enter}");
    // Assert
    expect(actions()).toEqual([{ type: "track/setSource", trackId: "bass", source: { sound: "square" } }]);
    expect(screen.getByRole("button", { name: 'Sound: s("square"). Change sound' })).toHaveFocus();
  });

  it("should offer drum machines on drum tracks", async () => {
    // Arrange
    const { actions, user } = setup({ selected: "kick" });
    // Act
    await user.click(screen.getByRole("button", { name: /Change sound/ }));
    await user.click(within(screen.getByRole("dialog", { name: "Choose a drum machine" })).getByRole("button", { name: /^TR-808/ }));
    // Assert
    expect(screen.getByText("Bass drum · TR-808")).toBeInTheDocument();
    expect(actions()).toEqual([{ type: "track/setSource", trackId: "kick", source: { bank: "RolandTR808" } }]);
  });

  it("should offer the linked sample names to a sample track's sound picker", async () => {
    // Arrange
    const { actions, stores, user } = setup({
      selected: "hats",
      patch: { hats: { kind: "sample", source: { type: "s", sound: "hh", bank: null }, pattern: "hh*8" } },
    });
    act(() => stores.samples.setState({ names: ["vox", "kick_dusty"] }));
    await user.click(screen.getByRole("button", { name: /Change sound/ }));

    // Act
    await user.click(within(screen.getByRole("dialog", { name: "Choose a sound" })).getByRole("button", { name: /kick_dusty/ }));

    // Assert
    expect(actions()).toEqual([{ type: "track/setSource", trackId: "hats", source: { sound: "kick_dusty" } }]);
  });

  it("should close the picker on Escape without changing the sound", async () => {
    // Arrange
    const { actions, user } = setup();
    const trigger = screen.getByRole("button", { name: /Change sound/ });
    await user.click(trigger);
    // Act
    await user.keyboard("{Escape}");
    // Assert
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(actions()).toEqual([]);
  });

  it("should rename the track inline", async () => {
    // Arrange
    const { actions, user } = setup();
    // Act
    await user.dblClick(screen.getByRole("button", { name: "Bass, rename track" }));
    const field = screen.getByRole("textbox", { name: "Rename Bass" });
    await user.clear(field);
    await user.type(field, "Sub{Enter}");
    // Assert
    expect(actions()).toEqual([{ type: "track/update", trackId: "bass", patch: { name: "Sub" } }]);
    expect(screen.getByRole("button", { name: "Sub, rename track" })).toHaveFocus();
  });

  it("should show a MIDI CC badge on a mapped knob", () => {
    // Arrange
    setup({ mode: "pro", initialSettings: { uiMode: "pro", midi: { ccMap: { "13": { trackParam: "lpf", cc: 13 } } } } });
    // Assert
    expect(screen.getByText("CC 13")).toHaveAttribute("title", "MIDI CC 13 controls Brightness");
  });

  it("should point code tracks at the code drawer instead of showing knobs", () => {
    // Arrange
    setup({ selected: "pad", extra: [codeTrack()] });
    // Assert
    expect(screen.getByText("Code track — edit in the code drawer")).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit pattern" })).toBeDisabled();
  });

  it("should outline the control the tips card points at", () => {
    // Arrange
    const { stores } = setup();
    // Act
    act(() => stores.tips.setState({ highlight: "inspector-try-one" }));
    // Assert
    expect(screen.getByRole("region", { name: "Try one" })).toHaveAttribute("data-tip-highlight");
    expect(screen.getByRole("slider", { name: "Brightness" }).parentElement).not.toHaveAttribute("data-tip-highlight");
  });
});
