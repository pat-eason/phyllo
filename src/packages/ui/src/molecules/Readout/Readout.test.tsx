import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Readout, type ReadoutCell, type ReadoutSubscribe } from "./Readout";

const cells: ReadoutCell[] = [
  { id: "position", value: "13.2.1", caption: "BAR · BEAT · 16TH", mono: true, minWidth: 112 },
  { id: "bpm", value: "120", caption: "BPM · TAP", mono: true },
  { id: "key", value: "C minor", caption: "KEY · 4/4" },
  { id: "cycle", value: "12.25", caption: "CYCLE", mono: true },
];

const bpm = (onEdit: (v: string) => void): ReadoutCell[] => [
  { id: "bpm", value: "120", caption: "BPM · TAP", label: "Tempo", onEdit },
];

describe("Readout", () => {
  it("should render every cell's value and caption", () => {
    // Arrange / Act
    render(<Readout cells={cells} />);

    // Assert
    for (const cell of cells) {
      expect(screen.getByText(cell.value)).toBeInTheDocument();
      expect(screen.getByText(cell.caption)).toBeInTheDocument();
    }
  });

  it("should apply minWidth to its cell", () => {
    // Arrange / Act
    render(<Readout cells={cells} />);

    // Assert
    expect(screen.getByText("13.2.1").parentElement).toHaveStyle({ minWidth: "112px" });
  });

  it("should keep non-interactive cells out of the button list and not announce position live", () => {
    // Arrange / Act
    render(<Readout cells={cells} />);

    // Assert
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("13.2.1").parentElement).toHaveAttribute("aria-live", "off");
  });

  it("should render a button that calls onActivate when a cell is activatable", async () => {
    // Arrange
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Readout cells={[{ id: "bpm", value: "120", caption: "BPM · TAP", label: "Tempo 120 BPM, edit", onActivate }]} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Tempo 120 BPM, edit" }));

    // Assert
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("should activate from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const onActivate = vi.fn();
    render(<Readout cells={[{ id: "key", value: "C minor", caption: "KEY · 4/4", onActivate }]} />);

    // Act
    await user.tab();
    await user.keyboard("{Enter}");

    // Assert
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("should swap the value for an input and commit the typed text on Enter", async () => {
    // Arrange
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Readout cells={bpm(onEdit)} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Tempo" }));
    await user.keyboard("128{Enter}");

    // Assert
    expect(onEdit).toHaveBeenCalledWith("128");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should commit on blur", async () => {
    // Arrange
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Readout cells={bpm(onEdit)} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Tempo" }));
    await user.keyboard("90");
    await user.tab();

    // Assert
    expect(onEdit).toHaveBeenCalledWith("90");
  });

  it("should cancel on Escape without calling onEdit", async () => {
    // Arrange
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Readout cells={bpm(onEdit)} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Tempo" }));
    await user.keyboard("999{Escape}");

    // Assert
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("should not call onEdit when the value is unchanged", async () => {
    // Arrange
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<Readout cells={bpm(onEdit)} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Tempo" }));
    await user.keyboard("{Enter}");

    // Assert
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("should call onNudge with ±1 for Arrow Up and Arrow Down", async () => {
    // Arrange
    const user = userEvent.setup();
    const onNudge = vi.fn();
    render(<Readout cells={[{ id: "bpm", value: "120", caption: "BPM", label: "Tempo", onActivate: () => {}, onNudge }]} />);

    // Act
    await user.tab();
    await user.keyboard("{ArrowUp}{ArrowDown}");

    // Assert
    expect(onNudge).toHaveBeenNthCalledWith(1, 1);
    expect(onNudge).toHaveBeenNthCalledWith(2, -1);
  });

  it("should nudge on wheel and prevent page scroll", () => {
    // Arrange
    const onNudge = vi.fn();
    render(<Readout cells={[{ id: "bpm", value: "120", caption: "BPM", label: "Tempo", onActivate: () => {}, onNudge }]} />);
    const button = screen.getByRole("button", { name: "Tempo" });

    // Act
    const up = new WheelEvent("wheel", { deltaY: -10, bubbles: true, cancelable: true });
    button.dispatchEvent(up);
    button.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, bubbles: true, cancelable: true }));

    // Assert
    expect(onNudge).toHaveBeenNthCalledWith(1, 1);
    expect(onNudge).toHaveBeenNthCalledWith(2, -1);
    expect(up.defaultPrevented).toBe(true);
  });

  it("should write pushed text straight to the DOM without re-rendering", () => {
    // Arrange
    let push: (text: string) => void = () => {};
    const unsubscribe = vi.fn();
    const subscribe: ReadoutSubscribe = (write) => {
      push = write;
      return unsubscribe;
    };
    const { unmount } = render(<Readout cells={[{ id: "position", value: "1.1.1", caption: "POS", subscribe }]} />);
    expect(screen.getByText("1.1.1")).toBeInTheDocument();

    // Act
    act(() => push("2.3.4"));

    // Assert
    expect(screen.getByText("2.3.4")).toBeInTheDocument();
    expect(screen.queryByText("1.1.1")).not.toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should keep the pushed text across a re-render with the same value", () => {
    // Arrange
    let push: (text: string) => void = () => {};
    const subscribe: ReadoutSubscribe = (write) => {
      push = write;
      return () => {};
    };
    const cell: ReadoutCell = { id: "position", value: "1.1.1", caption: "POS", subscribe };
    const { rerender } = render(<Readout cells={[cell]} />);
    act(() => push("5.1.1"));

    // Act
    rerender(<Readout cells={[{ ...cell }]} />);

    // Assert
    expect(screen.getByText("5.1.1")).toBeInTheDocument();
  });
});
