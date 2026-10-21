import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureProject } from "../../../state/mocks";
import type { MockStores, MockStoresOptions } from "../../../state/mocks";
import { renderWithStores } from "../../../state/testUtils";
import type { EditTool, Snap } from "../Timeline";
import { ViewToolbar } from "./ViewToolbar";

let stores: MockStores | undefined;

afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

function renderToolbar(
  { tool = "select", snap = "1" }: { tool?: EditTool; snap?: Snap } = {},
  options: MockStoresOptions = { initialSettings: { uiMode: "pro" } },
) {
  const onToolChange = vi.fn();
  const onSnapChange = vi.fn();
  const result = renderWithStores(
    <ViewToolbar
      tabs={<nav aria-label="Views">tabs</nav>}
      tool={tool}
      onToolChange={onToolChange}
      snap={snap}
      onSnapChange={onSnapChange}
      showZoomLevel
    />,
    options,
  );
  stores = result.stores;
  return { onToolChange, onSnapChange };
}

describe("ViewToolbar", () => {
  it("should render the tabs slot", () => {
    // Arrange / Act
    renderToolbar();

    // Assert
    expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument();
  });

  it("should hide the edit tools in Guided mode", () => {
    // Arrange / Act
    renderToolbar({}, { initialSettings: { uiMode: "guided" } });

    // Assert
    expect(screen.queryByRole("group", { name: "Edit tools" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Snap" })).toBeInTheDocument();
  });

  it("should show Select, Draw and Split with their shortcuts in Pro", () => {
    // Arrange / Act
    renderToolbar({ tool: "draw" });

    // Assert
    expect(screen.getByRole("button", { name: "Select (V)" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Draw (B)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Split (S)" })).toHaveAttribute("aria-keyshortcuts", "S");
  });

  it("should report the chosen tool", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onToolChange } = renderToolbar();

    // Act
    await user.click(screen.getByRole("button", { name: "Split (S)" }));

    // Assert
    expect(onToolChange).toHaveBeenCalledWith("split");
  });

  it("should report the chosen snap", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSnapChange } = renderToolbar();

    // Act
    await user.selectOptions(screen.getByRole("combobox", { name: "Snap" }), "4 bars");

    // Assert
    expect(onSnapChange).toHaveBeenCalledWith("4");
    expect(screen.getByRole("combobox", { name: "Snap" })).toHaveValue("1");
  });

  it("should zoom in and out and save the zoom in the project", async () => {
    // Arrange
    const user = userEvent.setup();
    renderToolbar();

    // Act
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    await user.click(screen.getByRole("button", { name: "Zoom out" }));

    // Assert
    expect(screen.getByRole("status", { name: "Zoom level" })).toHaveTextContent("150%");
    expect(stores?.project.getState().project.ui.zoom).toBe(1.5);
  });

  it("should disable Zoom out at the smallest zoom", () => {
    // Arrange / Act
    renderToolbar({}, { initialProject: fixtureProject({ ui: { selectedTrack: null, zoom: 0.25 } }), initialSettings: { uiMode: "pro" } });

    // Assert
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeEnabled();
  });
});
