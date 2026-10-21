import { useNative } from "../../hooks";
import { SettingsScreen } from "../screens";
import { SHELL_CHANNEL } from "./bridgeModel";
import type { ShellMessage } from "./bridgeModel";

/**
 * The Settings window (desktop: its own web view labelled `settings`; browser: the `#/settings` popup). Only the
 * Settings screen; app-level requests such as "Open version history…" go to the main window over a broadcast.
 */
export function SettingsWindow() {
  const native = useNative();
  const openHistory = () => {
    const message: ShellMessage = { type: "openHistory" };
    native.broadcast(SHELL_CHANNEL, message).catch(() => undefined);
  };
  return <SettingsScreen onOpenHistory={openHistory} />;
}
