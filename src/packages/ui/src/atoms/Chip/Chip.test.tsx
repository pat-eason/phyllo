import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("should render a filter chip as a toggle button with aria-pressed", () => {
    // Arrange / Act
    render(
      <>
        <Chip variant="filter" selected>
          TR-909
        </Chip>
        <Chip variant="filter">TR-808</Chip>
      </>,
    );

    // Assert
    expect(screen.getByRole("button", { name: "TR-909" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "TR-808" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should call onClick when a filter chip is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip variant="filter" onClick={onClick}>
        TR-808
      </Chip>,
    );

    // Act
    await user.click(screen.getByRole("button", { name: "TR-808" }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should activate a filter chip with Enter and Space", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip variant="filter" onClick={onClick}>
        TR-808
      </Chip>,
    );
    await user.tab();

    // Act
    await user.keyboard("{Enter} ");

    // Assert
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("should not call onClick or take focus when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip variant="filter" onClick={onClick} disabled>
        TR-808
      </Chip>,
    );

    // Act
    await user.click(screen.getByRole("button", { name: "TR-808" }));

    // Assert
    expect(screen.getByRole("button", { name: "TR-808" })).toBeDisabled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("should render a tag as static text, not a button", () => {
    // Arrange / Act
    render(
      <Chip variant="tag" color="var(--ph-track-5)" data-testid="tag">
        lo-fi
      </Chip>,
    );

    // Assert
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("tag").tagName).toBe("SPAN");
    expect(screen.getByText("lo-fi")).toBeInTheDocument();
  });

  it("should set the tag dot color from the color prop", () => {
    // Arrange / Act
    render(
      <Chip variant="tag" color="rgb(185, 162, 255)" data-testid="tag">
        lo-fi
      </Chip>,
    );

    // Assert
    expect(screen.getByTestId("tag").firstElementChild).toHaveStyle({ "--ph-chip-dot": "rgb(185, 162, 255)" });
  });

  it("should omit the dot when a tag has no color", () => {
    // Arrange / Act
    render(
      <Chip variant="tag" data-testid="tag">
        sketch
      </Chip>,
    );

    // Assert
    expect(screen.getByTestId("tag").childElementCount).toBe(0);
  });

  it("should name a removable chip Remove plus its text and call onRemove on click", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Chip variant="removable" onRemove={onRemove}>
        house
      </Chip>,
    );

    // Act
    await user.click(screen.getByRole("button", { name: "Remove house" }));

    // Assert
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("should let removeLabel override the removable accessible name", () => {
    // Arrange / Act
    render(
      <Chip variant="removable" onRemove={() => undefined} removeLabel="Remove filter house">
        house
      </Chip>,
    );

    // Assert
    expect(screen.getByRole("button", { name: "Remove filter house" })).toBeInTheDocument();
  });

  it("should remove on Backspace and Delete when focused", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Chip variant="removable" onRemove={onRemove}>
        house
      </Chip>,
    );
    await user.tab();

    // Act
    await user.keyboard("{Backspace}{Delete}");

    // Assert
    expect(onRemove).toHaveBeenCalledTimes(2);
  });

  it("should not remove on other keys", async () => {
    // Arrange
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <Chip variant="removable" onRemove={onRemove}>
        house
      </Chip>,
    );
    await user.tab();

    // Act
    await user.keyboard("a{ArrowRight}");

    // Assert
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("should render a code chip as a mono button without aria-pressed", async () => {
    // Arrange
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Chip variant="code" onClick={onClick}>
        supersaw
      </Chip>,
    );

    // Act
    await user.click(screen.getByRole("button", { name: "supersaw" }));

    // Assert
    expect(screen.getByRole("button", { name: "supersaw" })).not.toHaveAttribute("aria-pressed");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should render a meta chip as static text", () => {
    // Arrange / Act
    render(<Chip variant="meta">124 BPM</Chip>);

    // Assert
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("124 BPM")).toBeInTheDocument();
  });

  it("should forward ref, className and native props to the root", () => {
    // Arrange
    const ref = createRef<HTMLElement>();

    // Act
    render(
      <Chip ref={ref} variant="code" className="extra" draggable data-testid="chip">
        supersaw
      </Chip>,
    );

    // Assert
    const chip = screen.getByTestId("chip");
    expect(ref.current).toBe(chip);
    expect(chip).toHaveClass("extra");
    expect(chip).toHaveAttribute("draggable", "true");
  });

  it("should expose aria-pressed on a code chip only when selected is passed", () => {
    // Arrange / Act
    render(
      <>
        <Chip variant="code">supersaw</Chip>
        <Chip variant="code" selected>
          sawtooth
        </Chip>
        <Chip variant="code" selected={false}>
          square
        </Chip>
      </>,
    );

    // Assert
    expect(screen.getByRole("button", { name: "supersaw" })).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: "sawtooth" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "square" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should draw a selected code chip with the selected class", () => {
    // Arrange / Act
    render(
      <Chip variant="code" selected>
        sawtooth
      </Chip>,
    );

    // Assert
    expect(screen.getByRole("button", { name: "sawtooth" })).toHaveClass("selected");
  });

  it("should let the parent move focus in onRemove when the chip goes away", async () => {
    // Arrange
    const user = userEvent.setup();
    function Filters() {
      const [tags, setTags] = useState(["house", "techno"]);
      const nextRef = useRef<HTMLButtonElement>(null);
      return (
        <>
          {tags.map((tag) => (
            <Chip key={tag} variant="removable" onRemove={() => { setTags((current) => current.filter((t) => t !== tag)); nextRef.current?.focus(); }}>
              {tag}
            </Chip>
          ))}
          <button ref={nextRef} type="button">Add filter</button>
        </>
      );
    }
    render(<Filters />);

    // Act
    await user.click(screen.getByRole("button", { name: "Remove house" }));

    // Assert
    expect(screen.queryByRole("button", { name: "Remove house" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add filter" })).toHaveFocus();
  });
});
