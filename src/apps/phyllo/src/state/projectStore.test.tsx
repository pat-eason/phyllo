import { serializeProject } from "@phyllo/model";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useProject, useProjectFile, useSelection } from "../hooks";
import { fixtureProject } from "./mocks";
import type { MockStores } from "./mocks";
import { renderWithStores } from "./testUtils";

/** A knob stand-in: a drag is begin → several changes → end. */
function GainKnob() {
  const { project, dispatch, beginGesture, endGesture, undo, redo, canUndo } = useProject();
  const kick = project.tracks.find((t) => t.id === "kick");
  const drag = () => {
    beginGesture();
    for (const value of [0.5, 0.6, 0.7]) dispatch({ type: "track/setParam", trackId: "kick", param: "gain", value });
    endGesture();
  };
  return (
    <div>
      <output aria-label="Kick gain">{String(kick?.params.gain ?? "default")}</output>
      <button type="button" onClick={drag}>
        Drag gain
      </button>
      <button type="button" onClick={undo} disabled={!canUndo}>
        Undo
      </button>
      <button type="button" onClick={redo}>
        Redo
      </button>
    </div>
  );
}

function FileStatus() {
  const { dirty, filePath, save } = useProjectFile();
  const { select } = useSelection();
  const { dispatch } = useProject();
  return (
    <div>
      <output aria-label="Dirty">{dirty ? "dirty" : "clean"}</output>
      <output aria-label="Path">{filePath ?? "unsaved"}</output>
      <button type="button" onClick={() => select("bass")}>
        Select bass
      </button>
      <button type="button" onClick={() => dispatch({ type: "track/setMute", trackId: "kick", mute: true })}>
        Mute kick
      </button>
      <button type="button" onClick={() => void save()}>
        Save
      </button>
    </div>
  );
}

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

