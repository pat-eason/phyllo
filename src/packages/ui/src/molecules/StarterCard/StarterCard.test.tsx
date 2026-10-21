import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { HOUSE_PREVIEW } from "../_shared/punchcardFixtures";
import { StarterCard } from "./StarterCard";

function setup(props: Partial<ComponentProps<typeof StarterCard>> = {}) {
  const onSelect = vi.fn();
  const utils = render(
    <StarterCard
      name="House groove"
      description="Four on the floor with a sliding bass."
      bpm={124}
      trackCount={4}
      preview={HOUSE_PREVIEW}
      selected={false}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect, ...utils };
}

describe("StarterCard", () => {
  it("should render name, description and meta chips", () => {
    // Arrange / Act
    setup();

    // Assert
    expect(screen.getByText("House groove")).toBeInTheDocument();
    expect(screen.getByText("Four on the floor with a sliding bass.")).toBeInTheDocument();
    expect(screen.getByText("124 BPM")).toBeInTheDocument();
    expect(screen.getByText("4 tracks")).toBeInTheDocument();
  });

  it("should render Empty and singular track counts", () => {
    // Arrange / Act
    const { rerender, onSelect } = setup({ trackCount: "Empty" });

    // Assert
    expect(screen.getByText("Empty")).toBeInTheDocument();

    // Act
    rerender(
      <StarterCard name="n" description="d" bpm={90} trackCount={1} preview={HOUSE_PREVIEW} selected={false} onSelect={onSelect} />,
    );

    // Assert
    expect(screen.getByText("1 track")).toBeInTheDocument();
  });

  it.each([true, false])("should reflect selected=%s in aria-pressed", (selected) => {
    // Arrange / Act
    setup({ selected });

    // Assert
    expect(screen.getByRole("button", { name: /House groove/ })).toHaveAttribute("aria-pressed", String(selected));
  });

  it("should show the check only when selected", () => {
    // Arrange / Act
    const { container, rerender, onSelect } = setup({ selected: true });

    // Assert
    expect(container.querySelector("svg")).toBeInTheDocument();

    // Act
    rerender(
      <StarterCard name="n" description="d" bpm={90} trackCount={1} preview={HOUSE_PREVIEW} selected={false} onSelect={onSelect} />,
    );

    // Assert
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("should call onSelect on click, Enter and Space", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSelect } = setup();

    // Act
    await user.click(screen.getByRole("button"));
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    // Assert
    expect(onSelect).toHaveBeenCalledTimes(3);
  });

  it("should hide the preview from assistive tech", () => {
    // Arrange / Act
    const { container } = setup();

    // Assert
    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
    expect(screen.getByRole("button")).toHaveAccessibleName(/^House groove/);
  });

  it("should not select when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const { onSelect } = setup({ disabled: true });

    // Act
    await user.click(screen.getByRole("button"));

    // Assert
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("should pass native handlers such as double click and forward the ref", async () => {
    // Arrange
    const user = userEvent.setup();
    const onDoubleClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    setup({ onDoubleClick, ref });

    // Act
    await user.dblClick(screen.getByRole("button"));

    // Assert
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(screen.getByRole("button"));
  });
});
