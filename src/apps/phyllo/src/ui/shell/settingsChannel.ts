import type { Settings } from "@phyllo/model";
import type { NativeApi } from "../../native/api";
import type { SettingsChannel } from "../../state";

/**
 * Valid broadcast name for settings sync. The state layer's default channel uses `phyllo:settings`, which
 * `native.broadcast` rejects (letters, digits, `-`, `_` only), so main.tsx passes this channel instead.
 */
export const SETTINGS_SYNC_CHANNEL = "phyllo-settings";

/** Settings sync between the main and Settings windows over `native.broadcast` / `onBroadcast` (D94, D103). */
export function createSettingsSyncChannel(native: Pick<NativeApi, "broadcast" | "onBroadcast">): SettingsChannel {
  const listeners = new Set<(raw: unknown) => void>();
  let unlisten: (() => void) | null = null;
  let closed = false;
  native
    .onBroadcast(SETTINGS_SYNC_CHANNEL, (payload) => {
      for (const listener of [...listeners]) listener(payload);
    })
    .then((off) => {
      if (closed) off();
      else unlisten = off;
    })
    .catch((error: unknown) => console.warn("[phyllo] settings sync unavailable", error));
  return {
    post: (settings: Settings) => {
      native.broadcast(SETTINGS_SYNC_CHANNEL, settings).catch((error: unknown) => console.warn("[phyllo] settings sync", error));
    },
    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    close() {
      closed = true;
      unlisten?.();
    },
  };
}