describe("projectStore", () => {
  it("should undo a whole knob drag in one step", async () => {
    // Arrange
    const user = userEvent.setup();
    ({ stores } = renderWithStores(<GainKnob />));

    // Act
    await user.click(screen.getByRole("button", { name: "Drag gain" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));

    // Assert
    expect(screen.getByRole("status", { name: "Kick gain" })).toHaveTextContent("default");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("should redo the grouped drag to its final value", async () => {
    // Arrange
    const user = userEvent.setup();
    ({ stores } = renderWithStores(<GainKnob />));
    await user.click(screen.getByRole("button", { name: "Drag gain" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));

    // Act
    await user.click(screen.getByRole("button", { name: "Redo" }));

    // Assert
    expect(screen.getByRole("status", { name: "Kick gain" })).toHaveTextContent("0.7");
  });

  it("should keep selection out of undo history and dirty state", async () => {
    // Arrange
    const user = userEvent.setup();
    ({ stores } = renderWithStores(<FileStatus />));

    // Act
    await user.click(screen.getByRole("button", { name: "Select bass" }));

    // Assert
    expect(screen.getByRole("status", { name: "Dirty" })).toHaveTextContent("clean");
    expect(stores.project.getState().canUndo).toBe(false);
    expect(stores.project.getState().project.ui.selectedTrack).toBe("bass");
  });

  it("should write the file and clear dirty on save", async () => {
    // Arrange
    const user = userEvent.setup();
    ({ stores } = renderWithStores(<FileStatus />));
    await user.click(screen.getByRole("button", { name: "Mute kick" }));
    expect(screen.getByRole("status", { name: "Dirty" })).toHaveTextContent("dirty");

    // Act
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Assert
    expect(await screen.findByText("/Phyllo/Untitled Groove.phyllo")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Dirty" })).toHaveTextContent("clean");
    const saved = JSON.parse(await stores.native.projectRead("/Phyllo/Untitled Groove.phyllo")) as {
      tracks: { id: string; mute: boolean }[];
    };
    expect(saved.tracks.find((t) => t.id === "kick")?.mute).toBe(true);
  });

  it("should be clean again after undoing back to the saved revision", async () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));
    const state = stores.project.getState();
    await state.save();
    state.dispatch({ type: "track/setMute", trackId: "kick", mute: true });

    // Act
    stores.project.getState().undo();

    // Assert
    expect(stores.project.getState().dirty).toBe(false);
  });

  it("should stamp modified on a change", () => {
    // Arrange
    stores = renderWithStores(<FileStatus />, { now: () => Date.parse("2026-10-21T12:41:00.000Z") }).stores;

    // Act
    stores.project.getState().dispatch({ type: "project/rename", name: "Night drive" });

    // Assert
    expect(stores.project.getState().project.modified).toBe("2026-10-21T12:41:00.000Z");
  });

  it("should leave the open project untouched when imported code has a syntax error", () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));
    const before = stores.project.getState().project;

    // Act
    const result = stores.project.getState().importCode('$: s("bd*4"');

    // Assert
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.line).toBe(1);
    expect(stores.project.getState().project).toBe(before);
  });

  it("should import a strudel.cc link as a new unsaved project", () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));
    const link = `https://strudel.cc/#${encodeURIComponent(btoa('setcpm(90/4)\n$: s("bd sd")\n$: note("c2 eb2").s("sawtooth")'))}`;

    // Act
    const result = stores.project.getState().importCode(link);

    // Assert
    const state = stores.project.getState();
    expect(result.ok).toBe(true);
    expect(state.project.tempo.bpm).toBe(90);
    expect(state.project.tracks.map((t) => t.pattern)).toEqual(["bd sd", "c2 eb2"]);
    expect(state.filePath).toBeNull();
    expect(state.dirty).toBe(true);
  });

  it("should explain that short strudel.cc links can't be opened", () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));

    // Act
    const result = stores.project.getState().importCode("https://strudel.cc/?abc123");

    // Assert
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("Short strudel.cc links") }));
  });

  it("should apply edited code as one undoable change", () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));

    // Act
    const result = stores.project.getState().applyCode('setcpm(124/4)\n$: s("bd*2").bank("RolandTR909")');
    stores.project.getState().undo();

    // Assert
    expect(result.ok).toBe(true);
    expect(stores.project.getState().project.tracks).toHaveLength(4);
  });

  it("should open a saved .phyllo file and reject invalid files", async () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));
    const other = fixtureProject({ id: "prj_other", name: "Other groove" });
    await stores.native.projectWrite("/Phyllo/Other groove.phyllo", serializeProject(other));

    // Act
    const opened = await stores.project.getState().openProject("/Phyllo/Other groove.phyllo");
    const invalid = stores.project.getState().openProjectFromText("{ not json");

    // Assert
    expect(opened.ok).toBe(true);
    expect(invalid.ok).toBe(false);
    expect(stores.project.getState().project.name).toBe("Other groove");
    expect(stores.project.getState().filePath).toBe("/Phyllo/Other groove.phyllo");
  });

  it("should report a cancelled save dialog without writing", async () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));

    // Act
    const result = await stores.project.getState().saveAs();

    // Assert
    expect(result).toEqual(expect.objectContaining({ ok: false, cancelled: true }));
    expect(stores.project.getState().filePath).toBeNull();
  });

  it("should restore a version history snapshot as an undoable change", async () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));
    const state = stores.project.getState();
    await state.save();
    state.dispatch({ type: "project/rename", name: "Changed" });
    const [snapshot] = await stores.project.getState().listHistory();

    // Act
    const result = await stores.project.getState().restoreSnapshot(snapshot?.id ?? "missing");

    // Assert
    expect(result.ok).toBe(true);
    expect(stores.project.getState().project.name).toBe("Untitled Groove");
    stores.project.getState().undo();
    expect(stores.project.getState().project.name).toBe("Changed");
  });

  it("should start a starter project dirty with a fresh id", () => {
    // Arrange
    ({ stores } = renderWithStores(<FileStatus />));

    // Act
    const project = stores.project.getState().newProject("lofi", { bpm: 90 });

    // Assert
    expect(project.tempo.bpm).toBe(90);
    expect(project.id).toBe("prj_1");
    expect(stores.project.getState().dirty).toBe(true);
    expect(stores.project.getState().canUndo).toBe(false);
  });
});
