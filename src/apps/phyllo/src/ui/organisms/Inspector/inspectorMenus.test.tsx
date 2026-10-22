import { findTrack } from "@phyllo/model";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { MockStores } from "../../../state/mocks";
import { createMockStores } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import { Inspector } from "./Inspector";
import { MOCKUP_BASS, inspectorProject } from "./inspectorFixtures";

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

/** The Pro Inspector on the mockup bass (modulated lpf, three modifiers, the last one off). */
function setup(mode: "guided" | "pro" = "pro") {
  stores = createMockStores({ initialProject: inspectorProject("bass", { bass: MOCKUP_BASS }), initialSettings: { uiMode: mode } });
  renderWithStores(<Inspector />, { stores });
  const user = userEvent.setup();
  const bass = () => {
    const track = findTrack(stores!.project.getState().project, "bass");
    if (!track) throw new Error("the fixture has a bass track");
    return track;
  };
  const modifierRows = () => screen.getAllByRole("listitem");
  const rightClick = (target: Element) => user.pointer({ keys: "[MouseRight]", target });
  return { user, bass, modifierRows, rightClick, stores };
}

const codes = (modifiers: readonly { code: string }[]) => modifiers.map((m) => m.code);
const undo = () => stores?.project.getState().undo();

describe("Inspector context menus", () => {
  it("should open the track menu on the header and rename inline from it", async () => {
    // Arrange
    const { user, rightClick } = setup();

    // Act
    await rightClick(screen.getByRole("heading", { name: /Bass/ }));
    await user.click(await screen.findByRole("menuitem", { name: /^Rename/ }));

    // Assert
    expect(screen.getByRole("textbox", { name: "Rename Bass" })).toHaveFocus();
  });

  it("should open the track menu from the keyboard with Shift+F10", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: "Bass, rename track" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
  });

  it("should reset a knob that is set on the track to its default", async () => {
    // Arrange
    const { user, rightClick, bass } = setup();
    expect(bass().params.shape).toBe(0.3);

    // Act
    await rightClick(screen.getByRole("slider", { name: "shape" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset to default" }));

    // Assert
    expect(bass().params.shape).toBeUndefined();
  });

  it("should disable Reset to default on a knob that is not set", async () => {
    // Arrange
    const { rightClick } = setup();

    // Act
    await rightClick(screen.getByRole("slider", { name: "delay" }));

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Reset to default" })).toBeDisabled();
  });

  it("should open the typed-value entry from Type value", async () => {
    // Arrange
    const { user, rightClick } = setup();

    // Act
    await rightClick(screen.getByRole("slider", { name: "shape" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Type value/ }));

    // Assert
    expect(screen.getByRole("textbox", { name: /shape/ })).toHaveFocus();
  });

  it("should offer Remove modulation only on a modulated knob", async () => {
    // Arrange
    const { rightClick } = setup();

    // Act
    await rightClick(screen.getByRole("slider", { name: "shape" }));

    // Assert
    await screen.findByRole("menu");
    expect(screen.queryByRole("menuitem", { name: "Remove modulation" })).not.toBeInTheDocument();
  });

  it("should switch off the modifiers that drive a knob as one undo step", async () => {
    // Arrange
    const { user, rightClick, bass } = setup();
    const driving = ".lpf(sine.range(400, 1400).slow(8))";

    // Act
    await rightClick(screen.getByRole("slider", { name: "lpf" }));
    await user.click(await screen.findByRole("menuitem", { name: "Remove modulation" }));

    // Assert
    expect(bass().modifiers.find((m) => m.code === driving)?.enabled).toBe(false);
    undo();
    expect(bass().modifiers.find((m) => m.code === driving)?.enabled).toBe(true);
  });

  it("should toggle a modifier from the Enabled check item", async () => {
    // Arrange
    const { user, rightClick, modifierRows, bass } = setup();

    // Act
    await rightClick(modifierRows()[2]!);
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Enabled" }));

    // Assert
    expect(bass().modifiers[2]?.enabled).toBe(true);
  });

  it("should open the inline code editor from Edit code", async () => {
    // Arrange
    const { user, rightClick, modifierRows } = setup();

    // Act
    await rightClick(modifierRows()[1]!);
    await user.click(await screen.findByRole("menuitem", { name: /^Edit code/ }));

    // Assert
    await waitFor(() => expect(screen.getByRole("textbox", { name: /Edit \.sometimes/ })).toHaveFocus());
  });

  it("should disable Move up on the first modifier and Move down on the last", async () => {
    // Arrange
    const { rightClick, modifierRows } = setup();

    // Act
    await rightClick(modifierRows()[0]!);

    // Assert
    expect(await screen.findByRole("menuitem", { name: /^Move up/ })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: /^Move down/ })).toBeEnabled();
  });

  it("should move a modifier down", async () => {
    // Arrange
    const { user, rightClick, modifierRows, bass } = setup();

    // Act
    await rightClick(modifierRows()[0]!);
    await user.click(await screen.findByRole("menuitem", { name: /^Move down/ }));

    // Assert
    expect(bass().modifiers.map((m) => m.id)).toEqual(["m-ply", "m-sweep", "m-rev"]);
  });

  it("should duplicate a modifier right after itself as one undo step", async () => {
    // Arrange
    const { user, rightClick, modifierRows, bass } = setup();
    const before = codes(bass().modifiers);

    // Act
    await rightClick(modifierRows()[1]!);
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));

    // Assert
    expect(codes(bass().modifiers)).toEqual([before[0], before[1], before[1], before[2]]);
    expect(new Set(bass().modifiers.map((m) => m.id)).size).toBe(4);
    undo();
    expect(codes(bass().modifiers)).toEqual(before);
  });

  it("should disable Paste modifier below until a modifier is copied", async () => {
    // Arrange
    const { rightClick, modifierRows } = setup();

    // Act
    await rightClick(modifierRows()[0]!);

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Paste modifier below" })).toBeDisabled();
  });

  it("should paste a copied modifier below another with a fresh id", async () => {
    // Arrange
    const { user, rightClick, modifierRows, bass } = setup();
    await rightClick(modifierRows()[2]!);
    await user.click(await screen.findByRole("menuitem", { name: "Copy modifier" }));
    await rightClick(modifierRows()[0]!);

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Paste modifier below" }));

    // Assert
    expect(codes(bass().modifiers)).toEqual([".lpf(sine.range(400, 1400).slow(8))", ".lastOf(4, rev)", ".sometimes(x => x.ply(2))", ".lastOf(4, rev)"]);
    expect(new Set(bass().modifiers.map((m) => m.id)).size).toBe(4);
  });

  it("should copy a modifier to the end of another track", async () => {
    // Arrange
    const { user, rightClick, modifierRows } = setup();
    const hatsBefore = findTrack(stores!.project.getState().project, "hats")?.modifiers.length ?? 0;

    // Act
    await rightClick(modifierRows()[1]!);
    await user.click(await screen.findByRole("menuitem", { name: "Copy to track" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hats" }));

    // Assert
    const hats = findTrack(stores!.project.getState().project, "hats");
    expect(hats?.modifiers).toHaveLength(hatsBefore + 1);
    expect(hats?.modifiers.at(-1)?.code).toBe(".sometimes(x => x.ply(2))");
  });

  it("should not list the track itself in Copy to track", async () => {
    // Arrange
    const { user, rightClick, modifierRows } = setup();

    // Act
    await rightClick(modifierRows()[1]!);
    await user.click(await screen.findByRole("menuitem", { name: "Copy to track" }));

    // Assert
    await screen.findByRole("menuitem", { name: "Kick" });
    expect(screen.queryByRole("menuitem", { name: "Bass" })).not.toBeInTheDocument();
  });

  it("should remove a modifier", async () => {
    // Arrange
    const { user, rightClick, modifierRows, bass } = setup();

    // Act
    await rightClick(modifierRows()[1]!);
    await user.click(await screen.findByRole("menuitem", { name: /^Remove/ }));

    // Assert
    expect(bass().modifiers.map((m) => m.id)).toEqual(["m-sweep", "m-rev"]);
  });

  it("should open the modifier row menu from the keyboard with Shift+F10", async () => {
    // Arrange
    const { user } = setup();
    screen.getByRole("button", { name: /^Edit \.sometimes/ }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
  });

  it("should open the add-modifier search from the section menu", async () => {
    // Arrange
    const { user, rightClick } = setup();

    // Act
    await rightClick(screen.getByRole("heading", { name: /Modifiers/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Add modifier…" }));

    // Assert
    expect(screen.getByRole("dialog", { name: "Add a modifier" })).toBeInTheDocument();
  });

  it("should append a pasted modifier from the section menu", async () => {
    // Arrange
    const { user, rightClick, modifierRows, bass } = setup();
    await rightClick(modifierRows()[0]!);
    await user.click(await screen.findByRole("menuitem", { name: "Copy modifier" }));
    await rightClick(screen.getByRole("heading", { name: /Modifiers/ }));

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Paste modifier" }));

    // Assert
    expect(codes(bass().modifiers).at(-1)).toBe(".lpf(sine.range(400, 1400).slow(8))");
    expect(bass().modifiers).toHaveLength(4);
  });
});
