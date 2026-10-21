import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { TipCard } from "./TipCard";

const body = (
  <>
    Turn <strong>Brightness</strong> on the right.
  </>
);

describe("TipCard", () => {
  it("should be a labelled Tip region with step text and a progressbar", () => {
    // Arrange / Act
    render(<TipCard step={3} total={5} title="Give the bass some movement" body={body} onDismiss={() => {}} />);

    // Assert
    expect(screen.getByRole("region", { name: "Tip" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Step 3 of 5" });
    expect(progress).toHaveAttribute("aria-valuenow", "3");
    expect(progress).toHaveAttribute("aria-valuemax", "5");
    expect(progress.querySelectorAll("[data-filled]")).toHaveLength(3);
    expect(progress.children).toHaveLength(5);
  });

  it("should render the title and body with control names emphasised", () => {
    // Arrange / Act
    render(<TipCard step={1} total={5} title="Give the bass some movement" body={body} onDismiss={() => {}} />);

    // Assert
    expect(screen.getByText("Give the bass some movement")).toBeInTheDocument();
    expect(screen.getByText("Brightness").tagName).toBe("STRONG");
  });

  it("should call onDismiss and onPrimary from their buttons", async () => {
    // Arrange
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onPrimary = vi.fn();
    render(<TipCard step={3} total={5} title="T" body={body} onDismiss={onDismiss} onPrimary={onPrimary} />);

    // Act
    await user.click(screen.getByRole("button", { name: "Hide tips" }));
    await user.click(screen.getByRole("button", { name: "Show me" }));

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("should operate from the keyboard in DOM order", async () => {
    // Arrange
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const onPrimary = vi.fn();
    render(<TipCard step={3} total={5} title="T" body={body} onDismiss={onDismiss} onPrimary={onPrimary} />);

    // Act
    await user.tab();
    await user.keyboard("{Enter}");
    await user.tab();
    await user.keyboard(" ");

    // Assert
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it("should use custom labels and omit the primary button without onPrimary", () => {
    // Arrange / Act
    render(<TipCard step={2} total={4} title="T" body={body} dismissLabel="Not now" primaryLabel="Go" onDismiss={() => {}} />);

    // Assert
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Go" })).not.toBeInTheDocument();
  });

  it("should announce text changes politely", () => {
    // Arrange / Act
    render(<TipCard step={3} total={5} title="Give the bass some movement" body={body} onDismiss={() => {}} />);

    // Assert
    expect(screen.getByText("Give the bass some movement").parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("should drop the progress bar in compact", () => {
    // Arrange / Act
    render(<TipCard compact step={3} total={5} title="T" body={body} onDismiss={() => {}} />);

    // Assert
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Step 3 of 5")).toBeInTheDocument();
  });

  it("should forward ref, className and native props to the root", () => {
    // Arrange
    const ref = createRef<HTMLElement>();

    // Act
    render(<TipCard ref={ref} className="extra" data-testid="tip" step={1} total={2} title="T" body="b" onDismiss={() => {}} />);

    // Assert
    expect(ref.current).toBe(screen.getByTestId("tip"));
    expect(ref.current).toHaveClass("extra");
  });
});
