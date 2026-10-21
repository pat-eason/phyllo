import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useSampleNames } from "../hooks";
import { createMockStores } from "./mocks";
import type { MockStores } from "./mocks";
import { observedEngine, withFakeSamples } from "./nativeInputs.testkit";
import type { ObservedEngine } from "./nativeInputs.testkit";
import { mergeSampleScans } from "./sampleFolders";
import { renderWithStores } from "./testUtils";

const DRUMS = "/Users/pat/Samples";
const LOOPS = "/Volumes/Loops";

let stores: MockStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

function setup(folders: Record<string, readonly string[] | string>, linked: string[]) {
  const samples = withFakeSamples(folders);
  const observed = observedEngine();
  stores = createMockStores({ native: samples.native, engine: observed.engine, initialSettings: { sampleFolders: linked } });
  return { stores, samples, observed };
}

/** Every name → url the engine has been given, later registrations winning. */
function registeredMap(observed: ObservedEngine): Record<string, string[]> {
  return Object.assign({}, ...observed.registered) as Record<string, string[]>;
}

function SampleList() {
  const names = useSampleNames();
  return (
    <ul aria-label="Your samples">
      {names.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

describe("sampleFolders", () => {
  it("should register every linked folder's files with the engine under their names as asset URLs", async () => {
    // Arrange
    const { stores: s, observed } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`, `${DRUMS}/kick.aif`] }, [DRUMS]);
    await s.start();

    // Act
    s.engineHost.get();

    // Assert
    expect(registeredMap(observed)).toEqual({
      vox: ["asset://localhost/Users/pat/Samples/vox.wav"],
      kick: ["asset://localhost/Users/pat/Samples/kick.aif"],
    });
  });

  it("should register samples scanned after the engine already exists", async () => {
    // Arrange
    const { stores: s, observed } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`] }, [DRUMS]);
    s.engineHost.get();

    // Act
    await s.start();

    // Assert
    await waitFor(() => expect(registeredMap(observed)).toEqual({ vox: ["asset://localhost/Users/pat/Samples/vox.wav"] }));
  });

  it("should give names that collide across folders a numeric suffix in folder order", async () => {
    // Arrange
    const { stores: s } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`], [LOOPS]: [`${LOOPS}/vox.wav`, `${LOOPS}/pad.wav`] }, [DRUMS, LOOPS]);

    // Act
    await s.start();

    // Assert
    expect(s.samples.getState().samples).toEqual([
      { name: "vox", path: "/Users/pat/Samples/vox.wav", folder: DRUMS },
      { name: "vox2", path: "/Volumes/Loops/vox.wav", folder: LOOPS },
      { name: "pad", path: "/Volumes/Loops/pad.wav", folder: LOOPS },
    ]);
  });

  it("should skip suffixes another folder already uses when resolving a collision", () => {
    // Arrange
    const scans = [
      { path: "/a", files: [{ name: "vox", path: "/a/vox.wav", ext: "wav" }, { name: "vox2", path: "/a/vox2.wav", ext: "wav" }] },
      { path: "/b", files: [{ name: "vox", path: "/b/vox.wav", ext: "wav" }] },
    ];

    // Act
    const merged = mergeSampleScans(scans);

    // Assert
    expect(merged.map((s) => s.name)).toEqual(["vox", "vox2", "vox3"]);
  });

  it("should watch every linked folder and follow changes to the linked set", async () => {
    // Arrange
    const { stores: s, samples } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`], [LOOPS]: [`${LOOPS}/pad.wav`] }, [DRUMS]);
    await s.start();

    // Act
    act(() => s.settings.getState().set("sampleFolders", [DRUMS, LOOPS]));

    // Assert
    await waitFor(() => expect(s.samples.getState().names).toEqual(["vox", "pad"]));
    expect(samples.watched).toEqual([[DRUMS], [DRUMS, LOOPS]]);
  });

  it("should drop an unlinked folder's sounds from the list", async () => {
    // Arrange
    const { stores: s } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`], [LOOPS]: [`${LOOPS}/pad.wav`] }, [DRUMS, LOOPS]);
    await s.start();

    // Act
    act(() => s.settings.getState().set("sampleFolders", [LOOPS]));

    // Assert
    await waitFor(() => expect(s.samples.getState().names).toEqual(["pad"]));
  });

  it("should re-scan a folder the watcher reports and register only its new files", async () => {
    // Arrange
    const { stores: s, samples, observed } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`] }, [DRUMS]);
    await s.start();
    s.engineHost.get();
    samples.setFolder(DRUMS, [`${DRUMS}/vox.wav`, `${DRUMS}/snap.wav`]);

    // Act
    samples.changed(DRUMS);

    // Assert
    await waitFor(() => expect(s.samples.getState().names).toEqual(["vox", "snap"]));
    expect(observed.registered).toEqual([
      { vox: ["asset://localhost/Users/pat/Samples/vox.wav"] },
      { snap: ["asset://localhost/Users/pat/Samples/snap.wav"] },
    ]);
  });

  it("should keep the other folders and report the error when a folder can't be scanned", async () => {
    // Arrange
    const { stores: s } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`], [LOOPS]: "drive not mounted" }, [DRUMS, LOOPS]);

    // Act
    await s.start();

    // Assert
    expect(s.samples.getState().names).toEqual(["vox"]);
    expect(s.samples.getState().folders).toEqual([
      { path: DRUMS, names: ["vox"], error: null },
      { path: LOOPS, names: [], error: "drive not mounted" },
    ]);
  });

  it("should list the registered sound names through useSampleNames", async () => {
    // Arrange
    const { stores: s } = setup({ [DRUMS]: [`${DRUMS}/vox.wav`, `${DRUMS}/snap.wav`] }, [DRUMS]);

    // Act
    renderWithStores(<SampleList />, { stores: s });
    await act(() => s.start());

    // Assert
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["vox", "snap"]);
  });

  it("should not scan or watch anything when no folder is linked", async () => {
    // Arrange
    const { stores: s, samples } = setup({}, []);

    // Act
    await s.start();

    // Assert
    expect(samples.watched).toEqual([]);
    expect(s.samples.getState().names).toEqual([]);
  });
});
