import { afterEach, describe, expect, it, vi } from "vitest";
import * as core from "@strudel/core";
import type { Pattern } from "@strudel/core";
import { mini } from "@strudel/mini";
import { samples } from "@strudel/webaudio";
import {
  DEFAULT_BANK_ALIASES,
  DEFAULT_SAMPLE_SOURCES,
  SOUNDFONT_BASE,
  collectSoundRequests,
  installUrlResolver,
  listBuiltInSoundUrls,
  preloadSounds,
  registeredSampleUrls,
  sampleMapFileUrls,
  soundKey,
  soundsInRange,
} from "./samples";

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

describe("installUrlResolver", () => {
  /** Serves JSON for `.json` URLs and bytes for everything else; records what actually reached the network. */
  const stubNetwork = () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);
      return {
        ok: true,
        json: async () => ({ resolvekit_bd: ["bd/0.wav", "bd/1.wav"], resolvekit_sd: ["sd/0.wav"] }),
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return calls;
  };
  const toLocal = (url: string) => url.replace("https://cdn.test/", "https://local.test/cache/");

  it("loads the sample-map JSON and each sample file from the resolved URL, never the original", async () => {
    const calls = stubNetwork();
    const uninstall = installUrlResolver(toLocal);
    try {
      await samples("https://cdn.test/kit/map.json", "https://cdn.test/kit/");
      await preloadSounds(
        [
          { key: "resolvekit_bd", value: { s: "resolvekit_bd", n: 1 } },
          { key: "resolvekit_sd", value: { s: "resolvekit_sd" } },
        ],
        fakeCtx(),
      );
    } finally {
      uninstall();
    }
    expect(calls).toEqual([
      "https://local.test/cache/kit/map.json",
      "https://local.test/cache/kit/bd/1.wav",
      "https://local.test/cache/kit/sd/0.wav",
    ]);
  });

  it("resolves soundfont-style script fetches too (any http(s) GET)", async () => {
    const calls = stubNetwork();
    const uninstall = installUrlResolver(toLocal);
    try {
      await fetch("https://cdn.test/webaudiofontdata/sound/0000_JCLive_sf2_file.js");
    } finally {
      uninstall();
    }
    expect(calls).toEqual(["https://local.test/cache/webaudiofontdata/sound/0000_JCLive_sf2_file.js"]);
  });

  it("awaits an async resolver", async () => {
    const calls = stubNetwork();
    const uninstall = installUrlResolver(async (url) => toLocal(url));
    try {
      await fetch("https://cdn.test/a.wav");
    } finally {
      uninstall();
    }
    expect(calls).toEqual(["https://local.test/cache/a.wav"]);
  });

  it("leaves non-http URLs, non-GET requests and Request objects alone", async () => {
    const calls = stubNetwork();
    const resolver = vi.fn(toLocal);
    const uninstall = installUrlResolver(resolver);
    try {
      await fetch("asset://localhost/a.wav");
      await fetch("ipc://localhost/cmd");
      await fetch("https://cdn.test/post", { method: "POST" });
      await fetch(new Request("https://cdn.test/request-object"));
    } finally {
      uninstall();
    }
    expect(resolver).not.toHaveBeenCalled();
    expect(calls).toEqual([
      "asset://localhost/a.wav",
      "ipc://localhost/cmd",
      "https://cdn.test/post",
      "https://cdn.test/request-object",
    ]);
  });

  it("falls back to the original URL when the resolver throws", async () => {
    const calls = stubNetwork();
    const uninstall = installUrlResolver(() => {
      throw new Error("cache unavailable");
    });
    try {
      await fetch("https://cdn.test/a.wav");
    } finally {
      uninstall();
    }
    expect(calls).toEqual(["https://cdn.test/a.wav"]);
  });

  it("restores fetch on uninstall, and a layer left under another wrapper stops resolving", async () => {
    const calls = stubNetwork();
    const before = globalThis.fetch;
    installUrlResolver(toLocal)();
    expect(globalThis.fetch).toBe(before);

    const first = installUrlResolver(toLocal);
    const second = installUrlResolver((url) => url.replace("https://cdn.test/", "https://other.test/"));
    first(); // uninstalled out of order: cannot restore past `second`, but must stop resolving
    await fetch("https://cdn.test/a.wav");
    second();
    expect(calls).toEqual(["https://other.test/a.wav"]);
  });
});

