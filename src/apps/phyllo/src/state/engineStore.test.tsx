import { createTrack } from "@phyllo/model";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEngine, useProject } from "../hooks";
import type { MockStores } from "./mocks";
import { PINNED_NOW, renderWithStores } from "./testUtils";

function CodeView() {
  const { code, scope, setScope, status, trackErrors } = useEngine();
  const { dispatch } = useProject();
  return (
    <div>
      <pre aria-label="Code">{code}</pre>
      <output aria-label="Scope">{scope}</output>
      <output aria-label="Status">{status.ok ? "ok" : (status.error?.message ?? "error")}</output>
      <output aria-label="Errored tracks">{Object.keys(trackErrors).join(",") || "none"}</output>
      <button type="button" onClick={() => dispatch({ type: "track/setMute", trackId: "kick", mute: true })}>
        Mute kick
      </button>
      <button type="button" onClick={() => dispatch({ type: "track/setSolo", trackId: "bass", solo: true })}>
        Solo bass
      </button>
      <button type="button" onClick={() => setScope("section")}>
        This section
      </button>
    </div>
  );
}

const codeText = () => screen.getByLabelText("Code").textContent ?? "";
/** `$:` / `_$:` label of each block, in track order. */
const blockLabels = () =>
  codeText()
    .split("\n")
    .filter((l) => /^_?\$:/.test(l))
    .map((l) => l.slice(0, l.indexOf(":") + 1));

let stores: MockStores | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PINNED_NOW);
});
afterEach(() => {
  stores?.dispose();
  stores = undefined;
  vi.useRealTimers();
});

describe("engineStore", () => {
  it("should show the mute in the code within 100 ms", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<CodeView />));

    // Act
    await user.click(screen.getByRole("button", { name: "Mute kick" }));
    await act(() => vi.advanceTimersByTimeAsync(100));

    // Assert
    expect(blockLabels()).toEqual(["_$:", "$:", "$:", "$:"]);
    expect(codeText()).toContain('_$: arrange(\n     [4, silence],\n     [12, s("bd*4")');
  });

  it("should mute every non-soloed track in the code within 100 ms of a solo", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<CodeView />));

    // Act
    await user.click(screen.getByRole("button", { name: "Solo bass" }));
    await act(() => vi.advanceTimersByTimeAsync(100));

    // Assert
    expect(blockLabels()).toEqual(["_$:", "_$:", "_$:", "$:"]);
  });

  it("should debounce evaluation and evaluate the instrumented whole-song program", async () => {
    // Arrange
    ({ stores } = renderWithStores(<CodeView />));
    await act(() => vi.advanceTimersByTimeAsync(100));
    const evaluatedBefore = stores.fakeEngine.evaluations.length;
    const { dispatch } = stores.project.getState();

    // Act
    act(() => {
      dispatch({ type: "track/setParam", trackId: "bass", param: "lpf", value: 1200 });
      dispatch({ type: "track/setParam", trackId: "bass", param: "lpf", value: 1400 });
    });
    await act(() => vi.advanceTimersByTimeAsync(30));
    const midway = stores.fakeEngine.evaluations.length;
    await act(() => vi.advanceTimersByTimeAsync(50));

    // Assert
    expect(midway).toBe(evaluatedBefore);
    expect(stores.fakeEngine.evaluations).toHaveLength(evaluatedBefore + 1);
    const program = stores.fakeEngine.evaluations.at(-1);
    expect(program?.scope).toBe("song");
    expect(program?.code).toContain('.analyze("bass")');
    expect(program?.code).toContain(".lpf(1400)");
    expect(codeText()).not.toContain(".analyze(");
  });

  it("should not re-evaluate when only the selection changes", async () => {
    // Arrange
    ({ stores } = renderWithStores(<CodeView />));
    await act(() => vi.advanceTimersByTimeAsync(100));
    const evaluatedBefore = stores.fakeEngine.evaluations.length;

    // Act
    act(() => stores?.project.getState().dispatch({ type: "ui/select", trackId: "bass" }));
    await act(() => vi.advanceTimersByTimeAsync(100));

    // Assert
    expect(stores.fakeEngine.evaluations).toHaveLength(evaluatedBefore);
  });

  it("should render only the section at the loop start in section scope", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<CodeView />));
    expect(codeText()).toContain("arrange(");

    // Act
    await user.click(screen.getByRole("button", { name: "This section" }));

    // Assert
    expect(screen.getByRole("status", { name: "Scope" })).toHaveTextContent("section");
    expect(codeText()).not.toContain("arrange(");
    expect(codeText()).toContain('$: s("bd*4")');
  });

  it("should follow the playhead's section in section scope", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    ({ stores } = renderWithStores(<CodeView />));
    await user.click(screen.getByRole("button", { name: "This section" }));

    // Act: bar 18 is the Break, where only the bass plays
    act(() => stores?.transport.getState().seek(18));

    // Assert
    expect(codeText()).not.toContain('s("bd*4")');
    expect(codeText()).toContain('note("<a1 a1 c2 g1>*2")');
  });

  it("should attribute an evaluation error to its track and keep the code", async () => {
    // Arrange
    ({ stores } = renderWithStores(<CodeView />));
    const broken = createTrack("code", { id: "glitch", rawCode: "ERROR", existing: stores.project.getState().project.tracks });

    // Act
    act(() => stores?.project.getState().dispatch({ type: "track/add", track: broken }));
    await act(() => vi.advanceTimersByTimeAsync(100));

    // Assert
    expect(screen.getByRole("status", { name: "Status" })).toHaveTextContent("ERROR is not defined");
    expect(screen.getByRole("status", { name: "Errored tracks" })).toHaveTextContent("glitch");
    expect(codeText()).toContain("ERROR");
  });
});
