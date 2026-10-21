import { findTrack } from "@phyllo/model";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithStores } from "../../../state/testUtils";
import type { MockStores } from "../../../state/mocks";
import { PatternEditorProvider, StepSequencer } from "../StepSequencer";
import { drumsTrack, editorProject } from "../StepSequencer/fixtures";
import { PatternTools } from "./PatternTools";

function trackOf(stores: MockStores, id: string) {
  return findTrack(stores.project.getState().project, id);
}

function Editor() {
  return (
    <PatternEditorProvider>
      <StepSequencer />
      <PatternTools />
    </PatternEditorProvider>
  );
}

describe("PatternTools", () => {
  it("should apply a Euclid rhythm to the row selected in the step sequencer", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<Editor />, { initialProject: editorProject() });
    await user.click(screen.getByRole("button", { name: "Open hat oh" }));

    // Act
    await user.click(screen.getByRole("button", { name: "Apply to Open hat" }));

    // Assert
    expect(trackOf(stores, "drums")?.pattern).toBe("bd*4, [~ cp]*2, hh*8, oh(3,8)");
    expect(screen.getByRole("grid", { name: "Drums steps" })).toHaveTextContent("oh(3,8)");
  });

  it("should change the hit count between 1 and 8", async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithStores(<PatternTools />, { initialProject: editorProject() });
    const more = screen.getByRole("button", { name: "More hits" });

    // Act
    for (let i = 0; i < 6; i++) await user.click(more);

    // Assert
    expect(within(screen.getByRole("group", { name: "Hits" })).getByText("8")).toBeInTheDocument();
    expect(more).toBeDisabled();
    expect(screen.getByText("bd(8,8)")).toBeInTheDocument();
  });

  it("should write a swing modifier and remove it when the slider returns to zero", async () => {
    // Arrange
    const user = userEvent.setup();
    const { stores } = renderWithStores(<PatternTools />, { initialProject: editorProject() });
    screen.getByRole("slider", { name: "Swing" }).focus();

    // Act
    await user.keyboard("{ArrowRight>10/}");
    const written = trackOf(stores, "drums")?.modifiers.map((m) => m.code);
    await user.keyboard("{Home}");

    // Assert
    expect(written).toEqual([".swingBy(1/6, 4)"]);
    expect(trackOf(stores, "drums")?.modifiers).toEqual([]);
  });

  it("should read the fill slider from an existing modifier", () => {
    // Arrange
    const track = drumsTrack({ modifiers: [{ id: "m1", code: ".lastOf(4, x => x.fast(4))", enabled: true }] });

    // Act
    renderWithStores(<PatternTools />, { initialProject: editorProject("drums", [track]) });

    // Assert
    expect(screen.getByRole("slider", { name: "Fill every 4th cycle" })).toHaveValue("2");
    expect(screen.getByText(".lastOf(4, x => x.fast(4))")).toBeInTheDocument();
  });

  it("should explain that Euclid needs a drum row on a melodic track", () => {
    // Arrange
    const project = editorProject("bass");

    // Act
    renderWithStores(<PatternTools />, { initialProject: project });

    // Assert
    expect(screen.getByText("Works on drum rows. Open a drum track to use it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("should list the mini-notation cheat sheet", () => {
    // Arrange
    renderWithStores(<PatternTools />, { initialProject: editorProject() });

    // Act
    const sheet = screen.getByRole("region", { name: "Mini-notation, quickly" });

    // Assert
    expect(within(sheet).getAllByRole("term").map((t) => t.textContent)).toEqual(["~", "bd*4", "[a b]", "<a b>", "a, b", "bd?", "bd(3,8)", "a@3"]);
  });
});
