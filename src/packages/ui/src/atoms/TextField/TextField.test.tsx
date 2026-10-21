import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Kbd } from "../Kbd";
import { TextField, type TextFieldProps } from "./TextField";

function Harness(props: Partial<TextFieldProps> & { onValue?: (value: string) => void }) {
  const { onValue, value: initial = "", onChange: _ignored, ...rest } = props;
  const [value, setValue] = useState(initial);
  return (
    <TextField
      label="Name"
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

describe("TextField", () => {
  it("should expose the label as the accessible name even when visually hidden", () => {
    // Arrange / Act
    render(<Harness label="Search sounds" />);

    // Assert
    expect(screen.getByRole("textbox", { name: "Search sounds" })).toBeInTheDocument();
  });

  it("should show a visible label when labelPosition is top", () => {
    // Arrange / Act
    render(<Harness label="Groove name" labelPosition="top" />);

    // Assert
    expect(screen.getByText("Groove name")).toHaveClass("label");
  });

  it("should pass the new string value, not the event, to onChange", async () => {
    // Arrange
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);

    // Act
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "ab");

    // Assert
    expect(onValue).toHaveBeenNthCalledWith(1, "a");
    expect(onValue).toHaveBeenNthCalledWith(2, "ab");
  });

  it("should render a search variant as a searchbox", () => {
    // Arrange / Act
    render(<Harness variant="search" label="Search" />);

    // Assert
    expect(screen.getByRole("searchbox", { name: "Search" })).toHaveAttribute("type", "search");
  });

  it("should clear a search field on Escape", async () => {
    // Arrange
    const onValue = vi.fn();
    render(<Harness variant="search" label="Search" value="kick" onValue={onValue} />);

    // Act
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "{Escape}");

    // Assert
    expect(onValue).toHaveBeenCalledWith("");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("should not clear a plain field on Escape", async () => {
    // Arrange
    const onValue = vi.fn();
    render(<Harness value="kick" onValue={onValue} />);

    // Act
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "{Escape}");

    // Assert
    expect(onValue).not.toHaveBeenCalled();
  });

  it("should turn off spellcheck and autocapitalize for the code variant", () => {
    // Arrange / Act
    render(<Harness variant="code" label="Pattern" />);

    // Assert
    const input = screen.getByRole("textbox", { name: "Pattern" });
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("autocapitalize", "off");
  });

  it("should mark the field invalid and link the description", () => {
    // Arrange / Act
    render(<Harness invalid description="Name is required" />);

    // Assert
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Name is required");
  });

  it("should link a description without marking the field invalid", () => {
    // Arrange / Act
    render(<Harness description="Letters only" />);

    // Assert
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("Letters only");
  });

  it("should keep a caller-provided aria-describedby alongside the description", () => {
    // Arrange / Act
    render(
      <>
        <span id="extra">Extra hint</span>
        <Harness description="Letters only" aria-describedby="extra" />
      </>,
    );

    // Assert
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Extra hint Letters only");
  });

  it("should render the trailing slot", () => {
    // Arrange / Act
    render(<Harness variant="search" trailing={<Kbd keys={["⌘", "K"]} />} />);

    // Assert
    expect(screen.getByText("⌘K")).toBeInTheDocument();
  });

  it("should not accept input when disabled", async () => {
    // Arrange
    const onValue = vi.fn();
    render(<Harness disabled onValue={onValue} />);

    // Act
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "a");

    // Assert
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(onValue).not.toHaveBeenCalled();
  });

  it("should forward ref to the input and className to the wrapper", () => {
    // Arrange
    const ref = createRef<HTMLInputElement>();

    // Act
    const { container } = render(<TextField ref={ref} label="Name" value="" onChange={() => undefined} className="extra" data-testid="in" />);

    // Assert
    expect(ref.current).toBe(screen.getByTestId("in"));
    expect(container.firstElementChild).toHaveClass("extra");
  });
});
