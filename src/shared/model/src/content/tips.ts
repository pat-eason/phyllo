/**
 * Guided tips curriculum (SPEC §6.1 "Tips card"): five fixed steps shown one at a time.
 *
 * "Show me" highlights the control named by `target`. Organisms mark their controls with
 * `data-tip-target="<TipTarget>"`; the ids below are the stable contract between this list and the UI.
 */

export const TIP_TARGETS = [
  /** Library › Starters tab (Guided) or the Starter cards on Guided start */
  "starter-picker",
  /** Mute button on a track row */
  "track-mute",
  /** Solo button on a track row */
  "track-solo",
  /** Brightness knob in the inspector (`.lpf()`) */
  "inspector-knob-lpf",
  /** "Try one" suggestion buttons in the inspector */
  "inspector-try-one",
  /** Pattern text field in the inspector */
  "inspector-pattern",
  /** Export button in the title bar */
  "header-export",
] as const;

export type TipTarget = (typeof TIP_TARGETS)[number];

export type TipStep = 1 | 2 | 3 | 4 | 5;

export interface Tip {
  id: string;
  /** 1-based position in the curriculum */
  step: TipStep;
  title: string;
  /** One sentence that names real controls with their Guided labels */
  body: string;
  /** Label of the primary button */
  action: string;
  target: TipTarget;
}

export const TIPS: readonly Tip[] = [
  {
    id: "pick-a-starter",
    step: 1,
    title: "Start from a groove",
    body: "Open the Starters tab on the left and pick a groove, then press Play to hear it.",
    action: "Show me",
    target: "starter-picker",
  },
  {
    id: "mute-and-solo",
    step: 2,
    title: "Hear one part at a time",
    body: "Press Mute on a track to take it out of the mix, or Solo to listen to only that track.",
    action: "Show me",
    target: "track-mute",
  },
  {
    id: "shape-a-sound",
    step: 3,
    title: "Give the bass some movement",
    body: "Turn Brightness on the right, or pick a suggestion under Try one, and watch the code below change with it.",
    action: "Show me",
    target: "inspector-knob-lpf",
  },
  {
    id: "edit-a-pattern",
    step: 4,
    title: "Change the notes",
    body: "Type in the Pattern box on the right, or press Edit pattern, to change which steps play.",
    action: "Show me",
    target: "inspector-pattern",
  },
  {
    id: "export-or-share",
    step: 5,
    title: "Take it with you",
    body: "Press Export to save your groove as audio, or Copy strudel.cc link to share the code.",
    action: "Show me",
    target: "header-export",
  },
];

export const TIP_COUNT = TIPS.length;

/** The tip for a 1-based step, or undefined past the end of the curriculum. */
export function tipForStep(step: number): Tip | undefined {
  return TIPS.find((t) => t.step === step);
}

/** Step to show after `step`; stays on the last tip. */
export function nextTipStep(step: number): TipStep {
  return Math.min(TIP_COUNT, Math.max(1, Math.floor(step) + 1)) as TipStep;
}
