/**
 * Sound sources and buffer preloading (DECISIONS V14, V15).
 *
 * Superdough skips a sample whose buffer isn't cached on its first trigger (sampler.mjs:297), so the
 * runtime collects every sound a program will play and loads it before playback.
 */
import { INSTRUMENTS } from "@phyllo/model";
import { getSoundIndex } from "@strudel/core";
import type { Hap, Pattern } from "@strudel/core";
import { aliasBank, getSampleInfo, loadBuffer, samples, soundMap } from "@strudel/webaudio";

/**
 * Soundfont buffer loader (`getFontBufferSource` from @strudel/soundfonts). Injected by the engine at
 * init: @strudel/soundfonts only loads in a browser (its sfumato dependency is CommonJS-incompatible
 * under Node), and this module must stay importable by unit tests.
 */
export type FontLoader = (font: string, value: Record<string, unknown>, ctx: BaseAudioContext) => Promise<unknown>;
let fontLoader: FontLoader | undefined;
export function setFontLoader(loader: FontLoader | undefined): void {
  fontLoader = loader;
}

/** Strudel's CDN (strudel.cc prebake): drum machines incl. RolandTR909/808, LinnDrum, AkaiMPC60. */
export const STRUDEL_CDN = "https://strudel.b-cdn.net";

export const DEFAULT_SAMPLE_SOURCES: readonly { map: string; base: string }[] = [
  { map: `${STRUDEL_CDN}/tidal-drum-machines.json`, base: `${STRUDEL_CDN}/tidal-drum-machines/machines/` },
  { map: `${STRUDEL_CDN}/uzu-drumkit.json`, base: `${STRUDEL_CDN}/uzu-drumkit/` },
  { map: `${STRUDEL_CDN}/piano.json`, base: `${STRUDEL_CDN}/piano/` },
  { map: `${STRUDEL_CDN}/vcsl.json`, base: `${STRUDEL_CDN}/VCSL/` },
];
export const DEFAULT_BANK_ALIASES = `${STRUDEL_CDN}/tidal-drum-machines-alias.json`;

/** Loads the default maps; failures (offline) are reported, not thrown — synths still work. */
export async function loadDefaultSamples(warn: (msg: string) => void): Promise<void> {
  const results = await Promise.allSettled([
    ...DEFAULT_SAMPLE_SOURCES.map((src) => samples(src.map, src.base, { prebake: true })),
    aliasBank(DEFAULT_BANK_ALIASES),
  ]);
  results.forEach((r, i) => {
    if (r.status === "rejected") warn(`default samples ${DEFAULT_SAMPLE_SOURCES[i]?.map ?? "aliases"} failed: ${String(r.reason)}`);
  });
}

/** One sound to load: the registered sound key plus the hap value fields that pick the file / pitch. */
export interface SoundRequest {
  key: string;
  value: Record<string, unknown>;
}

/** Sound key superdough looks up for a value: `${bank}_${s}` lowercased (superdough.mjs:533, 160). */
export function soundKey(value: Record<string, unknown>): string | undefined {
  const s = value["s"];
  if (typeof s !== "string" || s === "" || s === "-" || s === "~" || s === "_") return undefined;
  const bank = value["bank"];
  return (typeof bank === "string" && bank !== "" ? `${bank}_${s}` : s).toLowerCase();
}

/** Distinct sounds (key + n + note) among the onsets of `haps`. */
export function collectSoundRequests(haps: readonly Hap[]): SoundRequest[] {
  const seen = new Map<string, SoundRequest>();
  for (const hap of haps) {
    if (!hap.hasOnset()) continue;
    const value = hap.value;
    if (typeof value !== "object" || value === null) continue;
    const v = value as Record<string, unknown>;
    const key = soundKey(v);
    if (!key) continue;
    const id = `${key}|${String(v["n"] ?? 0)}|${String(v["note"] ?? v["freq"] ?? "")}`;
    if (!seen.has(id)) seen.set(id, { key, value: { ...v } });
  }
  return [...seen.values()];
}

