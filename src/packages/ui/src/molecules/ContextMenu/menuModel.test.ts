import { describe, expect, it } from "vitest";
import { MENU_SEPARATOR, compactMenu, formatAccelerator } from "./menuModel";

describe("menuModel", () => {
  it("compactMenu should drop falsy entries, empty submenus and stray separators", () => {
    // Arrange
    const item = { id: "a", label: "A", onSelect: () => undefined };

    // Act
    const result = compactMenu([
      MENU_SEPARATOR,
      false,
      item,
      MENU_SEPARATOR,
      null,
      MENU_SEPARATOR,
      { type: "submenu", id: "s", label: "S", items: [false, MENU_SEPARATOR] },
      { ...item, id: "b" },
      MENU_SEPARATOR,
    ]);

    // Assert
    expect(result.map((entry) => (entry.type === "separator" ? "-" : entry.id))).toEqual(["a", "-", "b"]);
  });

  it.each([
    ["CmdOrCtrl+Shift+D", true, "⇧⌘D"],
    ["Alt+ArrowUp", true, "⌥↑"],
    ["Delete", true, "⌫"],
    ["F2", true, "F2"],
    ["CmdOrCtrl+Shift+D", false, "Ctrl+Shift+D"],
    ["Delete", false, "Del"],
  ])("formatAccelerator should format %s (mac %s) as %s", (accelerator, isMac, expected) => {
    // Arrange / Act / Assert
    expect(formatAccelerator(accelerator, isMac)).toBe(expected);
  });
});
