import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select, type SelectOption, type SelectProps } from "./Select";

type Snap = "1/16" | "1/4" | "1";

const OPTIONS: SelectOption<Snap>[] = [
  { value: "1/16", label: "1/16" },
  { value: "1/4", label: "1 beat", description: "One quarter note" },
  { value: "1", label: "1 bar" },
];

function Harness(props: Partial<SelectProps<Snap>> & { onValue?: (value: Snap) => void }) {
  const { onValue, value: initial = "1/4", onChange: _ignored, ...rest } = props;
  const [value, setValue] = useState<Snap>(initial);
  return (
    <Select<Snap>
      label="Snap"
      options={OPTIONS}
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe("Select", () => {
  it("should expose a native combobox named by its label", () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    const select = screen.getByRole("combobox", { name: "Snap" });
    expect(select.tagName).toBe("SELECT");
  });

  it("should list every option with its label", () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["1/16", "1 beat", "1 bar"]);
  });

  it("should reflect the value prop as the selected option", () => {
    // Arrange / Act
    render(<Harness value="1" />);

    // Assert
    expect(screen.getByRole("combobox")).toHaveValue("1");
    expect(screen.getByRole("option", { name: "1 bar" })).toHaveProperty("selected", true);
  });

  it("should pass the option value, not the event, to onChange", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    // Act
    await user.selectOptions(screen.getByRole("combobox"), "1 bar");

    // Assert
    expect(onValue).toHaveBeenCalledTimes(1);
    expect(onValue).toHaveBeenCalledWith("1");
  });

  it("should be reachable with Tab", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Harness />);

    // Act
    await user.tab();

    // Assert
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("should show a visible label for the top and inline positions", () => {
    // Arrange / Act
    render(
      <>
        <Harness label="Top label" labelPosition="top" />
        <Harness label="Inline label" labelPosition="inline" />
      </>,
    );

    // Assert
    expect(screen.getByText("Top label")).toHaveClass("label");
    expect(screen.getByText("Inline label")).toHaveClass("inlineLabel");
  });

  it("should visually hide the label by default but keep it accessible", () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(screen.getByText("Snap")).toHaveClass("visuallyHidden");
    expect(screen.getByRole("combobox", { name: "Snap" })).toBeInTheDocument();
  });

  it("should surface an option description as its tooltip", () => {
    // Arrange / Act
    render(<Harness />);

    // Assert
    expect(screen.getByRole("option", { name: "1 beat" })).toHaveAttribute("title", "One quarter note");
  });

  it("should apply minWidth to the box", () => {
    // Arrange / Act
    render(<Harness minWidth={180} />);

    // Assert
    expect(screen.getByRole("combobox").parentElement).toHaveStyle({ minWidth: "180px" });
  });

  it("should not change when disabled", async () => {
    // Arrange
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness disabled onValue={onValue} />);

    // Act
    await user.selectOptions(screen.getByRole("combobox"), "1 bar");

    // Assert
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(onValue).not.toHaveBeenCalled();
  });

  it("should forward ref to the select and className to the wrapper", () => {
    // Arrange
    const ref = createRef<HTMLSelectElement>();

    // Act
    render(<Select<Snap> ref={ref} label="Snap" options={OPTIONS} value="1" onChange={() => undefined} className="extra" data-testid="sel" />);

    // Assert
    expect(ref.current).toBe(screen.getByTestId("sel"));
    expect(screen.getByTestId("sel").closest(".extra")).not.toBeNull();
  });

  it("should apply the 40 px size", () => {
    // Arrange / Act
    render(<Harness size={40} />);

    // Assert
    expect(screen.getByRole("combobox", { name: "Snap" }).parentElement).toHaveClass("s40");
  });
});
