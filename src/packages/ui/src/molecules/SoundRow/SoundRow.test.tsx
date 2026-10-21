import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SOUND_DRAG_MIME, SoundRow, type SoundRowProps } from "./SoundRow";

const dragData = { source: "bank", name: "bd", bank: "RolandTR909" } as const;

function setup(overrides: Partial<SoundRowProps> = {}) {
  const onPreview = vi.fn();
  render(
    <ul>
      <SoundRow code="bd" friendly="Bass drum" mode="guided" onPreview={onPreview} dragData={dragData} {...overrides} />
    </ul>,
  );
  return { onPreview, row: screen.getByRole("listitem") };
}

describe("SoundRow", () => {
  it("should be a list item described as a draggable sound", () => {
    // Arrange / Act
    const { row } = setup();

    // Assert
    expect(row).toHaveAttribute("aria-roledescription", "draggable sound");
    expect(row).toHaveAttribute("draggable", "true");
  });

  it("should put the friendly name first in guided mode", () => {
    // Arrange / Act
    const { row } = setup({ mode: "guided" });

    // Assert
    expect(row).toHaveTextContent("Bass drumbd");
  });

  it("should put the code first in pro mode", () => {
    // Arrange / Act
    const { row } = setup({ mode: "pro" });

    // Assert
    expect(row).toHaveTextContent("bdBass drum");
  });

  it("should call onPreview from the preview button, named for the sound", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onPreview } = setup();

    // Act
    await user.click(screen.getByRole("button", { name: "Preview Bass drum" }));

    // Assert
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("should offer to stop the preview while previewing", () => {
    // Arrange / Act
    setup({ previewing: true });

    // Assert
    expect(screen.getByRole("button", { name: "Stop preview of Bass drum" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview Bass drum" })).not.toBeInTheDocument();
  });

  it("should preview with Space when the row has focus", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onPreview, row } = setup();
    row.focus();

    // Act
    await user.keyboard(" ");

    // Assert
    expect(row).toHaveFocus();
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("should insert with Enter when the row has focus", async () => {
    // Arrange
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const { row } = setup({ onInsert });
    row.focus();

    // Act
    await user.keyboard("{Enter}");

    // Assert
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it("should not insert or double-preview when the preview button has focus", async () => {
    // Arrange
    const user = userEvent.setup();
    const onInsert = vi.fn();
    const { onPreview } = setup({ onInsert });
    screen.getByRole("button", { name: "Preview Bass drum" }).focus();

    // Act
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    // Assert
    expect(onInsert).not.toHaveBeenCalled();
    expect(onPreview).toHaveBeenCalledTimes(2);
  });

  it("should put the sound payload on the dataTransfer when dragged", () => {
    // Arrange
    const { row } = setup();
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (type: string, value: string) => data.set(type, value),
      effectAllowed: "",
    };

    // Act
    fireEvent.dragStart(row, { dataTransfer });

    // Assert
    expect(JSON.parse(data.get(SOUND_DRAG_MIME) ?? "null")).toEqual({ source: "bank", name: "bd", bank: "RolandTR909" });
    expect(dataTransfer.effectAllowed).toBe("copy");
  });

  it("should mark an active row", () => {
    // Arrange / Act
    const { row } = setup({ active: true });

    // Assert
    expect(row).toHaveAttribute("data-active");
  });

  it("should forward the ref and merge className", () => {
    // Arrange
    const ref = createRef<HTMLLIElement>();

    // Act
    render(
      <ul>
        <SoundRow ref={ref} className="extra" code="bd" friendly="Bass drum" mode="guided" onPreview={() => {}} dragData={dragData} />
      </ul>,
    );

    // Assert
    expect(ref.current).toBe(screen.getByRole("listitem"));
    expect(ref.current).toHaveClass("extra");
  });
});
