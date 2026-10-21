import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useAppStores } from "../state/context";
import type { TransportStoreState } from "../state/transportStore";

export type UseTransport = TransportStoreState;

/**
 * design-system §5 `useTransport()`. Deviation: `position` is a snapshot (updated on play/pause/stop/seek),
 * not live — live playhead/readouts use `subscribePosition(cb)`, which pushes every frame outside React.
 * `play()` must run inside a click/key handler (it starts audio first).
 */
export function useTransport(): UseTransport {
  const { transport } = useAppStores();
  return useStore(
    transport,
    useShallow((s) => ({ ...s })),
  );
}

/** Just the subscription (playhead, position readout): never re-renders the caller. */
export function usePositionFeed(): Pick<TransportStoreState, "subscribePosition" | "getPosition"> {
  const { transport } = useAppStores();
  const state = transport.getState();
  return { subscribePosition: state.subscribePosition, getPosition: state.getPosition };
}