/** Queries `[from, to)` cycle by cycle and returns the distinct sounds (query errors yield nothing). */
export function soundsInRange(pattern: Pattern, from: number, to: number, cps: number): SoundRequest[] {
  const haps: Hap[] = [];
  for (let c = Math.floor(from); c < to; c++) {
    haps.push(...pattern.queryArc(c, Math.min(c + 1, to), { _cps: cps }));
  }
  return collectSoundRequests(haps);
}

interface RegisteredSound {
  data?: { type?: string; samples?: unknown; fonts?: string[] };
}

/** Loads the buffers behind `requests` into superdough's caches. Unknown sounds are ignored here. */
export async function preloadSounds(requests: readonly SoundRequest[], ctx: BaseAudioContext): Promise<void> {
  const map = soundMap.get() as Record<string, RegisteredSound | undefined>;
  const jobs: Promise<unknown>[] = [];
  const urls = new Set<string>();
  for (const req of requests) {
    const sound = map[req.key];
    const data = sound?.data;
    if (!data) continue;
    if (data.type === "sample" && data.samples) {
      try {
        const { url } = getSampleInfo(req.value, data.samples);
        if (url && !urls.has(url)) {
          urls.add(url);
          jobs.push(loadBuffer(url, ctx, String(req.value["s"]), Number(req.value["n"] ?? 0)));
        }
      } catch {
        // malformed value; superdough will report it when triggered
      }
    } else if (data.type === "soundfont" && data.fonts?.length) {
      const font = data.fonts[getSoundIndex(req.value["n"], data.fonts.length)];
      if (font && fontLoader) jobs.push(fontLoader(font, req.value, ctx));
    }
  }
  await Promise.allSettled(jobs);
}

/** Every file URL registered under the given sound names (after `samples()` resolved base URLs). */
export function registeredSampleUrls(names: readonly string[]): string[] {
  const map = soundMap.get() as Record<string, RegisteredSound | undefined>;
  const urls: string[] = [];
  for (const name of names) {
    const s = map[name.toLowerCase()]?.data?.samples;
    if (Array.isArray(s)) urls.push(...s.filter((u): u is string => typeof u === "string"));
    else if (s && typeof s === "object") {
      for (const v of Object.values(s as Record<string, unknown>)) {
        if (Array.isArray(v)) urls.push(...v.filter((u): u is string => typeof u === "string"));
      }
    }
  }
  return urls;
}

// ── URL resolution / offline cache (DECISIONS V15, T6.6) ───────────────────

/** Maps a sound URL to the URL to actually load (e.g. a locally cached copy). Must return its input for URLs it doesn't handle. */
export type UrlResolver = (url: string) => string | Promise<string>;

/**
 * Routes every http(s) `GET` made through `fetch` via `resolve`: the sample-map JSON, each sample file and the
 * soundfont `.js` files. Superdough and @strudel/soundfonts call the global `fetch` themselves with the final URL
 * (`fetchSampleMap`, `loadBuffer`, `loadFont`) and offer no hook, so this is the one place all three can be
 * covered, including sounds a program triggers that were never preloaded. A resolver that throws falls back to the
 * original URL. Returns an uninstall function; an uninstalled layer passes straight through even if something else
 * wrapped `fetch` on top of it.
 */
export function installUrlResolver(resolve: UrlResolver): () => void {
  const original = globalThis.fetch;
  if (typeof original !== "function") return () => undefined;
  let active = true;
  const wrapped = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : undefined;
    const method = (init?.method ?? "GET").toUpperCase();
    if (!active || url === undefined || method !== "GET" || !/^https?:\/\//i.test(url)) {
      return original.call(globalThis, input, init);
    }
    let target = url;
    try {
      target = await resolve(url);
    } catch {
      // keep the original URL: online use must keep working when the cache can't help
    }
    return original.call(globalThis, target, init);
  };
  globalThis.fetch = wrapped as typeof fetch;
  return () => {
    active = false;
    if (globalThis.fetch === wrapped) globalThis.fetch = original;
  };
}

