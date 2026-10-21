import { useNative } from "../../../hooks";

/** Opens the Settings window; where the native layer can't, falls back to the `#/settings` route. */
export function useOpenSettings(): () => void {
  const native = useNative();
  return () => {
    native.openSettingsWindow().catch(() => {
      window.location.hash = "#/settings";
    });
  };
}
