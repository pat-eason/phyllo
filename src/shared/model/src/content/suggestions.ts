import type { TrackKind } from "../types";

/**
 * Guided "Try one" buttons in the inspector (SPEC §6.1). Clicking adds the code as a modifier
 * (`origin: "suggestion"`, `label` = the label below); clicking again removes it.
 */
export interface Suggestion {
  id: string;
  /** Plain-language button label */
  label: string;
  /** Verbatim chained call(s) with the leading dot */
  code: string;
  /** Track kinds this suggestion is offered for */
  kinds: readonly TrackKind[];
}

const ALL: readonly TrackKind[] = ["drum", "melodic", "chord", "sample"];

/** The four suggestions from the mockup, offered on every kind of track. */
export const CORE_SUGGESTIONS: readonly Suggestion[] = [
  { id: "slow-filter-sweep", label: "Slow filter sweep", code: ".lpf(sine.range(400,1400).slow(8))", kinds: ALL },
  { id: "bouncier", label: "Bouncier", code: ".swingBy(1/6, 4)", kinds: ALL },
  { id: "busier-now-and-then", label: "Busier now and then", code: ".sometimes(x => x.ply(2))", kinds: ALL },
  { id: "flip-every-4th-bar", label: "Flip every 4th bar", code: ".lastOf(4, rev)", kinds: ALL },
];

/** Extras that suit one kind of track. */
export const KIND_SUGGESTIONS: readonly Suggestion[] = [
  // drums
  { id: "drop-some-hits", label: "Drop a few hits", code: ".degradeBy(.2)", kinds: ["drum"] },
  { id: "fill-every-4th-bar", label: "Fast fill every 4th bar", code: ".lastOf(4, x => x.fast(2))", kinds: ["drum"] },
  { id: "crunch", label: "Crunchy", code: ".crush(6)", kinds: ["drum", "sample"] },
  // melodic
  { id: "echoey", label: "Echoey repeats", code: ".echo(3, 1/8, .6)", kinds: ["melodic"] },
  { id: "fifth-above", label: "Add a fifth above", code: ".off(1/8, x => x.add(note(7)))", kinds: ["melodic"] },
  { id: "octave-pops", label: "Octave pops now and then", code: ".sometimes(x => x.add(note(12)))", kinds: ["melodic"] },
  { id: "stereo-twist", label: "Stereo twist", code: ".jux(rev)", kinds: ["melodic", "chord"] },
  // chords
  { id: "broken-chord", label: "Break the chord up", code: '.arp("0 1 2 1")', kinds: ["chord"] },
  { id: "pulse-chord", label: "Pulse on the beat", code: '.struct("x*4")', kinds: ["chord"] },
  { id: "chord-up-octave", label: "Up an octave", code: ".transpose(12)", kinds: ["chord", "melodic"] },
  // samples
  { id: "half-speed", label: "Half speed", code: ".speed(.5)", kinds: ["sample"] },
  { id: "chop-it-up", label: "Chop it up", code: ".chop(8)", kinds: ["sample"] },
];

export const SUGGESTIONS: readonly Suggestion[] = [...CORE_SUGGESTIONS, ...KIND_SUGGESTIONS];

/** Suggestions offered for a track kind: the four core ones first, then the kind's extras. Code tracks get none. */
export function suggestionsFor(kind: TrackKind): Suggestion[] {
  return SUGGESTIONS.filter((s) => s.kinds.includes(kind));
}

/** The suggestion whose code matches a modifier's code exactly (ignoring spaces), if any. */
export function findSuggestionByCode(code: string): Suggestion | undefined {
  const norm = (c: string) => c.replace(/\s+/g, "");
  const target = norm(code);
  return SUGGESTIONS.find((s) => norm(s.code) === target);
}
