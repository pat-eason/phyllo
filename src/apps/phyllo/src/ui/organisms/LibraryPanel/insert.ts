import { DRUM_SOUNDS, createModifier, createTrack, findSound } from "@phyllo/model";
import type { ModifierDef, Project, ProjectAction, Track } from "@phyllo/model";
import type { SoundRef } from "@phyllo/ui";

/** A first pattern for a drum sound added as a new track. */
const DRUM_PATTERNS: Readonly<Record<string, string>> = {
  bd: "bd*4",
  sd: "~ sd ~ sd",
  cp: "~ cp ~ cp",
  rim: "~ rim ~ rim",
  hh: "hh*8",
  oh: "~ oh ~ oh",
};

export function defaultDrumPattern(code: string): string {
  return DRUM_PATTERNS[code] ?? `${code} ~ ~ ~`;
}

const DRUM_CODES = new Set(DRUM_SOUNDS.map((d) => d.code));

/**
 * `bd*4` + `sd` gives `sd*4`. When the pattern uses exactly one drum sound the rhythm is kept; anything else
 * (empty, several sounds) starts from the new sound's default pattern.
 */
export function swapDrumSound(pattern: string, code: string): string {
  const used = new Set((pattern.match(/[A-Za-z_]\w*/g) ?? []).filter((word) => DRUM_CODES.has(word)));
  const [only] = [...used];
  if (used.size !== 1 || only === undefined) return defaultDrumPattern(code);
  return pattern.replace(new RegExp(`\\b${only}\\b`, "g"), code);
}

function friendlyName(ref: SoundRef): string {
  if (ref.source === "sample") return ref.name;
  return findSound(ref.name)?.name ?? ref.name;
}

function uniqueName(base: string, existing: readonly Pick<Track, "name">[]): string {
  const names = new Set(existing.map((t) => t.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

function newTrackActions(project: Project, ref: SoundRef): ProjectAction[] {
  const base = {
    existing: project.tracks,
    lengthBars: project.lengthBars,
    name: uniqueName(friendlyName(ref), project.tracks),
  };
  let track: Track;
  switch (ref.source) {
    case "bank":
      track = createTrack("drum", { ...base, source: { bank: ref.bank ?? "RolandTR909" }, pattern: defaultDrumPattern(ref.name) });
      break;
    case "sample":
      track = createTrack("sample", { ...base, source: { type: "s", sound: ref.name }, pattern: ref.name });
      break;
    default:
      track = createTrack("melodic", { ...base, source: { sound: ref.name } });
  }
  return [
    { type: "track/add", track },
    { type: "ui/select", trackId: track.id },
  ];
}

/**
 * What "insert this sound" does (Enter on a row or chip; the keyboard alternative to dragging):
 * on a compatible selected track it swaps that track's sound, otherwise it adds a new track and selects it.
 * Compatible: drum sounds on a drum track; synths and instruments on a melodic or chord track; samples on a sample track.
 */
export function soundInsertActions(project: Project, ref: SoundRef): ProjectAction[] {
  const track = project.tracks.find((t) => t.id === project.ui.selectedTrack);
  if (!track) return newTrackActions(project, ref);

  if (ref.source === "bank" && track.kind === "drum") {
    return [
      { type: "track/setSource", trackId: track.id, source: { type: "s", sound: null, bank: ref.bank ?? track.source.bank } },
      { type: "track/setPattern", trackId: track.id, pattern: swapDrumSound(track.pattern, ref.name) },
    ];
  }
  if ((ref.source === "synth" || ref.source === "soundfont") && (track.kind === "melodic" || track.kind === "chord")) {
    return [{ type: "track/setSource", trackId: track.id, source: { sound: ref.name, bank: null } }];
  }
  if (ref.source === "sample" && track.kind === "sample") {
    return [
      { type: "track/setSource", trackId: track.id, source: { type: "s", sound: ref.name, bank: null } },
      { type: "track/setPattern", trackId: track.id, pattern: ref.name },
    ];
  }
  return newTrackActions(project, ref);
}

/** `modifier/add` for the selected track; empty when no track is selected. */
export function modifierInsertActions(project: Project, def: Pick<ModifierDef, "template" | "description">): ProjectAction[] {
  const track = project.tracks.find((t) => t.id === project.ui.selectedTrack);
  if (!track) return [];
  return [
    {
      type: "modifier/add",
      trackId: track.id,
      modifier: createModifier(def.template, { label: def.description, origin: "user" }),
    },
  ];
}
