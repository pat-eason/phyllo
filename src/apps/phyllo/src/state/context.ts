import { createContext, useContext } from "react";
import type { AppStores } from "./createAppStores";

export const PhylloStoresContext = createContext<AppStores | null>(null);

/** The app stores from the nearest `<PhylloProvider>`. Throws outside one (organisms need a provider or mocks). */
export function useAppStores(): AppStores {
  const stores = useContext(PhylloStoresContext);
  if (!stores) throw new Error("Phyllo hooks need a <PhylloProvider stores={…}> (use createMockStores() in stories/tests).");
  return stores;
}
