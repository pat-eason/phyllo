// Pure helpers for the channel strips: insert summaries, the sound line, orbit lists and the "+ Effect" catalog.
import { controlsSetBy, formatCompact, modulatedParams, modulationRange } from "@phyllo/engine";
import { findModifier, isDefault, MODIFIERS } from "@phyllo/model";
import type { ParamName, Project, Track } from "@phyllo/model";

/** Params listed as inserts (gain is the fader; room/delay are the sends). */
export const INSERT_PARAMS: readonly ParamName[] = ["pan", "lpf", "lpq", "hpf", "shape", "roomsize", "delaytime", "delayfeedback"];

/** Params the strip itself controls (fader + sends); modifiers that set them are not listed as inserts. */
const STRIP_PARAMS: readonly ParamName[] = ["gain", "room", "delay"];

const WAVEFORMS = /\b(sine|cosine|saw|isaw|tri|square|rand|perlin|irand)\b/;

export interface InsertItem {
  key: string;
  /** Short code name: `lpf`, `delayfb`, `crush`. */
  label: string;
  /** Compact value: `3k`, `.3`, `~sine`. */
  value: string;
  /** Set for param inserts. */
  param?: ParamName;
  /** Set for modifier inserts. */
  modifierId?: string;
  /** A plain number the strip can edit inline. */
  editable: boolean;
  /** A modifier or a patterned value drives it. */
  modulated: boolean;
  /** Full code (tooltip). */
  code: string;
}

export const insertLabel = (param: ParamName): string => (param === "delayfeedback" ? "delayfb" : param);

function firstCall(code: string): { name: string; args: string } | null {
  const m = /^\s*\.?([A-Za-z_$][\w$]*)\s*\(([\s\S]*?)\)/.exec(code);
  return m ? { name: m[1] ?? "", args: (m[2] ?? "").trim() } : null;
}

