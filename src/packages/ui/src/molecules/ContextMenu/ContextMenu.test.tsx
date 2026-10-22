import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";
import { MENU_SEPARATOR } from "./menuModel";
import type { MenuEntry } from "./menuModel";

function entries(onSelect = vi.fn()): MenuEntry[] {
  return [
    { id: "rename", label: "Rename", accelerator: "F2", onSelect: () => onSelect("rename") },
    { id: "mute", label: "Mute", checked: true, onSelect: () => onSelect("mute") },
    { id: "disabled", label: "Paste", disabled: true, onSelect: () => onSelect("paste") },
    MENU_SEPARATOR,
    {
      type: "submenu",
      id: "color",
      label: "Colour",
      items: [
        { id: "green", label: "Green", swatch: "#7FD98A", onSelect: () => onSelect("green") },
        { id: "blue", label: "Blue", swatch: "#8AB4FF", onSelect: () => onSelect("blue") },
      ],
    },
    { id: "delete", label: "Delete", destructive: true, accelerator: "Delete", onSelect: () => onSelect("delete") },
  ];
}

function renderMenu(onSelect = vi.fn(), onClose = vi.fn()) {
  render(<ContextMenu x={10} y={10} label="Track Bass" entries={entries(onSelect)} onClose={onClose} isMac />);
  return { onSelect, onClose, user: userEvent.setup() };
}

describe("ContextMenu", () => {
  it("should focus the first item and expose roles, checks and shortcuts", () => {
    // Arrange / Act
    renderMenu();

    // Assert
    expect(screen.getByRole("menu", { name: "Track Bass" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Rename/ })).toHaveFocus();
    expect(screen.getByRole("menuitemcheckbox", { name: /Mute/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toHaveTextContent("⌫");
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Colour/ })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("should skip disabled items and separators with the arrow keys", async () => {
    // Arrange
    const { user } = renderMenu();

    // Act
    await user.keyboard("{ArrowDown}{ArrowDown}");

    // Assert
    expect(screen.getByRole("menuitem", { name: /Colour/ })).toHaveFocus();
  });

  it("should choose an item, closing first", async () => {
    // Arrange
    const { user, onSelect, onClose } = renderMenu();

    // Act
    await user.click(screen.getByRole("menuitem", { name: /Delete/ }));

    // Assert
    expect(onClose).toHaveBeenCalledWith("select");
    expect(onSelect).toHaveBeenCalledWith("delete");
  });

  it("should open a submenu with ArrowRight and focus its first item", async () => {
    // Arrange
    const { user } = renderMenu();
    await user.keyboard("{ArrowDown}{ArrowDown}");

    // Act
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(screen.getByRole("menu", { name: "Colour" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Green/ })).toHaveFocus();
  });

  it("should close a submenu with ArrowLeft and refocus its trigger", async () => {
    // Arrange
    const { user, onSelect } = renderMenu();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");

    // Act
    await user.keyboard("{ArrowLeft}");

    // Assert
    expect(screen.queryByRole("menu", { name: "Colour" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Colour/ })).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should choose a submenu item", async () => {
    // Arrange
    const { user, onSelect } = renderMenu();
    await user.click(screen.getByRole("menuitem", { name: /Colour/ }));

    // Act
    await user.click(screen.getByRole("menuitem", { name: /Blue/ }));

    // Assert
    expect(onSelect).toHaveBeenCalledWith("blue");
  });

  it("should close only the submenu on Escape inside a submenu", async () => {
    // Arrange
    const { user, onClose } = renderMenu();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(screen.queryByRole("menu", { name: "Colour" })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should close the menu on Escape at the top level", async () => {
    // Arrange
    const { user, onClose } = renderMenu();

    // Act
    await user.keyboard("{Escape}");

    // Assert
    expect(onClose).toHaveBeenCalledWith("escape");
  });
});
