import { quote } from "@phyllo/engine";
import { createModifier, createTrack, findSound, newId } from "@phyllo/model";
import type { Project, ProjectAction, Track, TrackKind } from "@phyllo/model";
import { SOUND_DRAG_MIME } from "@phyllo/ui";
import type { SoundRef } from "@phyllo/ui";
import { patternSounds } from "./trackDisplay";

/**
 * Library sounds dropped on the Timeline (SPEC §6.1 Library panel):
 * - onto a lane: replace that track's sound (`track/setSource`, plus the pattern word for tracks whose sounds
 *   live in the pattern); a sound of another kind (a synth onto a drum lane) adds a new track below instead;
 * - onto empty space or the Add-track row: a new track of the sound's kind;
 * - with ⇧: add it as a layer. Drum sound onto a drum lane → comma-append to the pattern (`bd*4, hh*8`, a
 *   mini-notation stack); anything else → a `.stack(<source>)` modifier on the target track.
 */

/** True while a library sound is being dragged (the payload itself is only readable on drop). */
export function isSoundDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types ?? []).includes(SOUND_DRAG_MIME);
}

const SOURCES: readonly SoundRef["source"][] = ["bank", "synth", "soundfont", "sample"];

export function readSoundRef(dataTransfer: DataTransfer | null): SoundRef | null {
  const raw = dataTransfer?.getData(SOUND_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { source, name, bank } = parsed as Record<string, unknown>;
    if (typeof name !== "string" || name.trim() === "" || !SOURCES.includes(source as SoundRef["source"])) return null;
    const ref: SoundRef = { source: source as SoundRef["source"], name: name.trim() };
    if (typeof bank === "string" && bank !== "") ref.bank = bank;
    return ref;
  } catch {
    // Not our JSON (another app's drag): ignore the drop.
    return null;
  }
}

export function kindForSound(ref: SoundRef): Exclude<TrackKind, "chord" | "code"> {
  switch (ref.source) {
    case "bank":
      return "drum";
    case "synth":
    case "soundfont":
      return "melodic";
    case "sample":
      return "sample";
    default: {
      const never: never = ref.source;
      return never;
    }
  }
}

const DRUM_PATTERNS: Record<string, string> = {
  bd: "bd*4",
  sd: "~ sd",
  cp: "~ cp",
  rim: "~ rim",
  hh: "hh*8",
  oh: "[~ oh]*4",
};

/** A sensible first pattern for one drum sound. */
export function drumPatternFor(sound: string): string {
  return DRUM_PATTERNS[sound] ?? `${sound}*2`;
}

/** Track name for a dropped sound: the friendly name ("Bass drum", "Sawtooth") or the sample name. */
function nameFor(ref: SoundRef): string {
  return findSound(ref.name)?.name ?? ref.name;
}

/** A new track playing `ref` (one clip over the whole song). */
export function trackForSound(ref: SoundRef, project: Pick<Project, "tracks" | "lengthBars">): Track {
  const kind = kindForSound(ref);
  const common = { existing: project.tracks, lengthBars: project.lengthBars, name: nameFor(ref) };
  switch (kind) {
    case "drum":
      return createTrack("drum", {
        ...common,
        pattern: drumPatternFor(ref.name),
        ...(ref.bank ? { source: { bank: ref.bank } } : {}),
      });
    case "melodic":
      return createTrack("melodic", { ...common, source: { type: "note", sound: ref.name } });
    case "sample":
      return createTrack("sample", { ...common, pattern: ref.name, source: { type: "s", sound: ref.name } });
    default: {
      const never: never = kind;
      return never;
    }
  }
}

/** Replaces the only sound word of `pattern` with `sound`; null when the pattern names several sounds. */
function replaceOnlySound(pattern: string, sound: string): string | null {
  const sounds = patternSounds(pattern);
  if (sounds.length !== 1) return null;
  const old = sounds[0] ?? "";
  return pattern.replace(new RegExp(`\\b${old}(?::\\d+)?\\b`, "g"), sound);
}

/** Actions replacing `track`'s sound with `ref`; null when the kinds don't fit (the caller adds a track). */
export function replaceSoundActions(track: Track, ref: SoundRef): ProjectAction[] | null {
  const kind = kindForSound(ref);
  const trackId = track.id;
  if (track.kind === "drum" && kind === "drum") {
    const actions: ProjectAction[] = [];
    if (ref.bank && ref.bank !== track.source.bank) actions.push({ type: "track/setSource", trackId, source: { bank: ref.bank } });
    const pattern = replaceOnlySound(track.pattern, ref.name);
    if (pattern !== null && pattern !== track.pattern) actions.push({ type: "track/setPattern", trackId, pattern });
    return actions;
  }
  if (track.kind === "sample" && kind === "sample") {
    const pattern = replaceOnlySound(track.pattern, ref.name) ?? ref.name;
    return [
      { type: "track/setSource", trackId, source: { sound: ref.name } },
      { type: "track/setPattern", trackId, pattern },
    ];
  }
  if ((track.kind === "melodic" || track.kind === "chord") && kind === "melodic") {
    if (track.source.type === "s") {
      // `s("sawtooth*4")`: the sound lives in the pattern.
      const pattern = replaceOnlySound(track.pattern, ref.name);
      return pattern === null ? null : [{ type: "track/setPattern", trackId, pattern }];
    }
    return [{ type: "track/setSource", trackId, source: { sound: ref.name } }];
  }
  return null;
}

/** Strudel expression for `ref` as a layer on `track` (`s("hh*8").bank("RolandTR909")`, `note("…").s("square")`). */
function layerExpression(track: Track, ref: SoundRef): string {
  switch (kindForSound(ref)) {
    case "drum":
      return `s(${quote(drumPatternFor(ref.name))})${ref.bank ? `.bank(${quote(ref.bank)})` : ""}`;
    case "sample":
      return `s(${quote(ref.name)})`;
    case "melodic":
      if (track.kind === "chord") return `chord(${quote(track.pattern)}).voicing().s(${quote(ref.name)})`;
      if (track.kind === "melodic" && track.source.type !== "s") return `note(${quote(track.pattern)}).s(${quote(ref.name)})`;
      return `note("c3").s(${quote(ref.name)})`;
    default:
      return `s(${quote(ref.name)})`;
  }
}

/** Actions layering `ref` onto `track`; null for code tracks (their code is verbatim, so a new track is added). */
export function layerSoundActions(track: Track, ref: SoundRef): ProjectAction[] | null {
  if (track.kind === "code") return null;
  if (track.kind === "drum" && kindForSound(ref) === "drum") {
    const add = drumPatternFor(ref.name);
    const pattern = track.pattern.trim() ? `${track.pattern}, ${add}` : add;
    return [{ type: "track/setPattern", trackId: track.id, pattern }];
  }
  const modifier = createModifier(`.stack(${layerExpression(track, ref)})`, {
    id: newId("mod_"),
    label: `Layer ${nameFor(ref)}`,
    origin: "user",
  });
  return [{ type: "modifier/add", trackId: track.id, modifier }];
}
