import { formatPosition } from "@phyllo/model";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler, useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEngine, useTransport } from "../hooks";
import type { MockStores } from "./mocks";
import { PINNED_NOW, renderWithStores } from "./testUtils";

const renders = { header: 0 };
const countRender = () => {
  renders.header += 1;
};

/** Transport bar stand-in: the readout and meter write to the DOM from subscriptions. */
function TransportBar() {
  const { playing, play, stop, toggleLoop, loop, setBpm, bpm, subscribePosition, position } = useTransport();
  const { meterFor } = useEngine();
  const readout = useRef<HTMLSpanElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      subscribePosition((pos) => {
        if (readout.current) readout.current.textContent = formatPosition(pos);
      }),
    [subscribePosition],
  );
  useEffect(
    () =>
      meterFor("kick")((left) => {
        if (meter.current) meter.current.textContent = left.toFixed(2);
      }),
    [meterFor],
  );
  return (
    <div>
      <button type="button" onClick={() => void play()}>
        Play
      </button>
      <button type="button" onClick={stop}>
        Stop
      </button>
      <button type="button" onClick={toggleLoop}>
        Loop
      </button>
      <button type="button" onClick={() => setBpm(140)}>
        Tempo 140
      </button>
      <output aria-label="Playing">{playing ? "playing" : "stopped"}</output>
      <output aria-label="Loop">{loop.enabled ? `loop ${loop.startBar}–${loop.endBar}` : "loop off"}</output>
      <output aria-label="BPM">{bpm}</output>
      <output aria-label="Snapshot">{formatPosition(position)}</output>
      <span data-testid="readout" ref={readout} />
      <span data-testid="meter" ref={meter} />
    </div>
  );
}

let stores: MockStores | undefined;
beforeEach(() => {
  renders.header = 0;
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

describe("transportStore", () => {
  it("should start audio from the play click and then play", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<TransportBar />, { engineOptions: { ready: false } }));

    // Act
    await user.click(screen.getByRole("button", { name: "Play" }));

    // Assert
    expect(stores.fakeEngine.initCount).toBe(1);
    expect(screen.getByRole("status", { name: "Playing" })).toHaveTextContent("playing");
  });

  it("should leave transport stopped when audio can't start", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<TransportBar />, { engineOptions: { ready: false, initError: "Audio blocked" } }));

    // Act
    await user.click(screen.getByRole("button", { name: "Play" }));

    // Assert
    expect(screen.getByRole("status", { name: "Playing" })).toHaveTextContent("stopped");
    expect(stores.engine.getState().audioError).toBe("Audio blocked");
  });

  it("should push the playhead and meters to subscribers without re-rendering", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(
      <Profiler id="transport" onRender={countRender}>
        <TransportBar />
      </Profiler>,
    ));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await act(() => vi.advanceTimersByTimeAsync(100));
    const rendersWhilePlaying = renders.header;

    // Act: 124 BPM 4/4 = 0.517 bars/s, so 2.1 s after bar 1 is cycle 1.085.
    await act(() => vi.advanceTimersByTimeAsync(2000));

    // Assert
    expect(rendersWhilePlaying).toBeGreaterThan(0);
    expect(renders.header).toBe(rendersWhilePlaying);
    expect(screen.getByTestId("readout")).toHaveTextContent("2.1.2");
    expect(Number(screen.getByTestId("meter").textContent)).toBeGreaterThan(0);
    expect(screen.getByRole("status", { name: "Snapshot" })).toHaveTextContent("1.1.1");
  });

  it("should stop at the loop start and zero the meters", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<TransportBar />));
    await user.click(screen.getByRole("button", { name: "Play" }));
    await act(() => vi.advanceTimersByTimeAsync(3000));

    // Act
    await user.click(screen.getByRole("button", { name: "Stop" }));

    // Assert
    expect(screen.getByRole("status", { name: "Playing" })).toHaveTextContent("stopped");
    expect(screen.getByTestId("readout")).toHaveTextContent("9.1.1");
    expect(screen.getByTestId("meter")).toHaveTextContent("0.00");
  });

  it("should toggle the loop and set the tempo through the project", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<TransportBar />));

    // Act
    await user.click(screen.getByRole("button", { name: "Loop" }));
    await user.click(screen.getByRole("button", { name: "Tempo 140" }));

    // Assert
    expect(screen.getByRole("status", { name: "Loop" })).toHaveTextContent("loop off");
    expect(screen.getByRole("status", { name: "BPM" })).toHaveTextContent("140");
    expect(stores.project.getState().project.tempo.bpm).toBe(140);
    expect(stores.fakeEngine.loop.enabled).toBe(false);
  });

  it("should wrap the playhead inside the loop region", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<TransportBar />));
    act(() => stores?.transport.getState().seek(16));
    await user.click(screen.getByRole("button", { name: "Play" }));

    // Act: from bar 16, 3 s at 0.517 bars/s crosses the loop end (bar 16 ends) and wraps to bar 9.
    await act(() => vi.advanceTimersByTimeAsync(3000));

    // Assert
    const bar = Number(screen.getByTestId("readout").textContent?.split(".")[0]);
    expect(bar).toBeGreaterThanOrEqual(9);
    expect(bar).toBeLessThanOrEqual(10);
  });
});
