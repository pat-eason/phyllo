import { buildStarterProject, createSequentialIdGenerator, serializeProject } from "@phyllo/model";
import type { Project } from "@phyllo/model";
import type { NativeApi } from "../native/api";
import { createBrowserApi } from "../native/browser";
import { createAppStores } from "./createAppStores";
import type { AppDeps, AppStores } from "./createAppStores";
import { createFakeEngine } from "./fakeEngine";
import type { FakeEngine, FakeEngineOptions } from "./fakeEngine";
import { timerFrameScheduler } from "./feed";

/** Fixed timestamp used by fixtures (2026-10-21 12:00 UTC). */
export const FIXTURE_NOW = "2026-10-21T12:00:00.000Z";

/** The House starter with a fixed id and timestamps (readable track ids: `kick`, `hats`, …). */
export function fixtureProject(overrides: Partial<Project> = {}): Project {
  return { ...buildStarterProject("house", { now: FIXTURE_NOW }), id: "prj_fixture", ...overrides };
}

/** An in-memory browser `NativeApi` (no localStorage, no MIDI, silent logs). */
export function createMockNative(): NativeApi {
  return createBrowserApi({ storage: null, requestMidiAccess: null, log: () => {} });
}

/** Writes projects into a (browser) NativeApi's library; resolves with their paths in order. */
export async function seedLibrary(native: NativeApi, projects: readonly Project[]): Promise<string[]> {
  const paths: string[] = [];
  for (const project of projects) {
    const path = await native.projectNewPath(project.name);
    await native.projectWrite(path, serializeProject(project));
    paths.push(path);
  }
  return paths;
}

export interface MockStoresOptions extends Partial<Omit<AppDeps, "engineFactory">> {
  /** Options for the fake engine (ignored when `engine` is given). */
  engineOptions?: FakeEngineOptions;
  engine?: FakeEngine;
}

export interface MockStores extends AppStores {
  /** The fake engine behind `engineHost` (created eagerly so tests can inspect it). */
  fakeEngine: FakeEngine;
}

/**
 * App stores for stories and tests: fake engine (ready, deterministic), in-memory browser NativeApi,
 * timer-based frame loop (drive with fake timers), sequential ids, no cross-window channel, the House fixture.
 * Call `dispose()` when done.
 */
export function createMockStores(overrides: MockStoresOptions = {}): MockStores {
  const { engineOptions, engine, ...deps } = overrides;
  const fakeEngine = engine ?? createFakeEngine({ ready: true, ...engineOptions });
  const stores = createAppStores({
    native: createMockNative(),
    scheduler: timerFrameScheduler(),
    settingsChannel: null,
    newId: createSequentialIdGenerator(),
    initialProject: fixtureProject(),
    onError: () => {},
    ...deps,
    engineFactory: () => fakeEngine,
  });
  return { ...stores, fakeEngine };
}
