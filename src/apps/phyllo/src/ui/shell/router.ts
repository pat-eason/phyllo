import { useSyncExternalStore } from "react";

/**
 * Hash routes (no dependency). `#/pattern/<trackId>` opens the Pattern editor on one track; every other route
 * is a bare screen name. Unknown or empty hashes parse as `null` (the startup flow picks a screen).
 */
export type Route =
  | { screen: "start" }
  | { screen: "library" }
  | { screen: "arrange" }
  | { screen: "pattern"; trackId: string | null }
  | { screen: "mixer" }
  | { screen: "settings" };

export type ScreenName = Route["screen"];

/** Screens that show the open project (view tabs ⌘1/⌘2/⌘3). */
export const PROJECT_SCREENS: ReadonlySet<ScreenName> = new Set<ScreenName>(["arrange", "pattern", "mixer"]);

const SIMPLE: ReadonlySet<string> = new Set(["start", "library", "arrange", "mixer", "settings"]);

export function parseHash(hash: string): Route | null {
  const path = hash.replace(/^#/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (path === "") return null;
  const [head, ...rest] = path.split("/");
  if (head === "pattern") {
    const id = rest.length > 0 ? decodeURIComponent(rest.join("/")) : "";
    return { screen: "pattern", trackId: id === "" ? null : id };
  }
  if (head !== undefined && SIMPLE.has(head) && rest.length === 0) return { screen: head } as Route;
  return null;
}

export function formatRoute(route: Route): string {
  if (route.screen === "pattern" && route.trackId !== null) return `#/pattern/${encodeURIComponent(route.trackId)}`;
  return `#/${route.screen}`;
}

export function sameRoute(a: Route | null, b: Route | null): boolean {
  if (a === null || b === null) return a === b;
  return formatRoute(a) === formatRoute(b);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

const readHash = () => window.location.hash;

/** The current hash route; re-renders on `hashchange`. */
export function useHashRoute(): Route | null {
  const hash = useSyncExternalStore(subscribe, readHash, () => "");
  return parseHash(hash);
}

/** Go to `route`. `replace` swaps the history entry (startup redirects) instead of pushing one. */
export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const hash = formatRoute(route);
  if (window.location.hash === hash) return;
  if (options.replace) {
    const url = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(window.history.state, "", url);
    // replaceState doesn't fire hashchange; tell the router ourselves.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = hash;
}
