/** A text field, select or editor, whose own menu (and Shift+F10) must win over any Phyllo menu around it. */
export function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null;
}

/**
 * The selection as it was before the current right-click. WebKit selects the word under the pointer on a right
 * mousedown, before `contextmenu` fires, so reading the selection at `contextmenu` time would treat every
 * right-click on text as "selected text". `undefined` = no right-click recorded (keyboard, tests): use the live one.
 */
let rangeBeforeRightClick: Range | null | undefined;

function liveRange(doc: Document): Range | null {
  const selection = doc.getSelection();
  return selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
}

/** Record the selection on every right (or macOS Ctrl+) mousedown, before WebKit changes it. */
export function watchRightClickSelection(doc: Document): () => void {
  function onMouseDown(event: MouseEvent) {
    const secondary = event.button === 2 || (event.button === 0 && event.ctrlKey);
    rangeBeforeRightClick = secondary ? (liveRange(doc)?.cloneRange() ?? null) : undefined;
  }
  doc.addEventListener("mousedown", onMouseDown, true);
  return () => {
    doc.removeEventListener("mousedown", onMouseDown, true);
    rangeBeforeRightClick = undefined;
  };
}

function rangeForContextMenu(doc: Document): Range | null {
  return rangeBeforeRightClick === undefined ? liveRange(doc) : rangeBeforeRightClick;
}

/**
 * Whether a right-click should keep the web view's own menu: text fields and editors (Cut/Copy/Paste, spelling)
 * and text the user had selected (Copy, Look Up). Everywhere else the web view menu only offers Back/Forward/Reload.
 */
export function wantsWebViewMenu(target: EventTarget | null, doc: Document): boolean {
  if (!(target instanceof Element)) return false;
  if (isTextEntry(target)) return true;
  return rangeForContextMenu(doc)?.intersectsNode(target) ?? false;
}

/** Drop the word WebKit selected on the right mousedown when a Phyllo menu (or none) takes the click instead. */
export function clearRightClickWordSelection(doc: Document): void {
  if (rangeBeforeRightClick === null) doc.getSelection()?.removeAllRanges();
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
    if (wantsWebViewMenu(event.target, doc)) return;
    event.preventDefault();
    clearRightClickWordSelection(doc);
  }
  doc.addEventListener("contextmenu", onContextMenu);
  return () => doc.removeEventListener("contextmenu", onContextMenu);
}
