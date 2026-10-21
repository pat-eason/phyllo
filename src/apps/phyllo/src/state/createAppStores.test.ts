import { createSequentialIdGenerator } from "@phyllo/model";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineOptions } from "@phyllo/engine";
import { createAppStores } from "./createAppStores";
import type { AppStores } from "./createAppStores";
import { createFakeEngine } from "./fakeEngine";
import { timerFrameScheduler } from "./feed";
import { createMockNative, fixtureProject } from "./mocks";

let stores: AppStores | undefined;
afterEach(() => {
  stores?.dispose();
  stores = undefined;
});

function setup(sampleRate: number | null) {
  const created: EngineOptions[] = [];
  const onError = vi.fn();
  stores = createAppStores({
    native: createMockNative(),
    scheduler: timerFrameScheduler(),
    settingsChannel: null,
    newId: createSequentialIdGenerator(),
    initialProject: fixtureProject(),
    initialSettings: { audio: { sampleRate } },
    onError,
    engineFactory: (options) => {
      created.push(options);
      return createFakeEngine({ ready: true });
    },
  });
  stores.engineHost.get();
  return { created, onError, stores };
}

describe("createAppStores engine factory", () => {
  it("should create the engine at the sample rate from settings (B8)", () => {
    expect(setup(44100).created.map((o) => o.sampleRate)).toEqual([44100]);
  });

  it("should ask for the device default rate when the setting is Match device", () => {
    expect(setup(null).created.map((o) => o.sampleRate)).toEqual([null]);
  });

  it("should keep the running engine when the rate changes, so it applies at the next launch", () => {
    const { created, stores: s } = setup(null);
    s.settings.getState().set("audio", { sampleRate: 48000 });
    s.engineHost.get();
    expect(created).toHaveLength(1);
  });

  it("should forward engine warnings without doubling the [phyllo] tag (B19)", () => {
    const { created, onError } = setup(null);
    created[0]?.logger?.("[phyllo] offline render: failed", "warn");
    created[0]?.logger?.("[voicing] unknown chord", "error");
    created[0]?.logger?.("[phyllo] ready", "info");
    expect(onError.mock.calls).toEqual([
      ["offline render: failed", null],
      ["[voicing] unknown chord", null],
    ]);
  });
});
