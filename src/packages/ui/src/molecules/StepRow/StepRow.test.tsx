import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, Profiler } from "react";
import { describe, expect, it, vi } from "vitest";
import { StepRow, type StepRowHandle, type StepRowProps } from "./StepRow";

const KICK = [..."x...x...x...x..."].map((c) => c === "x");

function renderRow(props: Partial<StepRowProps> = {}) {
  const handlers = { onToggleStep: vi.fn(), onSelect: vi.fn() };
  const ref = createRef<StepRowHandle>();
  const utils = render(
    <div role="grid">
      <StepRow ref={ref} sound="bd" label="Kick" color="#7FD98A" steps={KICK} mini="bd*4" selected={false} {...handlers} {...props} />
    </div>,
  );
  return { ...utils, ...handlers, ref };
}

const cell = (n: number) => screen.getByRole("button", { name: `Kick step ${n}` });

describe("StepRow", () => {
  it("should make the cells one tab stop that follows focus", async () => {
    // Arrange
    const user = userEvent.setup();
    renderRow();

    // Act
    cell(5).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    // Assert
    expect(cell(7)).toHaveFocus();
    expect(cell(7)).toHaveAttribute("tabindex", "0");
    expect(cell(1)).toHaveAttribute("tabindex", "-1");
    expect(cell(5)).toHaveAttribute("tabindex", "-1");
  });

  it("should move to the ends with Home and End and stop at them", async () => {
    // Arrange
    const user = userEvent.setup();
    renderRow();
    cell(3).focus();

    // Act
    await user.keyboard("{End}{ArrowRight}");
    const atEnd = document.activeElement;
    await user.keyboard("{Home}{ArrowLeft}");

    // Assert
    expect(atEnd).toBe(cell(16));
    expect(cell(1)).toHaveFocus();
  });

  it("should audition the row's sound from a separate Preview button", async () => {
    // Arrange
    const user = userEvent.setup();
    const onPreview = vi.fn();
    const { onSelect } = renderRow({ onPreview });

    // Act
    await user.click(screen.getByRole("button", { name: "Preview Kick" }));

    // Assert
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should not render a Preview button without onPreview", () => {
    // Arrange / Act
    renderRow();

    // Assert
    expect(screen.queryByRole("button", { name: "Preview Kick" })).not.toBeInTheDocument();
  });

  it("should render a row of 16 step cells plus label and output cells", () => {
    // Arrange / Act
    renderRow();

    // Assert
    const row = screen.getByRole("row");
    expect(within(row).getAllByRole("gridcell")).toHaveLength(18);
    expect(within(row).getAllByRole("button", { name: /^Kick step/ })).toHaveLength(16);
    expect(cell(1)).toHaveAttribute("aria-pressed", "true");
    expect(cell(2)).toHaveAttribute("aria-pressed", "false");
    expect(row).toHaveTextContent("bd*4");
  });

  it("should tint the first step of each beat", () => {
    // Arrange / Act
    renderRow();

    // Assert
    expect([1, 5, 9, 13].every((n) => cell(n).hasAttribute("data-beat"))).toBe(true);
    expect(cell(2)).not.toHaveAttribute("data-beat");
  });

  it("should show an em dash when the row writes nothing", () => {
    // Arrange / Act
    renderRow({ steps: new Array<boolean>(16).fill(false), mini: null });

    // Assert
    expect(within(screen.getByRole("row")).getByText("—")).toBeInTheDocument();
  });

  it("should select through the label button and reflect selection", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSelect, rerender } = renderRow();
    const label = screen.getByRole("button", { name: "Kick, bd" });

    // Act
    await user.click(label);
    rerender(
      <div role="grid">
        <StepRow sound="bd" label="Kick" color="#7FD98A" steps={KICK} mini="bd*4" selected onToggleStep={() => {}} onSelect={() => {}} />
      </div>,
    );

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Kick, bd" })).toHaveAttribute("aria-pressed", "true");
  });

  it("should toggle a step with a click when paint handlers are absent", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onToggleStep } = renderRow();

    // Act
    await user.click(cell(3));

    // Assert
    expect(onToggleStep).toHaveBeenCalledWith(2);
  });

  it("should toggle a step from the keyboard", async () => {
    // Arrange
    const user = userEvent.setup();
    const onPaintStart = vi.fn();
    const { onToggleStep } = renderRow({ onPaintStart });
    cell(5).focus();

    // Act
    await user.keyboard(" ");

    // Assert
    expect(onToggleStep).toHaveBeenCalledWith(4);
    expect(onPaintStart).not.toHaveBeenCalled();
  });

  it("should paint with the opposite of the first cell across entered cells", async () => {
    // Arrange
    const user = userEvent.setup();
    const onPaintStart = vi.fn();
    const onPaintEnter = vi.fn();
    const { onToggleStep } = renderRow({ onPaintStart, onPaintEnter });

    // Act
    await user.pointer([{ keys: "[MouseLeft>]", target: cell(2) }, { target: cell(3) }, { target: cell(4) }, { keys: "[/MouseLeft]" }]);
    await user.pointer({ target: cell(6) });

    // Assert
    expect(onPaintStart).toHaveBeenCalledWith(1, true);
    expect(onPaintEnter.mock.calls).toEqual([[2], [3]]);
    expect(onToggleStep).not.toHaveBeenCalled();
  });

  it("should move the current-step highlight through the ref without re-rendering", () => {
    // Arrange
    const renders = vi.fn();
    const ref = createRef<StepRowHandle>();
    render(
      <Profiler id="row" onRender={renders}>
        <div role="grid">
          <StepRow ref={ref} sound="bd" label="Kick" color="#7FD98A" steps={KICK} mini="bd*4" selected={false} onToggleStep={() => {}} onSelect={() => {}} />
        </div>
      </Profiler>,
    );
    renders.mockClear();

    // Act
    act(() => ref.current?.setCurrentStep(4));
    const first = cell(5).hasAttribute("data-playing");
    act(() => ref.current?.setCurrentStep(5));

    // Assert
    expect(first).toBe(true);
    expect(cell(5)).not.toHaveAttribute("data-playing");
    expect(cell(6)).toHaveAttribute("data-playing");
    expect(renders).not.toHaveBeenCalled();
  });

  it("should clear the highlight with null and expose the row element", () => {
    // Arrange
    const { ref } = renderRow({ playingStep: 2 });
    const before = cell(3).hasAttribute("data-playing");

    // Act
    act(() => ref.current?.setCurrentStep(null));

    // Assert
    expect(before).toBe(true);
    expect(screen.queryAllByRole("button").some((b) => b.hasAttribute("data-playing"))).toBe(false);
    expect(ref.current?.element).toBe(screen.getByRole("row"));
  });

  it("should keep the highlight when the row re-renders with new steps", () => {
    // Arrange
    const { ref, rerender } = renderRow();
    act(() => ref.current?.setCurrentStep(7));

    // Act
    rerender(
      <div role="grid">
        <StepRow ref={ref} sound="bd" label="Kick" color="#7FD98A" steps={new Array<boolean>(16).fill(true)} mini="bd*16" selected onToggleStep={() => {}} onSelect={() => {}} />
      </div>,
    );

    // Assert
    expect(cell(8)).toHaveAttribute("data-playing");
  });
});
