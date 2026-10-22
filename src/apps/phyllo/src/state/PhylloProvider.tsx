import { useEffect } from "react";
import type { ReactNode } from "react";
import { ContextMenuProvider } from "../ui/contextMenu";
import { PhylloStoresContext } from "./context";
import type { AppStores } from "./createAppStores";

export interface PhylloProviderProps {
  stores: AppStores;
  /** Call `stores.start()` on mount (load settings, scan the library). Default true. Idempotent. */
  autoStart?: boolean;
  children: ReactNode;
}

/**
 * Provides the app stores to every hook, and right-click menus (`useContextMenu`). The stores outlive the provider: whoever created them
 * (`createAppStores` in main.tsx, `createMockStores` in a story/test) calls `dispose()`.
 */
export function PhylloProvider({ stores, autoStart = true, children }: PhylloProviderProps) {
  useEffect(() => {
    if (autoStart) void stores.start();
  }, [stores, autoStart]);
  return (
    <PhylloStoresContext.Provider value={stores}>
      <ContextMenuProvider native={stores.native}>{children}</ContextMenuProvider>
    </PhylloStoresContext.Provider>
  );
}