describe("sampleMapFileUrls", () => {
  it("joins the base with array files, note maps and bare strings, honouring per-entry _base", () => {
    const urls = sampleMapFileUrls(
      {
        _base: "ignored/",
        bd: ["bd/0.wav", "bd/1.wav"],
        piano: { _base: "https://piano.test/", A0: "A0.mp3", C1: ["C1.mp3", "C1b.mp3"] },
        one: "one.wav",
      },
      "https://cdn.test/kit/",
    );
    expect(urls).toEqual([
      "https://cdn.test/kit/bd/0.wav",
      "https://cdn.test/kit/bd/1.wav",
      "https://piano.test/A0.mp3",
      "https://piano.test/C1.mp3",
      "https://piano.test/C1b.mp3",
      "https://cdn.test/kit/one.wav",
    ]);
  });

  it("returns nothing for non-object documents", () => {
    expect(sampleMapFileUrls(null, "https://x/")).toEqual([]);
    expect(sampleMapFileUrls("nope", "https://x/")).toEqual([]);
  });
});

describe("listBuiltInSoundUrls", () => {
  const MAPS: Record<string, unknown> = {
    [DEFAULT_SAMPLE_SOURCES[0]!.map]: { _base: "https://elsewhere/", RolandTR909_bd: ["RolandTR909/bd/a.wav"] },
    [DEFAULT_SAMPLE_SOURCES[1]!.map]: { bd: ["bd/0.wav", "bd/1.wav"] },
    [DEFAULT_SAMPLE_SOURCES[2]!.map]: { piano: { A0: "A0v8.mp3" } },
    [DEFAULT_SAMPLE_SOURCES[3]!.map]: { bassdrum1: ["Membranophones/Bass%20Drum/hit.wav"] },
  };
  const fetchJson = async (url: string) => MAPS[url];

  it("lists the JSON documents, every file under each default base, and the instruments' first fonts", async () => {
    const urls = await listBuiltInSoundUrls({
      fetchJson,
      instruments: ["gm_piano", "gm_flute"],
      fontsFor: (name) => [`${name}_a`, `${name}_b`],
    });
    const [tidal, uzu, piano, vcsl] = DEFAULT_SAMPLE_SOURCES;
    expect(urls).toEqual([
      DEFAULT_BANK_ALIASES,
      tidal!.map,
      uzu!.map,
      piano!.map,
      vcsl!.map,
      `${tidal!.base}RolandTR909/bd/a.wav`,
      `${uzu!.base}bd/0.wav`,
      `${uzu!.base}bd/1.wav`,
      `${piano!.base}A0v8.mp3`,
      `${vcsl!.base}Membranophones/Bass%20Drum/hit.wav`,
      `${SOUNDFONT_BASE}/gm_piano_a.js`,
      `${SOUNDFONT_BASE}/gm_flute_a.js`,
    ]);
  });

  it("can list every font variant", async () => {
    const urls = await listBuiltInSoundUrls({
      fetchJson,
      instruments: ["gm_piano"],
      fontsFor: () => ["f1", "f2", "f3"],
      soundfontVariants: "all",
    });
    expect(urls.filter((u) => u.startsWith(SOUNDFONT_BASE))).toEqual([
      `${SOUNDFONT_BASE}/f1.js`,
      `${SOUNDFONT_BASE}/f2.js`,
      `${SOUNDFONT_BASE}/f3.js`,
    ]);
  });

  it("defaults to the model's instrument catalog and Strudel's GM table", async () => {
    const urls = await listBuiltInSoundUrls({ fetchJson });
    const fonts = urls.filter((u) => u.startsWith(SOUNDFONT_BASE));
    expect(fonts).toHaveLength(18);
    expect(fonts[0]).toBe(`${SOUNDFONT_BASE}/0000_JCLive_sf2_file.js`);
    expect(fonts.every((u) => /\/\w+_sf2_file\.js$/.test(u))).toBe(true);
  });

  it("reads the sample maps through resolveUrl so listing works from a cache", async () => {
    const read: string[] = [];
    await listBuiltInSoundUrls({
      instruments: [],
      resolveUrl: (url) => url.replace("https://strudel.b-cdn.net/", "asset://cache/"),
      fetchJson: async (url) => {
        read.push(url);
        return {};
      },
    });
    expect(read.sort()).toEqual(
      DEFAULT_SAMPLE_SOURCES.map((src) => src.map.replace("https://strudel.b-cdn.net/", "asset://cache/")).sort(),
    );
  });
});
