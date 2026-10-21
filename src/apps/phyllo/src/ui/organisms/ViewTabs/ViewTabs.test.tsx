import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ViewTabs } from "./ViewTabs";

describe("ViewTabs", () => {
  it("should list Arrange, Pattern and Mixer and mark the current view", () => {
    // Arrange / Act
    render(<ViewTabs current="pattern" onNavigate={() => {}} />);

    // Assert
    expect(screen.getAllByRole("button").map((tab) => tab.textContent)).toEqual(["Arrange", "Pattern", "Mixer"]);
    expect(screen.getByRole("button", { name: "Pattern" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Arrange" })).not.toHaveAttribute("aria-current");
  });

  it("should put Library first when asked", () => {
    // Arrange / Act
    render(<ViewTabs current="library" withLibrary onNavigate={() => {}} />);

    // Assert
    expect(screen.getAllByRole("button").map((tab) => tab.textContent)).toEqual(["Library", "Arrange", "Pattern", "Mixer"]);
  });

  it("should navigate to the clicked view", async () => {
    // Arrange
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ViewTabs current="arrange" onNavigate={onNavigate} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Mixer" }));

    // Assert
    expect(onNavigate).toHaveBeenCalledWith("mixer");
  });

  it("should not navigate when the current view is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<ViewTabs current="arrange" onNavigate={onNavigate} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Arrange" }));

    // Assert
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("should be a labelled navigation landmark", () => {
    // Arrange / Act
    render(<ViewTabs current="arrange" onNavigate={() => {}} />);

    // Assert
    expect(screen.getByRole("navigation", { name: "Views" })).toBeInTheDocument();
  });
});
