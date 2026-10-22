import { cloneModifier, createModifier } from "@phyllo/model";
import type { Modifier, ParamName, ProjectAction, TrackSource } from "@phyllo/model";
import { useAppStores } from "../../../hooks";

/** Model edits the Inspector makes on one track; everything goes through `dispatch` (undoable, regenerates code). */
export interface InspectorActions {
  beginGesture(): void;
  endGesture(): void;
  rename(name: string): void;
  setSource(source: Partial<TrackSource>): void;
  setPattern(pattern: string): void;
  /** `null` removes the param (Strudel default, codegen omits it). */
  setParam(param: ParamName, value: number | null): void;
  /** Disables the modifiers that drive `param`, then sets the fixed value: one undo step. */
  replaceModulation(param: ParamName, value: number, drivers: readonly Modifier[]): void;
  /** Disables `modifiers` (they stay in the chain, switched off): one undo step. */
  disableModifiers(modifiers: readonly Modifier[]): void;
  addModifier(code: string, options?: { label?: string; origin?: Modifier["origin"] }): void;
  /** Inserts a ready-made modifier (Duplicate / Paste: give it a fresh id with `cloneModifier`) at `index`, default the end. */
  insertModifier(modifier: Modifier, index?: number): void;
  /** Appends a clone of `modifier` to another track's chain. */
  copyModifierToTrack(trackId: string, modifier: Modifier): void;
  updateModifier(modifierId: string, patch: Partial<Omit<Modifier, "id">>): void;
  removeModifier(modifierId: string): void;
  moveModifier(modifierId: string, toIndex: number): void;
}

/**
 * Actions bound to `trackId`. Reads the store's stable `dispatch`/gesture functions without subscribing, so the
 * Inspector doesn't re-render on unrelated model changes because of them.
 */
export function useInspectorActions(trackId: string): InspectorActions {
  const { project } = useAppStores();
  const store = project.getState();
  const dispatch = (action: ProjectAction) => store.dispatch(action);
  return {
    beginGesture: store.beginGesture,
    endGesture: store.endGesture,
    rename: (name) => dispatch({ type: "track/update", trackId, patch: { name } }),
    setSource: (source) => dispatch({ type: "track/setSource", trackId, source }),
    setPattern: (pattern) => dispatch({ type: "track/setPattern", trackId, pattern }),
    setParam: (param, value) => dispatch({ type: "track/setParam", trackId, param, value }),
    replaceModulation(param, value, drivers) {
      store.beginGesture();
      try {
        for (const m of drivers) dispatch({ type: "modifier/update", trackId, modifierId: m.id, patch: { enabled: false } });
        dispatch({ type: "track/setParam", trackId, param, value });
      } finally {
        store.endGesture();
      }
    },
    disableModifiers(modifiers) {
      store.beginGesture();
      try {
        for (const m of modifiers) dispatch({ type: "modifier/update", trackId, modifierId: m.id, patch: { enabled: false } });
      } finally {
        store.endGesture();
      }
    },
    insertModifier: (modifier, index) => dispatch({ type: "modifier/add", trackId, modifier, ...(index === undefined ? {} : { index }) }),
    copyModifierToTrack: (target, modifier) => dispatch({ type: "modifier/add", trackId: target, modifier: cloneModifier(modifier) }),
    addModifier: (code, options = {}) =>
      dispatch({ type: "modifier/add", trackId, modifier: createModifier(code, { origin: "user", ...options }) }),
    updateModifier: (modifierId, patch) => dispatch({ type: "modifier/update", trackId, modifierId, patch }),
    removeModifier: (modifierId) => dispatch({ type: "modifier/remove", trackId, modifierId }),
    moveModifier: (modifierId, toIndex) => dispatch({ type: "modifier/move", trackId, modifierId, toIndex }),
  };
}
