/**
 * Sound sources and buffer preloading (DECISIONS V14, V15).
 *
 * Superdough skips a sample whose buffer isn't cached on its first trigger (sampler.mjs:297), so the
 * runtime collects every sound a program will play and loads it before playback.
 */
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
