import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { tokenizeCode } from "./codeTokens";
import { ModifierRow, type ModifierRowProps } from "./ModifierRow";

const CODE = ".sometimes(x => x.ply(2))";

function renderRow(props: Partial<ModifierRowProps> = {}) {
  const handlers = {
    onEnabledChange: vi.fn(),
    onRemove: vi.fn(),
    onMove: vi.fn(),
    onEdit: vi.fn(),
  };
  render(
    <div role="list">
      <ModifierRow code={CODE} description="Doubles ~50% of notes" enabled {...handlers} {...props} />
    </div>,
  );
  return handlers;
}

describe("ModifierRow", () => {
  it("should be a list item with a reorder handle, code, switch and remove button", () => {
    // Arrange / Act
    renderRow();

    // Assert
    expect(screen.getByRole("listitem")).toHaveTextContent("Doubles ~50% of notes");
    expect(screen.getByRole("button", { name: `Reorder ${CODE}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Edit ${CODE}` })).toHaveTextContent(CODE);
    expect(screen.getByRole("switch", { name: `Enable ${CODE}` })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: `Remove ${CODE}` })).toBeInTheDocument();
  });

  it("should call onEnabledChange with the next value", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEnabledChange } = renderRow();

    // Act
    await user.click(screen.getByRole("switch"));

    // Assert
    expect(onEnabledChange).toHaveBeenCalledWith(false);
  });

  it("should mark disabled rows", () => {
    // Arrange / Act
    renderRow({ enabled: false });

    // Assert
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("listitem")).not.toHaveAttribute("data-enabled");
  });

  it("should move with ⌥↑ / ⌥↓ on the code and plain arrows on the handle", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onMove } = renderRow();

    // Act
    screen.getByRole("button", { name: `Edit ${CODE}` }).focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    await user.keyboard("{ArrowDown}");
    screen.getByRole("button", { name: `Reorder ${CODE}` }).focus();
    await user.keyboard("{ArrowDown}");

    // Assert: the plain ArrowDown on the code did nothing
    expect(onMove.mock.calls).toEqual([[-1], [1]]);
  });

  it("should move by whole rows when the handle is dragged", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onMove } = renderRow();
    const handle = screen.getByRole("button", { name: `Reorder ${CODE}` });

    // Act: jsdom has no layout, so a row counts as the 24 px minimum
    await user.pointer([
      { keys: "[MouseLeft>]", target: handle, coords: { clientY: 100 } },
      { target: handle, coords: { clientY: 130 } },
      { target: handle, coords: { clientY: 60 } },
      { keys: "[/MouseLeft]" },
    ]);

    // Assert
    expect(onMove.mock.calls).toEqual([[1], [-2]]);
  });

  it("should remove on the button or the Delete key", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onRemove } = renderRow();

    // Act
    await user.click(screen.getByRole("button", { name: `Remove ${CODE}` }));
    screen.getByRole("button", { name: `Edit ${CODE}` }).focus();
    await user.keyboard("{Delete}");

    // Assert
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it("should edit on double-click and commit with Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEdit } = renderRow();

    // Act
    await user.dblClick(screen.getByRole("button", { name: `Edit ${CODE}` }));
    const input = screen.getByRole("textbox", { name: `Edit ${CODE}` });
    await user.clear(input);
    await user.type(input, ".ply(2){Enter}");

    // Assert
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(".ply(2)");
    expect(screen.getByRole("button", { name: `Edit ${CODE}` })).toHaveFocus();
  });

  it("should start editing with Enter and cancel with Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onEdit } = renderRow();
    screen.getByRole("button", { name: `Edit ${CODE}` }).focus();

    // Act
    await user.keyboard("{Enter}");
    const input = screen.getByRole("textbox");
    await user.type(input, "xyz{Escape}");

    // Assert
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Edit ${CODE}` })).toHaveFocus();
  });

  it("should not edit on a single click or without onEdit", async () => {
    // Arrange
    const user = userEvent.setup();
    renderRow({ onEdit: undefined });

    // Act
    await user.dblClick(screen.getByRole("button", { name: CODE }));

    // Assert
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should describe the code with the error message", () => {
    // Arrange / Act
    renderRow({ error: "Missing )" });

    // Assert
    expect(screen.getByRole("button", { name: `Edit ${CODE}` })).toHaveAccessibleDescription("Missing )");
  });

  it("should tint strings, numbers and called functions", () => {
    // Arrange / Act
    const tokens = tokenizeCode('.gain("[.45 .7]*4").fast(2)');

    // Assert
    expect(tokens).toEqual([
      { kind: "plain", text: "." },
      { kind: "fn", text: "gain" },
      { kind: "plain", text: "(" },
      { kind: "str", text: '"[.45 .7]*4"' },
      { kind: "plain", text: ")." },
      { kind: "fn", text: "fast" },
      { kind: "plain", text: "(" },
      { kind: "num", text: "2" },
      { kind: "plain", text: ")" },
    ]);
  });

  it("should keep identifiers and arrows plain", () => {
    // Arrange / Act
    const tokens = tokenizeCode(".lastOf(4, rev)");

    // Assert
    expect(tokens).toEqual([
      { kind: "plain", text: "." },
      { kind: "fn", text: "lastOf" },
      { kind: "plain", text: "(" },
      { kind: "num", text: "4" },
      { kind: "plain", text: ", rev)" },
    ]);
  });
});
