import { TIPS, TIP_COUNT, nextTipStep, tipForStep } from "@phyllo/model";
import type { ProjectAction, Tip, TipStep, TipTarget } from "@phyllo/model";
import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import type { Unsubscribe } from "./feed";
import type { SettingsStoreState } from "./settingsStore";

export interface TipsStoreState {
  /** 1-based curriculum step (persisted in `settings.tips.step`). */
  step: TipStep;
  total: number;
  current: Tip;
  /** Guided mode, not hidden for the session, not turned off in Settings. */
  visible: boolean;
  /** "Hide tips" pressed in this session. */
  sessionHidden: boolean;
  /** Turned off in Settings (`settings.tips.hidden`), or the curriculum is finished. */
  disabled: boolean;
  /** Control to outline after "Show me" (organisms match `data-tip-target`); cleared after 4 s. */
  highlight: TipTarget | null;

  /** Advance one step; finishing the last step turns tips off (persisted). */
  next(): void;
  /** Hide for this session only (TipCard "Hide tips"). */
  hide(): void;
  /** Show again (clears the session hide and the Settings switch). */
  show(): void;
  /** Settings › General "Show tips in Guided mode". */
  setEnabled(on: boolean): void;
  /** Back to step 1 and visible (Settings "Reset tips"). */
  reset(): void;
  showMe(): void;
  clearHighlight(): void;
  /** Mark a step done from outside the model (step 5: export finished or share link copied). */
  complete(step: TipStep): void;
}

export interface TipsStoreDeps {
  settings: StoreApi<SettingsStoreState>;
  /** Project actions, to notice completed steps (TipCoach curriculum). */
  onAction(callback: (action: ProjectAction) => void): Unsubscribe;
  highlightMs: number;
}

export interface TipsStoreHandle {
  store: StoreApi<TipsStoreState>;
  dispose(): void;
}

/** Which step a model action completes (TipCoach doc "Curriculum"). */
export function stepCompletedBy(action: ProjectAction): TipStep | null {
  switch (action.type) {
    case "project/load":
      return 1;
    case "track/setMute":
    case "track/setSolo":
      return 2;
    case "track/setParam":
    case "modifier/add":
      return 3;
    case "track/setPattern":
      return 4;
    default:
      return null;
  }
}

const clampStep = (step: number): TipStep => Math.min(TIP_COUNT, Math.max(1, Math.round(step))) as TipStep;

export function createTipsStore(deps: TipsStoreDeps): TipsStoreHandle {
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  const settingsNow = () => deps.settings.getState().settings;
  const derive = (sessionHidden: boolean) => {
    const s = settingsNow();
    const step = clampStep(s.tips.step);
    return {
      step,
      current: tipForStep(step) ?? (TIPS[0] as Tip),
      disabled: s.tips.hidden,
      visible: s.uiMode === "guided" && !s.tips.hidden && !sessionHidden,
    };
  };

  const store = createStore<TipsStoreState>()((set, get) => ({
    ...derive(false),
    total: TIP_COUNT,
    sessionHidden: false,
    highlight: null,
    next() {
      const step = get().step;
      if (step >= TIP_COUNT) deps.settings.getState().set("tips", { hidden: true });
      else deps.settings.getState().set("tips", { step: nextTipStep(step) });
      get().clearHighlight();
    },
    hide() {
      set({ sessionHidden: true, ...derive(true) });
      get().clearHighlight();
    },
    show() {
      set({ sessionHidden: false });
      deps.settings.getState().set("tips", { hidden: false });
      set(derive(false));
    },
    setEnabled(on) {
      deps.settings.getState().set("tips", { hidden: !on });
      if (on) set({ sessionHidden: false, ...derive(false) });
    },
    reset() {
      set({ sessionHidden: false });
      deps.settings.getState().set("tips", { hidden: false, step: 1 });
      set(derive(false));
    },
    showMe() {
      clearTimeout(highlightTimer);
      set({ highlight: get().current.target });
      highlightTimer = setTimeout(() => {
        highlightTimer = undefined;
        set({ highlight: null });
      }, deps.highlightMs);
    },
    clearHighlight() {
      clearTimeout(highlightTimer);
      highlightTimer = undefined;
      if (get().highlight !== null) set({ highlight: null });
    },
    complete(step) {
      const state = get();
      if (state.disabled || state.step !== step) return;
      state.next();
    },
  }));

  const offSettings = deps.settings.subscribe((state, prev) => {
    if (state.settings === prev.settings) return;
    store.setState(derive(store.getState().sessionHidden));
  });
  const offActions = deps.onAction((action) => {
    const step = stepCompletedBy(action);
    if (step !== null) store.getState().complete(step);
  });

  return {
    store,
    dispose() {
      clearTimeout(highlightTimer);
      offSettings();
      offActions();
    },
  };
}
