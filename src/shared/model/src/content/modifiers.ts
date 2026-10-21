/**
 * Pro "+" modifier catalog (SPEC §6.1): the searchable list of Strudel functions offered when adding a modifier.
 * Every name was checked against the pinned packages (@strudel/core 1.2.6, tonal 1.2.6, superdough 1.3.0);
 * see `modifiers.test.ts` for the verification table.
 */

export type ModifierCategory = "time" | "structure" | "sound" | "stereo" | "sampling" | "harmony";

export interface ModifierDef {
  /** Strudel function name (without the dot) */
  name: string;
  /** Ready-to-insert chained call(s) with the leading dot and sensible example arguments */
  template: string;
  /** Plain-language description shown beside the code */
  description: string;
  category: ModifierCategory;
}

export const MODIFIER_CATEGORIES: readonly { id: ModifierCategory; label: string }[] = [
  { id: "time", label: "Time" },
  { id: "structure", label: "Structure & chance" },
  { id: "sound", label: "Sound & effects" },
  { id: "stereo", label: "Stereo" },
  { id: "sampling", label: "Sampling" },
  { id: "harmony", label: "Harmony" },
];

export const MODIFIERS: readonly ModifierDef[] = [
  // time
  { name: "fast", template: ".fast(2)", description: "Play the pattern twice as fast", category: "time" },
  { name: "slow", template: ".slow(2)", description: "Stretch the pattern over two cycles", category: "time" },
  { name: "early", template: ".early(1/8)", description: "Move every hit earlier by an eighth of a cycle", category: "time" },
  { name: "late", template: ".late(1/8)", description: "Move every hit later by an eighth of a cycle", category: "time" },
  { name: "ply", template: ".ply(2)", description: "Repeat each hit twice", category: "time" },
  { name: "hurry", template: ".hurry(2)", description: "Speed up the pattern and the sound together", category: "time" },
  { name: "swingBy", template: ".swingBy(1/6, 4)", description: "Push every other step a little late for a bouncy feel", category: "time" },
  { name: "rev", template: ".rev()", description: "Play the pattern backwards", category: "time" },
  { name: "palindrome", template: ".palindrome()", description: "Play forwards, then backwards, on alternate cycles", category: "time" },
  { name: "iter", template: ".iter(4)", description: "Start a quarter further in each cycle", category: "time" },
  { name: "linger", template: ".linger(1/4)", description: "Repeat only the first quarter of the pattern", category: "time" },
  { name: "brak", template: ".brak()", description: "Squash every other cycle into a breakbeat feel", category: "time" },
  { name: "echo", template: ".echo(3, 1/8, .6)", description: "Add three quieter copies, like an echo", category: "time" },

  // structure & chance
  { name: "lastOf", template: ".lastOf(4, rev)", description: "Reverse the last cycle of every 4", category: "structure" },
  { name: "firstOf", template: ".firstOf(4, x => x.fast(2))", description: "Change the first cycle of every 4", category: "structure" },
  { name: "every", template: ".every(3, x => x.rev())", description: "Change every third cycle", category: "structure" },
  { name: "sometimes", template: ".sometimes(x => x.ply(2))", description: "Change about half the hits at random", category: "structure" },
  { name: "often", template: ".often(x => x.crush(4))", description: "Change most of the hits at random", category: "structure" },
  { name: "rarely", template: ".rarely(x => x.ply(2))", description: "Change only a few hits at random", category: "structure" },
  { name: "degradeBy", template: ".degradeBy(.2)", description: "Leave out about 20% of the hits", category: "structure" },
  { name: "chunk", template: ".chunk(4, x => x.add(note(7)))", description: "Change one quarter of the pattern at a time", category: "structure" },
  { name: "euclid", template: ".euclid(3, 8)", description: "Spread 3 hits evenly over 8 steps", category: "structure" },
  { name: "euclidRot", template: ".euclidRot(3, 8, 2)", description: "Spread 3 hits over 8 steps, starting 2 steps in", category: "structure" },
  { name: "struct", template: '.struct("x ~ x x")', description: "Play only on the steps marked x", category: "structure" },
  { name: "mask", template: '.mask("1 1 0 1")', description: "Silence the steps marked 0", category: "structure" },
  { name: "off", template: ".off(1/8, x => x.add(note(7)))", description: "Layer a copy that starts an eighth later and sits a fifth higher", category: "structure" },

  // sound & effects
  { name: "lpf", template: ".lpf(sine.range(400, 1400).slow(8))", description: "Sweep the brightness open and closed over 8 cycles", category: "sound" },
  { name: "hpf", template: ".hpf(300)", description: "Cut the low end below 300 Hz", category: "sound" },
  { name: "crush", template: ".crush(6)", description: "Crunch the sound with a lo-fi bit crusher", category: "sound" },
  { name: "coarse", template: ".coarse(8)", description: "Make the sound grainy by lowering its sample rate", category: "sound" },
  { name: "vowel", template: '.vowel("<a e i o>")', description: "Shape the sound like a vowel, changing each cycle", category: "sound" },
  { name: "distort", template: ".distort(1)", description: "Add warm distortion", category: "sound" },
  { name: "phaser", template: ".phaser(2)", description: "Add a slow swooshing phaser", category: "sound" },
  { name: "attack", template: ".attack(.1)", description: "Fade each note in over a tenth of a second", category: "sound" },
  { name: "decay", template: ".decay(.2)", description: "Make each note fall away after a fifth of a second", category: "sound" },
  { name: "sustain", template: ".sustain(0)", description: "Let each note die away completely after the decay", category: "sound" },
  { name: "release", template: ".release(.5)", description: "Let each note ring out for half a second after it ends", category: "sound" },
  { name: "fm", template: ".fm(2)", description: "Add a metallic FM tone", category: "sound" },
  { name: "room", template: ".room(.6).roomsize(4)", description: "Put the sound in a medium-sized room", category: "sound" },
  { name: "delay", template: ".delay(.4).delaytime(.125).delayfeedback(.4)", description: "Add an echo that repeats a few times", category: "sound" },

  // stereo
  { name: "jux", template: ".jux(rev)", description: "Play the original on the left and a reversed copy on the right", category: "stereo" },
  { name: "pan", template: ".pan(sine.range(.2, .8).slow(4))", description: "Drift slowly between left and right", category: "stereo" },

  // sampling
  { name: "chop", template: ".chop(8)", description: "Cut each sample into 8 even pieces", category: "sampling" },
  { name: "slice", template: '.slice(4, "0 2 1 3")', description: "Cut a sample into 4 parts and play them in a new order", category: "sampling" },
  { name: "striate", template: ".striate(4)", description: "Weave 4 slices of a sample through each other", category: "sampling" },
  { name: "loopAt", template: ".loopAt(2)", description: "Fit a sample loop to 2 cycles", category: "sampling" },
  { name: "speed", template: ".speed(.5)", description: "Play the sample at half speed, an octave lower", category: "sampling" },

  // harmony
  { name: "add", template: ".add(note(7))", description: "Move every note up 7 semitones (a fifth)", category: "harmony" },
  { name: "transpose", template: ".transpose(12)", description: "Move every note up an octave", category: "harmony" },
  { name: "scale", template: '.scale("C:minor")', description: "Snap notes into a scale", category: "harmony" },
  { name: "scaleTranspose", template: ".scaleTranspose(2)", description: "Move every note up 2 steps along the scale", category: "harmony" },
  { name: "arp", template: '.arp("0 1 2 1")', description: "Play the notes of each chord one after another", category: "harmony" },
  { name: "voicing", template: ".voicing()", description: "Spread chord symbols into smooth, close notes", category: "harmony" },
];

export function modifiersByCategory(category: ModifierCategory): ModifierDef[] {
  return MODIFIERS.filter((m) => m.category === category);
}

export function findModifier(name: string): ModifierDef | undefined {
  return MODIFIERS.find((m) => m.name === name);
}

/**
 * Search the catalog by function name, template or description (case-insensitive, every word must match).
 * Name matches rank first (exact, then prefix), so `lp` finds `lpf` before anything that merely mentions it.
 */
export function searchModifiers(query: string): ModifierDef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...MODIFIERS];
  const scored: { def: ModifierDef; score: number; index: number }[] = [];
  MODIFIERS.forEach((def, index) => {
    const name = def.name.toLowerCase();
    const haystack = `${name} ${def.template.toLowerCase()} ${def.description.toLowerCase()} ${def.category}`;
    if (!words.every((w) => haystack.includes(w))) return;
    let score = 0;
    const first = words[0] ?? "";
    if (name === first) score = 3;
    else if (name.startsWith(first)) score = 2;
    else if (name.includes(first)) score = 1;
    scored.push({ def, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((s) => s.def);
}
