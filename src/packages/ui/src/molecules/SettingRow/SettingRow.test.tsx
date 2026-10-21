import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { Switch } from "../../atoms/Switch";
import { SettingRow } from "./SettingRow";

function Example() {
  const [on, setOn] = useState(false);
  return (
    <SettingRow
      id="media-keys"
      title="Media keys control playback"
      help="Works in the background."
      control={<Switch checked={on} onChange={setOn} label="x" aria-labelledby="media-keys" />}
    />
  );
}

describe("SettingRow", () => {
  it("should render title, help and control", () => {
    // Arrange / Act
    render(<Example />);

    // Assert
    expect(screen.getByText("Media keys control playback")).toBeInTheDocument();
    expect(screen.getByText("Works in the background.")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
  });

  it("should let the title name the control through id", () => {
    // Arrange / Act
    render(<Example />);

    // Assert
    expect(screen.getByRole("switch", { name: "Media keys control playback" })).toBeInTheDocument();
    expect(screen.getByText("Media keys control playback")).toHaveAttribute("id", "media-keys");
  });

  it("should expose the help element as <id>-help", () => {
    // Arrange / Act
    render(<Example />);

    // Assert
    expect(screen.getByText("Works in the background.")).toHaveAttribute("id", "media-keys-help");
  });

  it("should operate its control", async () => {
    // Arrange
    const user = userEvent.setup();
    render(<Example />);

    // Act
    await user.click(screen.getByRole("switch"));

    // Assert
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("should omit help when not given", () => {
    // Arrange / Act
    render(<SettingRow id="a" title="Sample rate" control={<button type="button">44.1 kHz</button>} />);

    // Assert
    expect(document.getElementById("a-help")).toBeNull();
  });

  it("should generate a title id when none is passed", () => {
    // Arrange / Act
    render(<SettingRow title="Sample rate" control={<span>x</span>} />);

    // Assert
    expect(screen.getByText("Sample rate").id).not.toBe("");
  });

  it("should default divider on and allow turning it off", () => {
    // Arrange / Act
    const { rerender, container } = render(<SettingRow title="t" control={null} />);
    const root = container.firstElementChild;

    // Assert
    expect(root).toHaveAttribute("data-divider");

    // Act
    rerender(<SettingRow title="t" control={null} divider={false} />);

    // Assert
    expect(root).not.toHaveAttribute("data-divider");
  });

  it("should forward ref, className and native props to the root", () => {
    // Arrange
    const ref = createRef<HTMLDivElement>();

    // Act
    render(<SettingRow ref={ref} className="extra" data-testid="row" title="t" control={null} />);

    // Assert
    expect(ref.current).toBe(screen.getByTestId("row"));
    expect(ref.current).toHaveClass("extra");
  });
});
