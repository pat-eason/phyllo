import { findTrack } from "@phyllo/model";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import type { MockStores } from "../../../state/mocks";
import { drumsTrack, editorProject, leadTrack } from "./fixtures";
import { StepSequencer } from "./StepSequencer";

function trackOf(stores: MockStores, id: string) {
  return findTrack(stores.project.getState().project, id);
}

describe("StepSequencer", () => {
  it("should show one row per kit sound with the mini-notation each row writes", () => {
    // Arrange
    renderWithStores(<StepSequencer />, { initialProject: editorProject() });

    // Act
    const grid = screen.getByRole("grid", { name: "Drums steps" });

    // Assert
    const rows = within(grid).getAllByRole("row");
    expect(rows.map((r) => within(r).getAllByRole("button")[0]?.getAttribute("aria-label"))).toEqual([
      "Kick, bd",
      "Clap, cp",
      "Closed hat, hh",
      "Open hat, oh",
      "Rimshot, rim",
    ]);
    expect(within(grid).getByText("[~ oh]*4")).toBeInTheDocument();
    expect(within(grid).getByText("—")).toBeInTheDocument();
  });

  it("should audition a row's sound from the Preview button without selecting the row", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });

    // Act
    await user.click(screen.getByRole("button", { name: "Preview Clap" }));

    // Assert
    await waitFor(() => expect(stores.fakeEngine.previews).toHaveLength(1));
    expect(stores.fakeEngine.previews[0]).toMatchObject({ s: "cp" });
    expect(screen.getByRole("button", { name: "Clap, cp" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should keep the step grid to one tab stop per row and move between rows with ↑/↓ in the same column", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<StepSequencer />, { initialProject: editorProject() });
    screen.getByRole("button", { name: "Kick step 5" }).focus();

    // Act
    await user.keyboard("{ArrowDown}{ArrowRight}");

    // Assert
    expect(screen.getByRole("button", { name: "Clap step 6" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Clap step 6" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", { name: "Clap step 1" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Kick step 5" })).toHaveAttribute("tabindex", "0");
  });

  it("should write the combined pattern when a step is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });

    // Act
    await user.click(screen.getByRole("button", { name: "Rimshot step 1" }));

    // Assert
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*4, [~ cp]*2, hh*8, [~ oh]*4, rim");
  });

  it("should undo a click-drag across steps in one step", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });

    // Act
    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByRole("button", { name: "Rimshot step 1" }) },
      { target: screen.getByRole("button", { name: "Rimshot step 2" }) },
      { target: screen.getByRole("button", { name: "Rimshot step 3" }) },
      { keys: "[/MouseLeft]" },
    ]);
    const painted = trackOf(stores, "drums")?.pattern;
    stores.project.getState().undo();

    // Assert
    expect(painted).toBe("bd*4, [~ cp]*2, hh*8, [~ oh]*4, rim rim rim ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~");
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*4, [~ cp]*2, hh*8, [~ oh]*4");
  });

  it("should toggle a step from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });
    screen.getByRole("button", { name: "Kick step 1" }).focus();

    // Act
    await user.keyboard(" ");

    // Assert
    expect(trackOf(stores, "drums")?.pattern).toBe("~ bd bd bd, [~ cp]*2, hh*8, [~ oh]*4");
  });

  it("should show the text and a replace action when the pattern can't be shown as steps", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, {
      initialProject: editorProject("drums", [drumsTrack({ pattern: "<bd sd> hh" })]),
    });

    const notice = screen.getByRole("status");
    const shown = within(notice).getByText("<bd sd> hh");

    // Act
    await user.click(within(notice).getByRole("button", { name: "Replace with a step pattern" }));

    // Assert
    expect(shown).toHaveTextContent("<bd sd> hh");
    expect(trackOf(stores, "drums")?.pattern).toBe("~");
    expect(screen.getByRole("grid", { name: "Drums steps" })).toBeInTheDocument();
  });

  it("should update the grid when the live code is edited and committed", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });
    const field = screen.getByRole("textbox", { name: "Live code" });

    // Act
    await user.clear(field);
    await user.type(field, 's("bd*2, rim*4").bank("RolandTR808"){Enter}');

    // Assert
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*2, rim*4");
    expect(trackOf(stores, "drums")?.source.bank).toBe("RolandTR808");
    expect(screen.getByRole("button", { name: "Rimshot step 5" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should keep the pattern and show an error when the live code doesn't parse", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });
    const field = screen.getByRole("textbox", { name: "Live code" });

    // Act
    await user.clear(field);
    await user.type(field, 's("bd [[cp"){Enter}');

    // Assert
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*4, [~ cp]*2, hh*8, [~ oh]*4");
  });

  it("should write a gain pattern when a single-row track's velocity bar is raised", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer trackId="hats" />);
    const bar = screen.getByRole("slider", { name: "Closed hat step 1 velocity" });

    // Act
    bar.focus();
    await user.keyboard("{End}");

    // Assert
    expect(bar).toHaveAttribute("aria-valuetext", "100%");
    expect(trackOf(stores, "hats")?.params.gain).toBe("1 .7 .4 .7 .4 .7 .4 .7");
  });

  it("should write per-hit gain tokens when a velocity changes in a multi-row pattern", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });
    await user.click(screen.getByRole("button", { name: "Open hat, oh" }));

    // Act
    screen.getByRole("slider", { name: "Open hat step 3 velocity" }).focus();
    await user.keyboard("{Home}");

    // Assert
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*4, [~ cp]*2, hh*8, ~ oh:0:0 ~ oh ~ oh ~ oh");
    expect(screen.getByRole("slider", { name: "Open hat step 3 velocity" })).toHaveAttribute("aria-valuetext", "0%");
  });

  it("should change the kit bank from the Kit select", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Kit" }), "LinnDrum");

    // Assert
    expect(trackOf(stores, "drums")?.source.bank).toBe("LinnDrum");
  });

  it("should add an empty row for a kit sound and fill it from the grid", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, { initialProject: editorProject() });

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Add a sound row" }), "sd");
    await user.click(screen.getByRole("button", { name: "Snare step 5" }));

    // Assert
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*4, [~ cp]*2, hh*8, [~ oh]*4, ~ sd ~ ~");
  });

  it("should open the piano roll for a note track and write a note on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<StepSequencer />, {
      initialProject: editorProject("lead", [leadTrack({ pattern: "a3*4" })]),
    });

    // Act
    await user.click(screen.getByRole("button", { name: "C4 step 2" }));

    // Assert
    expect(screen.getByRole("tab", { name: "Piano roll" })).toHaveAttribute("aria-selected", "true");
    expect(trackOf(stores, "lead")?.pattern).toBe("a3 c4 ~ ~ a3 ~ ~ ~ a3 ~ ~ ~ a3 ~ ~ ~");
  });

  it("should refuse to draw a melodic pattern that changes every cycle", () => {
    // Arrange
    renderWithStores(<StepSequencer trackId="bass" />);

    // Act
    const notice = screen.getByRole("status");

    // Assert
    expect(within(notice).getByText("This pattern can't be shown as steps")).toBeInTheDocument();
    expect(within(notice).getByText("<a1 a1 c2 g1>*2")).toBeInTheDocument();
  });

  it("should show the track's generated code on the Code tab", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<StepSequencer trackId="kick" />);

    // Act
    await user.click(screen.getByRole("tab", { name: "Code" }));

    // Assert
    const code = screen.getByRole("region", { name: "Generated code for Kick" });
    expect(within(code).getByText(/s\("bd\*4"\)\.bank\("RolandTR909"\)/)).toBeInTheDocument();
  });

  it("should ask for a track when nothing is selected", () => {
    // Arrange
    const project = editorProject();

    // Act
    renderWithStores(<StepSequencer />, { initialProject: { ...project, ui: { ...project.ui, selectedTrack: null } } });

    // Assert
    expect(screen.getByText("Select a track to edit its pattern.")).toBeInTheDocument();
  });
});