/** GM soundfonts are served from here (`@strudel/soundfonts` default; `${base}/${font}.js`). */
export const SOUNDFONT_BASE = "https://felixroos.github.io/webaudiofontdata/sound";

export interface BuiltInSoundOptions {
  /** Sound names of the GM instruments to include (default: the model's `INSTRUMENTS` catalog). */
  instruments?: readonly string[];
  /** `all` lists every font variant of each instrument (hundreds of MB); `first` only the one that plays by default (`n` = 0). */
  soundfontVariants?: "first" | "all";
  /** Font file names per instrument (default: Strudel's GM table, `@strudel/soundfonts/gm.mjs`). */
  fontsFor?: (instrument: string) => readonly string[] | undefined;
  /** Maps URLs before reading the sample-map JSON, so listing works offline from a cache. Defaults to the identity. */
  resolveUrl?: UrlResolver;
  /** Reads a JSON document; defaults to `fetch(url).then(r => r.json())`. */
  fetchJson?: (url: string) => Promise<unknown>;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function gmFonts(): Promise<Record<string, readonly string[]>> {
  // @ts-expect-error -- untyped deep import: the GM table isn't re-exported by the package entry point
  const gm = (await import("@strudel/soundfonts/gm.mjs")) as { default: Record<string, readonly string[]> };
  return gm.default;
}

/** Sample-map JSON: `{ _base?, name: ["file", ...] | { note: ["file", ...] } }`. Mirrors superdough's `processSampleMap`. */
export function sampleMapFileUrls(json: unknown, baseUrl: string): string[] {
  if (typeof json !== "object" || json === null) return [];
  const urls: string[] = [];
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (key === "_base") continue;
    const own = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>)["_base"] : undefined;
    const base = typeof own === "string" ? own : baseUrl;
    const add = (file: unknown) => {
      if (typeof file === "string") urls.push(base + file);
    };
    if (typeof value === "string") add(value);
    else if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "object" && value !== null) {
      for (const [note, files] of Object.entries(value as Record<string, unknown>)) {
        if (note === "_base") continue;
        if (typeof files === "string") add(files);
        else if (Array.isArray(files)) files.forEach(add);
      }
    }
  }
  return urls;
}

/**
 * Every URL "Download built-in sounds for offline use" must fetch: the default sample-map JSONs and alias file,
 * every sample file they list, and the soundfonts of the model's GM instruments. JSON documents come first.
 * Reads the maps from the network (or through `resolveUrl`), so it needs no engine instance or audio context.
 */
export async function listBuiltInSoundUrls(options: BuiltInSoundOptions = {}): Promise<string[]> {
  const resolve = options.resolveUrl ?? ((url: string) => url);
  const fetchJson = options.fetchJson ?? defaultFetchJson;
  const documents: string[] = [DEFAULT_BANK_ALIASES];
  const files: string[] = [];

  const maps = await Promise.all(
    DEFAULT_SAMPLE_SOURCES.map(async (src) => {
      documents.push(src.map);
      return { src, json: await fetchJson(await resolve(src.map)) };
    }),
  );
  for (const { src, json } of maps) files.push(...sampleMapFileUrls(json, src.base));

  const instruments = options.instruments ?? INSTRUMENTS.map((i) => i.code);
  const table = options.fontsFor ? undefined : await gmFonts();
  const fontsFor = options.fontsFor ?? ((name: string) => table?.[name]);
  const fonts: string[] = [];
  for (const name of instruments) {
    const variants = fontsFor(name) ?? [];
    const chosen = options.soundfontVariants === "all" ? variants : variants.slice(0, 1);
    for (const font of chosen) fonts.push(`${SOUNDFONT_BASE}/${font}.js`);
  }

  return [...new Set([...documents, ...files, ...fonts])];
}
