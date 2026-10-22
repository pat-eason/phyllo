import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContextMenuTrigger } from "../../hooks/useContextMenu";
import type { ContextMenuRequest } from "../../hooks/useContextMenu";
import type { NativeApi } from "../../native/api";
import { createMockNative } from "../../state/mocks";
import { ContextMenuProvider } from "./ContextMenuProvider";

function Target({ build, label = "Target" }: { build: () => ContextMenuRequest | null; label?: string }) {
  const trigger = useContextMenuTrigger(build);
  return (
    <button type="button" {...trigger}>
      {label}
    </button>
  );
}

function bassMenu(onRename = vi.fn()): ContextMenuRequest {
  return {
    label: "Track Bass",
    entries: [
      { id: "rename", label: "Rename", onSelect: onRename },
      false,
      { id: "delete", label: "Delete", destructive: true, onSelect: () => undefined },
    ],
  };
}

function renderWith(ui: React.ReactNode, native: NativeApi = createMockNative(), suppress?: boolean) {
  render(
    <ContextMenuProvider native={native} suppressWebViewMenu={suppress}>
      {ui}
    </ContextMenuProvider>,
  );
  return { user: userEvent.setup(), native };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextMenuProvider", () => {
  it("should open the in-app menu on right-click when there is no native menu", async () => {
    // Arrange
    const { user } = renderWith(<Target build={() => bassMenu()} />);

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Target" }) });

    // Assert
    const menu = await screen.findByRole("menu", { name: "Track Bass" });
    expect(menu).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename", "Delete"]);
  });

  it("should run the chosen item and close", async () => {
    // Arrange
    const onRename = vi.fn();
    const { user } = renderWith(<Target build={() => bassMenu(onRename)} />);
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Target" }) });

    // Act
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));

    // Assert
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("should open from Shift+F10 and return focus on Escape", async () => {
    // Arrange
    const { user } = renderWith(<Target build={() => bassMenu()} />);
    const target = screen.getByRole("button", { name: "Target" });
    target.focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await screen.findByRole("menu", { name: "Track Bass" });
    await user.keyboard("{Escape}");

    // Assert
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(target).toHaveFocus();
  });

  it("should hand the entries to the native menu when there is one", async () => {
    // Arrange
    const native = createMockNative();
    const popup = vi.spyOn(native, "contextMenuPopup").mockResolvedValue(true);
    const { user } = renderWith(<Target build={() => bassMenu()} />, native);

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Target" }) });

    // Assert
    expect(popup).toHaveBeenCalledTimes(1);
    expect(popup.mock.calls[0]?.[0].map((entry) => (entry.type === "separator" ? "-" : entry.label))).toEqual(["Rename", "Delete"]);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("should fall back to the in-app menu when the native menu fails", async () => {
    // Arrange
    const native = createMockNative();
    vi.spyOn(native, "contextMenuPopup").mockRejectedValue(new Error("no menu"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { user } = renderWith(<Target build={() => bassMenu()} />, native);

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Target" }) });

    // Assert
    expect(await screen.findByRole("menu", { name: "Track Bass" })).toBeInTheDocument();
  });

  it("should open the innermost element's menu only", async () => {
    // Arrange
    const outer = vi.fn(() => bassMenu());
    const { user } = renderWith(
      <div onContextMenu={() => outer()}>
        <Target build={() => ({ label: "Clip", entries: [{ id: "split", label: "Split", onSelect: () => undefined }] })} />
      </div>,
    );

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Target" }) });

    // Assert
    expect(await screen.findByRole("menu", { name: "Clip" })).toBeInTheDocument();
    expect(outer).not.toHaveBeenCalled();
  });

  it("should hide the web view menu where nothing handles the right-click", () => {
    // Arrange
    renderWith(<p>Plain text</p>, createMockNative(), true);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    // Act
    screen.getByText("Plain text").dispatchEvent(event);

    // Assert
    expect(event.defaultPrevented).toBe(true);
  });

  it("should keep the web view menu in text fields", () => {
    // Arrange
    renderWith(<input aria-label="Name" />, createMockNative(), true);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    // Act
    screen.getByRole("textbox", { name: "Name" }).dispatchEvent(event);

    // Assert
    expect(event.defaultPrevented).toBe(false);
  });
});
