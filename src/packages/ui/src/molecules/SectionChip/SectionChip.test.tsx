import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SectionChip } from "./SectionChip";

describe("SectionChip", () => {
  it("should mark itself to drop the range before truncating the name when asked", () => {
    // Arrange / Act
    render(<SectionChip name="Break" startBar={17} endBar={20} current={false} dropRangeFirst />);

    // Assert
    expect(screen.getByRole("button", { name: /^Break/ })).toHaveAttribute("data-drop-range");
  });

  it("should be a button named with its bar range", () => {
    // Arrange / Act
    render(<SectionChip name="Groove" startBar={9} endBar={16} current={false} />);

    // Assert
    const chip = screen.getByRole("button", { name: "Groove 9–16, section" });
    expect(chip).toHaveTextContent("Groove");
    expect(chip).toHaveTextContent("9–16");
  });

  it("should name a single-bar section without a range", () => {
    // Arrange / Act
    render(<SectionChip name="Hit" startBar={12} endBar={12} current={false} />);

    // Assert
    expect(screen.getByRole("button", { name: "Hit 12, section" })).toHaveTextContent("12");
  });

  it("should mark the current section with aria-current", () => {
    // Arrange / Act
    render(<SectionChip name="Groove" startBar={9} endBar={16} current />);

    // Assert
    expect(screen.getByRole("button")).toHaveAttribute("aria-current", "true");
  });

  it("should not set aria-current on other sections", () => {
    // Arrange / Act
    render(<SectionChip name="Break" startBar={17} endBar={20} current={false} />);

    // Assert
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-current");
  });

  it("should call onSelect on click and keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SectionChip name="Groove" startBar={9} endBar={16} current={false} onSelect={onSelect} />);

    // Act
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("should rename on double-click and Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<SectionChip name="Groove" startBar={9} endBar={16} current={false} onRename={onRename} />);

    // Act
    await user.dblClick(screen.getByRole("button"));
    await user.keyboard("{Control>}a{/Control}Drop{Enter}");

    // Assert
    expect(onRename).toHaveBeenCalledWith("Drop");
    expect(screen.getByRole("button", { name: "Groove 9–16, section" })).toHaveFocus();
  });

  it("should rename from the keyboard with F2 and cancel with Escape", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRename = vi.fn();
    render(<SectionChip name="Groove" startBar={9} endBar={16} current={false} onRename={onRename} />);

    // Act
    await user.tab();
    await user.keyboard("{F2}");
    await user.keyboard("zzz{Escape}");

    // Assert
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Groove 9–16, section" })).toBeInTheDocument();
  });

  it("should ignore double-click when onRename is not provided", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<SectionChip name="Groove" startBar={9} endBar={16} current={false} />);

    // Act
    await user.dblClick(screen.getByRole("button"));

    // Assert
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
