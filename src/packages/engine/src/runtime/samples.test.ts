import { afterEach, describe, expect, it, vi } from "vitest";
import * as core from "@strudel/core";
import type { Pattern } from "@strudel/core";
import { mini } from "@strudel/mini";
import { samples } from "@strudel/webaudio";
import { collectSoundRequests, preloadSounds, registeredSampleUrls, soundKey, soundsInRange } from "./samples";

type Controls = Pattern & { bank(b: string): Pattern };
/** Strudel's `s` control (not in the ambient types). */
const s = (core as unknown as { s: (p: Pattern) => Controls }).s;
const drums = () => s(mini("bd sd bd:2 ~")).bank("RolandTR909");

/** Fake context: decodes anything into a marker object. */
const fakeCtx = () => ({ decodeAudioData: vi.fn(async () => ({ duration: 1 }) as unknown as AudioBuffer) }) as unknown as BaseAudioContext;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("soundKey", () => {
  it.each([
    [{ s: "bd" }, "bd"],
    [{ s: "bd", bank: "RolandTR909" }, "rolandtr909_bd"],
    [{ s: "Sawtooth" }, "sawtooth"],
    [{ s: "~" }, undefined],
    [{ note: "c3" }, undefined],
  ])("%j → %s", (value, key) => {
    expect(soundKey(value)).toBe(key);
  });
});

describe("collectSoundRequests", () => {
  it("lists each distinct sound/n once, skipping rests", () => {
    const reqs = collectSoundRequests(drums().queryArc(0, 2));
    expect(reqs.map((r) => [r.key, r.value["n"] ?? 0])).toEqual([
      ["rolandtr909_bd", 0],
      ["rolandtr909_sd", 0],
      ["rolandtr909_bd", 2],
    ]);
  });
});

describe("soundsInRange", () => {
  it("scans cycle by cycle and finds sounds that only appear later", () => {
    const pat = s(mini("<bd bd bd hh>")) as Pattern;
    expect(soundsInRange(pat, 0, 3, 0.5).map((r) => r.key)).toEqual(["bd"]);
    expect(soundsInRange(pat, 0, 4, 0.5).map((r) => r.key)).toEqual(["bd", "hh"]);
  });
});

describe("preloadSounds", () => {
  it("fetches the file superdough will play for each bank/sound/n", async () => {
    await samples({ RolandTR909_bd: ["bd/0.wav", "bd/1.wav", "bd/2.wav"], RolandTR909_sd: ["sd/0.wav"] }, "https://cdn.test/909/");
    const fetchMock = vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = fakeCtx();

    await preloadSounds(collectSoundRequests(drums().queryArc(0, 1)), ctx);

    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual([
      "https://cdn.test/909/bd/0.wav",
      "https://cdn.test/909/bd/2.wav",
      "https://cdn.test/909/sd/0.wav",
    ]);
  });

  it("ignores sounds that aren't registered samples (synths, unknown names)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await preloadSounds([{ key: "nosuchsound", value: { s: "nosuchsound" } }], fakeCtx());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("registeredSampleUrls", () => {
  it("returns the resolved URLs of user sample names", async () => {
    await samples({ vox: ["asset://localhost/vox.wav"], Kick: ["asset://localhost/kick.wav"] });
    expect(registeredSampleUrls(["vox", "Kick", "missing"])).toEqual(["asset://localhost/vox.wav", "asset://localhost/kick.wav"]);
  });
});
