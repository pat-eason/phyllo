/** Stories/tests: mock stores whose fake engine can "render" (the shared fake engine throws on renderOffline). */
import type { Project } from "@phyllo/model";
import { createBrowserApi } from "../../../native/browser";
import type { NativeApi } from "../../../native/api";
import { createFakeEngine } from "../../../state/fakeEngine";
import type { FakeEngine } from "../../../state/fakeEngine";
import { fixtureProject } from "../../../state/mocks";
import type { MockStoresOptions } from "../../../state/mocks";

/** 120 BPM 4/4: the 32-bar song is 1:04, the loop (bars 9–16) 0:16 — the mockup's numbers. */
export function exportProject(overrides: Partial<Project> = {}): Project {
  return fixtureProject({ tempo: { bpm: 120, beatsPerBar: 4 }, ...overrides });
}

/** Low-rate stereo buffer of the requested length (cheap to encode). */
function fakeBuffer(seconds: number): AudioBuffer {
  const sampleRate = 8000;
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const channels = [new Float32Array(frames).fill(0.2), new Float32Array(frames).fill(0.2)];
  const buffer = { numberOfChannels: 2, sampleRate, length: frames, duration: seconds, getChannelData: (c: number) => channels[c] };
  return buffer as unknown as AudioBuffer;
}

export type RenderMode = "instant" | "pending" | "manual";

export interface ExportFixture {
  engine: FakeEngine;
  native: NativeApi;
  /** For `manual`: resolve the pending render. */
  finishRender(): void;
}

/**
 * A ready fake engine whose `renderOffline` resolves at once (`instant`), never (`pending`, a story stuck mid-render)
 * or on `finishRender()` (`manual`), plus a browser NativeApi that swallows downloads.
 */
export function createExportFixture(mode: RenderMode = "instant"): ExportFixture {
  const engine = createFakeEngine({ ready: true });
  const native = createBrowserApi({ storage: null, requestMidiAccess: null, log: () => {}, download: () => {} });
  let release: (() => void) | undefined;
  engine.renderOffline = (_program, opts) => {
    const buffer = fakeBuffer((opts.toCycle - opts.fromCycle) * 2 + opts.tailSec);
    if (mode === "instant") return Promise.resolve(buffer);
    return new Promise<AudioBuffer>((resolve) => {
      if (mode === "manual") release = () => resolve(buffer);
    });
  };
  return { engine, native, finishRender: () => release?.() };
}

export function exportStoreOptions(fixture: ExportFixture, extra: MockStoresOptions = {}): MockStoresOptions {
  return { engine: fixture.engine, native: fixture.native, initialProject: exportProject(), ...extra };
}
