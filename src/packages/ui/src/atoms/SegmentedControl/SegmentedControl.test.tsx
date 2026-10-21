import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl, type SegmentedControlProps } from "./SegmentedControl";

const OPTIONS = [
  { value: "sounds", label: "Sounds" },
  { value: "samples", label: "Samples" },
  { value: "starters", label: "Starters" },
];

/** Controlled wrapper so arrow-key moves are visible in the DOM. */
function Live(props: Partial<SegmentedControlProps<string>> & { initial?: string }) {
  const { initial = "sounds", onChange, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <SegmentedControl
      label="Library"
      options={OPTIONS}
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("SegmentedControl", () => {
  it("should be a radiogroup of radios named by label by default", () => {
    // Arrange / Act
    render(<Live />);

    // Assert
    expect(screen.getByRole("radiogroup", { name: "Library" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("should check only the selected option", () => {
    // Arrange / Act
    render(<Live initial="samples" />);

    // Assert
    expect(screen.getByRole("radio", { name: "Samples" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sounds" })).not.toBeChecked();
  });

  it("should call onChange with the value, not the event, when a segment is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Live onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("radio", { name: "Starters" }));

    // Assert
    expect(onChange).toHaveBeenCalledExactlyOnceWith("starters");
  });

  it("should not call onChange when the selected segment is clicked again", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Live onChange={onChange} />);

    // Act
    await user.click(screen.getByRole("radio", { name: "Sounds" }));

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should keep only the selected radio in the tab order", () => {
    // Arrange / Act
    render(<Live initial="samples" />);

    // Assert
    expect(screen.getByRole("radio", { name: "Samples" })).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("radio", { name: "Sounds" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: "Starters" })).toHaveAttribute("tabindex", "-1");
  });

  it("should move selection and focus with the arrow keys and wrap at both ends", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Live onChange={onChange} />);
    await user.tab();

    // Act
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Samples" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Sounds" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");

    // Assert
    expect(screen.getByRole("radio", { name: "Starters" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Starters" })).toHaveFocus();
    expect(onChange.mock.calls.map(([value]) => value)).toEqual(["samples", "starters", "sounds", "starters"]);
  });

  it("should jump to the first and last segment with Home and End", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Live initial="samples" />);
    await user.tab();

    // Act
    await user.keyboard("{End}");
    expect(screen.getByRole("radio", { name: "Starters" })).toBeChecked();
    await user.keyboard("{Home}");

    // Assert
    expect(screen.getByRole("radio", { name: "Sounds" })).toBeChecked();
  });

  it("should skip disabled segments when moving with the arrow keys", async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <Live
        options={[
          { value: "steps", label: "Steps" },
          { value: "roll", label: "Piano roll", disabled: true },
          { value: "code", label: "Code" },
        ]}
        initial="steps"
      />,
    );
    await user.tab();

    // Act
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(screen.getByRole("radio", { name: "Code" })).toBeChecked();
  });

  it("should not call onChange when a disabled segment is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Live onChange={onChange} options={[{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }]} initial="a" />);

    // Act
    await user.click(screen.getByRole("radio", { name: "B" }));

    // Assert
    expect(onChange).not.toHaveBeenCalled();
  });

  it("should leave the first segment reachable by Tab when value matches no option", () => {
    // Arrange / Act
    render(<SegmentedControl label="Library" options={OPTIONS} value="nope" onChange={() => {}} />);

    // Assert
    expect(screen.getByRole("radio", { name: "Sounds" })).not.toHaveAttribute("tabindex");
    expect(screen.getByRole("radio", { name: "Samples" })).toHaveAttribute("tabindex", "-1");
  });

  it("should render a tablist of tabs with aria-selected and aria-controls for tabs semantics", () => {
    // Arrange / Act
    render(
      <Live
        semantics="tabs"
        initial="samples"
        options={[
          { value: "sounds", label: "Sounds", controls: "panel-sounds" },
          { value: "samples", label: "Samples", controls: "panel-samples" },
        ]}
      />,
    );

    // Assert
    expect(screen.getByRole("tablist", { name: "Library" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Samples" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Sounds" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Sounds" })).toHaveAttribute("aria-controls", "panel-sounds");
  });

  it("should derive tab ids from the control id so panels can be labelled", () => {
    // Arrange / Act
    render(<Live semantics="tabs" id="lib" />);

    // Assert
    expect(screen.getByRole("tab", { name: "Samples" })).toHaveAttribute("id", "lib-tab-samples");
  });

  it("should move the selected tab with the arrow keys", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Live semantics="tabs" />);
    await user.tab();

    // Act
    await user.keyboard("{ArrowRight}");

    // Assert
    expect(screen.getByRole("tab", { name: "Samples" })).toHaveAttribute("aria-selected", "true");
  });

  it("should render a group of aria-pressed buttons for toggle semantics", () => {
    // Arrange / Act
    render(
      <Live
        semantics="toggle"
        label="Interface depth"
        initial="guided"
        options={[{ value: "guided", label: "Guided" }, { value: "pro", label: "Pro" }]}
      />,
    );

    // Assert
    expect(screen.getByRole("group", { name: "Interface depth" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guided" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pro" })).toHaveAttribute("aria-pressed", "false");
  });

  it("should keep every toggle button in the tab order and ignore arrow keys", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Live semantics="toggle" onChange={onChange} />);

    // Act
    await user.tab();
    await user.keyboard("{ArrowRight}");
    await user.tab();

    // Assert
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Samples" })).toHaveFocus();
  });

  it("should select a toggle button with Space", async () => {
    // Arrange
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Live semantics="toggle" onChange={onChange} />);

    // Act
    await user.tab();
    await user.tab();
    await user.keyboard(" ");

    // Assert
    expect(onChange).toHaveBeenCalledExactlyOnceWith("samples");
  });

  it("should name icon-only segments by ariaLabel", () => {
    // Arrange / Act
    render(
      <Live
        label="View"
        options={[
          { value: "grid", icon: "grid", ariaLabel: "Grid" },
          { value: "list", icon: "list", ariaLabel: "List" },
        ]}
        initial="grid"
      />,
    );

    // Assert
    expect(screen.getByRole("radio", { name: "Grid" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "List" })).toBeInTheDocument();
  });

  it("should expose tone, size and stretch for styling", () => {
    // Arrange / Act
    render(<Live tone="accent" size="sm" stretch data-testid="seg" />);

    // Assert
    const group = screen.getByTestId("seg");
    expect(group).toHaveAttribute("data-tone", "accent");
    expect(group).toHaveAttribute("data-size", "sm");
    expect(group).toHaveAttribute("data-stretch");
  });

  it("should forward className, native props and the ref to the group", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(<SegmentedControl ref={ref} label="Library" options={OPTIONS} value="sounds" onChange={() => {}} className="extra" data-testid="seg" />);

    // Assert
    const group = screen.getByTestId("seg");
    expect(group).toHaveClass("extra");
    expect(ref.current).toBe(group);
  });
});
