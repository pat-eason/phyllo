import { navigate } from "../../shell/router";

/** Opens Settings: the `#/settings` screen inside the app window. */
export function useOpenSettings(): () => void {
  return () => navigate({ screen: "settings" });
}
