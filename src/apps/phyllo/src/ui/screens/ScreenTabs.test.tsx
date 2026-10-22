import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithStores } from "../../state/testUtils";
import { ShellContext } from "../shell/shellContext";
import type { ShellState } from "../shell/shellContext";
import { ScreenTabs } from "./ScreenTabs";
import type { ScreenTabsProps } from "./ScreenTabs";

function renderTabs(props: ScreenTabsProps) {
  const navigate = vi.fn();
  const shell: ShellState = {
    route: { screen: "arrange" },
    projectOpen: true,
    navigate,
    tool: "select",
    setTool: vi.fn(),
    snap: "1",
    setSnap: vi.fn(),
    exportOpen: false,
    openExport: vi.fn(),
    closeExport: vi.fn(),
    openHistory: vi.fn(),
    openShortcuts: vi.fn(),
    requestSearchFocus: vi.fn(),
    guardUnsaved: vi.fn(),
    notify: vi.fn(),
    recentClearedAt: 0,
    clearRecent: vi.fn(),
  };
  renderWithStores(
    <ShellContext.Provider value={shell}>
      <ScreenTabs {...props} />
    </ShellContext.Provider>,
  );
  return { navigate, user: userEvent.setup() };
}

describe("ScreenTabs", () => {
  it("should list every view on a tab's right-click with the current one checked", async () => {
    // Arrange
    const { user } = renderTabs({ current: "mixer" });

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Arrange" }) });

    // Assert
    const menu = await screen.findByRole("menu", { name: "Views" });
    expect(within(menu).getAllByRole("menuitemcheckbox").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Arrange"),
      expect.stringContaining("Pattern editor"),
      expect.stringContaining("Mixer"),
      expect.stringContaining("Groove library"),
    ]);
    expect(within(menu).getByRole("menuitemcheckbox", { name: /^Mixer/ })).toHaveAttribute("aria-checked", "true");
    expect(within(menu).getByRole("menuitemcheckbox", { name: /^Arrange/ })).toHaveAttribute("aria-checked", "false");
  });

  it("should show each view's shortcut in the menu", async () => {
    // Arrange
    const { user } = renderTabs({ current: "arrange" });

    // Act
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Mixer" }) });

    // Assert
    const menu = await screen.findByRole("menu", { name: "Views" });
    expect(within(menu).getByRole("menuitemcheckbox", { name: /^Mixer/ })).toHaveTextContent(/(Ctrl\+|⌘)3$/);
  });

  it("should navigate to the chosen view like the tab does", async () => {
    // Arrange
    const { user, navigate } = renderTabs({ current: "arrange" });
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Mixer" }) });

    // Act
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /^Pattern editor/ }));

    // Assert
    expect(navigate).toHaveBeenCalledWith({ screen: "pattern", trackId: null });
  });

  it("should open the Groove library from the menu", async () => {
    // Arrange
    const { user, navigate } = renderTabs({ current: "arrange" });
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Mixer" }) });

    // Act
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /^Groove library/ }));

    // Assert
    expect(navigate).toHaveBeenCalledWith({ screen: "library" });
  });

  it("should not navigate when the current view is chosen", async () => {
    // Arrange
    const { user, navigate } = renderTabs({ current: "arrange" });
    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("button", { name: "Mixer" }) });

    // Act
    await user.click(await screen.findByRole("menuitemcheckbox", { name: /^Arrange/ }));

    // Assert
    expect(navigate).not.toHaveBeenCalled();
  });

  it("should open the views menu from a focused tab with Shift+F10", async () => {
    // Arrange
    const { user } = renderTabs({ current: "arrange" });
    screen.getByRole("button", { name: "Pattern" }).focus();

    // Act
    await user.keyboard("{Shift>}{F10}{/Shift}");

    // Assert
    expect(await screen.findByRole("menu", { name: "Views" })).toBeInTheDocument();
  });
});
