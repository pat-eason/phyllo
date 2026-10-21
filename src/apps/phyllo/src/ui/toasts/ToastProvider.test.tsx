import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@phyllo/ui";
import { ToastProvider } from "./ToastProvider";
import { useToasts } from "./toastContext";
import type { ToastApi } from "./toastContext";

interface ProbeProps {
  onApi(api: ToastApi): void;
}

function Probe({ onApi }: ProbeProps) {
  const toasts = useToasts();
  useEffect(() => {
    onApi(toasts);
  }, [onApi, toasts]);
  return null;
}

function renderHost(): ToastApi {
  let api: ToastApi | undefined;
  render(
    <ThemeProvider mode="dark" accent="green">
      <ToastProvider>
        <Probe onApi={(value) => {
            api = value;
          }} />
      </ToastProvider>
    </ThemeProvider>,
  );
  if (!api) throw new Error("probe did not render");
  return api;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("should announce a pushed toast as a status with its title, body and action", async () => {
    // Arrange
    const user = userEvent.setup();
    const onReveal = vi.fn();
    const toasts = renderHost();

    // Act
    act(() => {
      toasts.push({ title: "Saved take.wav", body: "0:12 · 24-bit WAV", action: { label: "Reveal", onClick: onReveal } });
    });
    await user.click(screen.getByRole("button", { name: "Reveal" }));

    // Assert
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Saved take.wav");
    expect(toast).toHaveTextContent("0:12 · 24-bit WAV");
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it("should announce an error as an alert that stays until dismissed", async () => {
    // Arrange
    vi.useFakeTimers();
    const toasts = renderHost();

    // Act
    act(() => {
      toasts.push({ title: "Couldn't save", tone: "error" });
    });
    act(() => vi.advanceTimersByTime(60_000));

    // Assert
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save");
    act(() => screen.getByRole("button", { name: "Dismiss" }).click());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should dismiss a neutral toast after its duration", () => {
    // Arrange
    vi.useFakeTimers();
    const toasts = renderHost();

    // Act
    act(() => {
      toasts.push({ title: "Imported 2 grooves", duration: 1000 });
    });
    const before = screen.queryByRole("status");
    act(() => vi.advanceTimersByTime(1100));

    // Assert
    expect(before).not.toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("should stack newest first, show three at a time and reveal the rest as room opens", () => {
    // Arrange
    vi.useFakeTimers();
    const toasts = renderHost();

    // Act
    act(() => {
      for (const n of [1, 2, 3, 4]) toasts.push({ title: `Toast ${n}`, duration: n === 4 ? 1000 : 60_000 });
    });

    // Assert
    const shown = () => screen.getAllByRole("status").map((toast) => within(toast).getByText(/^Toast/).textContent);
    expect(shown()).toEqual(["Toast 4", "Toast 3", "Toast 2"]);
    act(() => vi.advanceTimersByTime(1100));
    expect(shown()).toEqual(["Toast 3", "Toast 2", "Toast 1"]);
  });

  it("should replace a toast pushed again with the same key", () => {
    // Arrange
    const toasts = renderHost();

    // Act
    act(() => {
      toasts.push({ title: "Take 1", key: "rec" });
      toasts.push({ title: "Take 2", key: "rec" });
    });

    // Assert
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Take 2");
  });

  it("should dismiss by id", () => {
    // Arrange
    const toasts = renderHost();
    let id = 0;
    act(() => {
      id = toasts.push({ title: "Gone soon" });
    });

    // Act
    act(() => toasts.dismiss(id));

    // Assert
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
