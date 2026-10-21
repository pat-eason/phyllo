import { useEffect, useEffectEvent } from "react";
import type { RunAction } from "./actions";
import { describeTarget, matchShortcut } from "./shortcuts";
import type { ShortcutContext } from "./shortcuts";

/**
 * The app's single global `keydown` listener (SPEC §7). It runs after every component handler (window, bubble
 * phase) and skips events they already handled, keys typed into fields/editors, and anything while a modal is open.
 */
export function useGlobalShortcuts(run: RunAction, context: Omit<ShortcutContext, "modalOpen">): void {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const modalOpen = document.querySelector('[aria-modal="true"]') !== null;
    const shortcut = matchShortcut(event, { ...context, modalOpen }, describeTarget(event.target));
    if (!shortcut) return;
    event.preventDefault();
    run(shortcut.action);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}
