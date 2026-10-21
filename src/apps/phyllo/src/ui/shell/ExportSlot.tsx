export interface ExportSlotProps {
  open: boolean;
  onClose(): void;
}

/**
 * PLACEHOLDER — merge slot for the ExportDialog organism (`src/ui/organisms/ExportDialog`, props
 * `{ open: boolean; onClose(): void }`), built in parallel and not in this branch. The shell already owns the open
 * state (⌘E, File › Export…, AppHeader › Export); at merge, replace this body with
 * `return <ExportDialog open={open} onClose={onClose} />;`.
 */
export function ExportSlot(_props: ExportSlotProps) {
  return null;
}
