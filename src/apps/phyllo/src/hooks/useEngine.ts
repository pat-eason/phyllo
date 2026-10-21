import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import type { EngineStoreState } from "../state/engineStore";

export type UseEngine = EngineStoreState & {
  /** §5 `meters`: the meter subscription (same as `subscribeMeters`). Values are pushed, not returned. */
  meters: EngineStoreState["subscribeMeters"];
};

/**
 * design-system §5 `useEngine()`: `{ code, scope, setScope, status, meters }` plus line map, per-track errors,
 * audio start, preview and meter subscriptions. Deviation: `meters` is a subscription (`meters(cb)` → unsubscribe;
 * ~30 Hz `MeterSnapshot`s) — meter values never live in React state. For one strip use `meterFor(trackId)`.
 */
export function useEngine(): UseEngine {
  const { engine } = useAppStores();
  return useStore(
    engine,
    useShallow((s) => ({ ...s, meters: s.subscribeMeters })),
  );
}

/** Meter subscriptions only; never re-renders the caller. */
export function useMeters(): Pick<EngineStoreState, "subscribeMeters" | "meterFor" | "orbitMeterFor" | "masterMeter"> {
  const { engine } = useAppStores();
  const s = engine.getState();
  return { subscribeMeters: s.subscribeMeters, meterFor: s.meterFor, orbitMeterFor: s.orbitMeterFor, masterMeter: s.masterMeter };
}
