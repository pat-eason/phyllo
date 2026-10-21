/**
 * Drag payloads the library starts. Drop targets (Timeline lanes, Inspector modifier list) read them from
 * `event.dataTransfer.getData(...)` and `JSON.parse` the result.
 *
 * - Sounds: `SOUND_DRAG_MIME` (`application/x-phyllo-sound`) carries a `SoundRef`
 *   (`{ source: "bank" | "synth" | "soundfont" | "sample", name, bank? }`). Drum sounds are `source: "bank"` with
 *   the drum bank id in `bank`; synths are `"synth"`, General MIDI instruments `"soundfont"`, linked-folder files `"sample"`.
 * - Modifiers (Pro Snippets): `MODIFIER_DRAG_MIME` (`application/x-phyllo-modifier`) carries a
 *   `ModifierDragPayload`. The drop target adds `code` to the track as a modifier
 *   (`modifier/add` with `createModifier(code, { label, origin: "user" })`).
 */
export const MODIFIER_DRAG_MIME = "application/x-phyllo-modifier";

export interface ModifierDragPayload {
  /** Strudel function name without the dot: `lpf` */
  name: string;
  /** Ready-to-insert chained call with the leading dot: `.lpf(sine.range(400, 1400).slow(8))` */
  code: string;
  /** Plain-language description, used as the modifier's label. */
  label: string;
}
