/**
 * Whether a right-click should keep the web view's own menu: text fields and editors (Cut/Copy/Paste, spelling)
 * and selected text (Copy, Look Up). Everywhere else the web view menu only offers Back/Forward/Reload.
 */
export function wantsWebViewMenu(target: EventTarget | null, selection: Selection | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return true;
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return selection.getRangeAt(0).intersectsNode(target);
}

export interface SuppressOptions {
  /** Keep the web view menu on ⌥-right-click so Inspect Element stays reachable in debug builds. */
  allowWithAlt: boolean;
}

/**
 * Hide the web view's Back/Forward/Reload menu wherever no Phyllo menu handled the right-click. Runs on `document`
 * in the bubble phase, after React's handlers, so a handled event is already `defaultPrevented`.
 */
export function suppressWebViewMenu(doc: Document, options: SuppressOptions): () => void {
  function onContextMenu(event: MouseEvent) {
    if (event.defaultPrevented) return;
    if (options.allowWithAlt && event.altKey) return;
    if (wantsWebViewMenu(event.target, doc.getSelection())) return;
    event.preventDefault();
  }
  doc.addEventListener("contextmenu", onContextMenu);
  return () => doc.removeEventListener("contextmenu", onContextMenu);
}
