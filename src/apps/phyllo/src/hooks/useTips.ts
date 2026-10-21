import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import type { TipsStoreState } from "../state/tipsStore";

export type UseTips = TipsStoreState;

/**
 * design-system §5 `useTips()`: `{ step, total, current, next(), hide() }` plus `visible`, `show()`, `showMe()`
 * and `highlight` (the `data-tip-target` to outline). Steps 1–4 complete themselves from project actions;
 * call `complete(5)` after an export or a copied share link.
 */
export function useTips(): UseTips {
  const { tips } = useAppStores();
  return useStore(
    tips,
    useShallow((s) => ({ ...s })),
  );
}
