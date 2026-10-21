import { useStore } from "zustand";
import { useAppStores } from "../../../hooks";

/**
 * True while the transport is stopped/paused, for Meter `stopped` (SPEC §6.1 "Meters read 0 when stopped").
 * Re-renders the caller only on play/stop, never per position frame.
 */
export function useTransportStopped(): boolean {
  const { transport } = useAppStores();
  return useStore(transport, (s) => !s.playing);
}