function compactArgs(args: string): string {
  const unquoted = args.replace(/^["'`]|["'`]$/g, "");
  const n = Number(unquoted);
  const text = unquoted !== "" && Number.isFinite(n) ? formatCompact(n) : unquoted;
  return text.length > 9 ? `${text.slice(0, 8)}…` : text;
}

/** SPEC §6.4 inserts: the track's effect params and effect modifiers, summarised (`lpf ~sine`, `lpq 10`, `shape .3`). */
export function trackInserts(track: Track): InsertItem[] {
  if (track.kind === "code") return [];
  const modulated = modulatedParams(track);
  const enabled = track.modifiers.filter((m) => m.enabled && m.code.trim() !== "");
  const items: InsertItem[] = [];

  for (const param of INSERT_PARAMS) {
    const value = track.params[param];
    const isMod = modulated.has(param);
    if (!isMod && (value === undefined || isDefault(param, value))) continue;
    const label = insertLabel(param);
    if (isMod) {
      const driver = enabled.find((m) => controlsSetBy(m.code).has(param));
      const wave = driver ? WAVEFORMS.exec(driver.code)?.[1] : undefined;
      items.push({
        key: `p:${param}`,
        label,
        value: wave ? `~${wave}` : (modulationRange(track, param) ?? "~"),
        param,
        editable: false,
        modulated: true,
        code: driver?.code ?? `.${param}()`,
      });
    } else if (typeof value === "string") {
      items.push({
        key: `p:${param}`,
        label,
        value: modulationRange(track, param) ?? "~pattern",
        param,
        editable: false,
        modulated: true,
        code: `.${param}("${value}")`,
      });
    } else if (typeof value === "number") {
      items.push({ key: `p:${param}`, label, value: formatCompact(value), param, editable: true, modulated: false, code: `.${param}(${value})` });
    }
  }

  for (const m of enabled) {
    const sets = controlsSetBy(m.code);
    if ([...sets].some((c) => c !== "orbit" && ((INSERT_PARAMS as readonly string[]).includes(c) || (STRIP_PARAMS as readonly string[]).includes(c)))) continue;
    const call = firstCall(m.code);
    if (!call) continue;
    const def = findModifier(call.name);
    if (def && def.category !== "sound" && def.category !== "stereo") continue;
    items.push({ key: `m:${m.id}`, label: call.name, value: compactArgs(call.args), modifierId: m.id, editable: false, modulated: false, code: m.code });
  }
  return items;
}

/** First distinct sound names in a drum pattern: `bd*4` → `["bd"]`. */
function patternSounds(pattern: string, max = 2): string[] {
  const out: string[] = [];
  for (const m of pattern.matchAll(/(?<![\w.:])([A-Za-z][A-Za-z0-9_]*)/g)) {
    const name = m[1] ?? "";
    if (!out.includes(name)) out.push(name);
    if (out.length >= max) break;
  }
  return out;
}

/** `RolandTR909` → `TR909`, `AkaiMPC60` → `MPC60`. */
export function shortBank(bank: string): string {
  return bank.replace(/^(Roland|Akai|Korg|Yamaha|Boss|Casio|Oberheim|Sequential|Emu|Alesis|Elektron)(?=[A-Z0-9])/, "") || bank;
}

/** Strip sub-line in code terms: `bd · TR909`, `sawtooth`, `gm_epiano1`, `vox · chop(8)`. */
export function soundLine(track: Track): string {
  if (track.kind === "code") return "code";
  const parts: string[] = [];
  if (track.kind === "drum" && !track.source.sound) {
    const sounds = patternSounds(track.pattern);
    if (sounds.length > 0) parts.push(sounds.join(" "));
  } else if (track.source.sound) {
    parts.push(track.source.sound);
  } else if (track.source.type === "chord") {
    parts.push("chord");
  }
  if (track.source.bank) parts.push(shortBank(track.source.bank));
  if (track.kind === "sample") {
    const sampling = track.modifiers.find((m) => m.enabled && /^\.(chop|slice|striate|loopAt)\(/.test(m.code.trim()));
    if (sampling) parts.push(sampling.code.trim().slice(1));
  }
  return parts.join(" · ") || track.source.type;
}

/** Orbits used by at least one track, ascending (one bus strip each). */
export function orbitsInUse(project: Project): number[] {
  return [...new Set(project.tracks.map((t) => t.orbit))].sort((a, b) => a - b);
}

/** The lowest orbit ≥ 1 no track uses (for "New bus"). */
export function nextFreeOrbit(project: Project, max = 99): number {
  const used = new Set(project.tracks.map((t) => t.orbit));
  for (let o = 1; o <= max; o += 1) if (!used.has(o)) return o;
  return max;
}

export interface EffectOption {
  id: string;
  /** Code shown in the menu: `.lpf(1200)`. */
  code: string;
  description: string;
  kind: "param" | "modifier";
  param?: ParamName;
  value?: number;
  template?: string;
}

/** Params "+ Effect" can add, at a sensible starting value. */
const PARAM_EFFECTS: readonly { param: ParamName; value: number; description: string }[] = [
  { param: "lpf", value: 1200, description: "Darken the sound (low-pass filter)" },
  { param: "hpf", value: 300, description: "Cut the low end (high-pass filter)" },
  { param: "lpq", value: 10, description: "Add filter resonance" },
  { param: "shape", value: 0.3, description: "Add grit (waveshaping)" },
  { param: "pan", value: 0.3, description: "Move the sound to the left" },
];

/** Modifiers from the `MODIFIERS` sound/stereo categories offered by "+ Effect". */
const MODIFIER_EFFECTS = ["lpf", "crush", "coarse", "vowel", "distort", "phaser", "jux"] as const;

/** The "+ Effect" menu for a track: params it doesn't set yet, then effect modifiers it doesn't use yet. */
export function effectOptions(track: Track): EffectOption[] {
  const modulated = modulatedParams(track);
  const out: EffectOption[] = [];
  for (const p of PARAM_EFFECTS) {
    const value = track.params[p.param];
    if (modulated.has(p.param) || (value !== undefined && !isDefault(p.param, value))) continue;
    out.push({ id: `p:${p.param}`, code: `.${p.param}(${formatCompact(p.value)})`, description: p.description, kind: "param", param: p.param, value: p.value });
  }
  const used = new Set(track.modifiers.map((m) => firstCall(m.code)?.name));
  for (const name of MODIFIER_EFFECTS) {
    const def = MODIFIERS.find((m) => m.name === name);
    if (!def || used.has(name)) continue;
    if (name === "lpf" && (modulated.has("lpf") || track.params.lpf !== undefined)) continue;
    out.push({ id: `m:${name}`, code: def.template, description: def.description, kind: "modifier", template: def.template });
  }
  return out;
}

/** Parse a typed insert value: `3k` → 3000, `.3` → 0.3; empty → null (remove); NaN → undefined (reject). */
export function parseInsertValue(text: string): number | null | undefined {
  const t = text.trim().toLowerCase().replace(/\s*(hz|s)$/, "");
  if (t === "") return null;
  const k = /^(-?[\d.]+)k$/.exec(t);
  const n = k ? Number(k[1]) * 1000 : Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** `0:07`, `12:03`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
