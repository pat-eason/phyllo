import type { TipTarget } from "@phyllo/model";
import { useTips } from "../../../hooks";

/** True while the tips card's "Show me" points at `target` (pulsing accent outline on that control). */
export function useTipHighlight(target: TipTarget | undefined): boolean {
  const { highlight } = useTips();
  return target !== undefined && highlight === target;
}
