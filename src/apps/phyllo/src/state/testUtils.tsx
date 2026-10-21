import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";
import { PhylloProvider } from "./PhylloProvider";
import { createMockStores } from "./mocks";
import type { MockStores, MockStoresOptions } from "./mocks";

/** A pinned clock for tests that use fake timers: 2026-10-21 12:41 local. */
export const PINNED_NOW = new Date(2026, 9, 21, 12, 41, 0);

export interface RenderWithStoresResult extends RenderResult {
  stores: MockStores;
}

/** Renders `ui` under a `<PhylloProvider>` with mock stores (no auto start unless asked). */
export function renderWithStores(
  ui: ReactElement,
  options: MockStoresOptions & { stores?: MockStores; autoStart?: boolean } = {},
): RenderWithStoresResult {
  const { stores: given, autoStart = false, ...storeOptions } = options;
  const stores = given ?? createMockStores(storeOptions);
  const result = render(
    <PhylloProvider stores={stores} autoStart={autoStart}>
      {ui}
    </PhylloProvider>,
  );
  return { ...result, stores };
}
