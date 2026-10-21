import type { NativeApi } from "../native/api";
import { useAppStores } from "../state/context";

/**
 * design-system §5 `useNative()`: the `NativeApi` passthrough (`openDialog`, `saveDialog`, `revealInFinder`,
 * `notify`, MIDI, export, …). Stable for the app's lifetime; the browser implementation in stories/tests.
 */
export function useNative(): NativeApi {
  return useAppStores().native;
}
