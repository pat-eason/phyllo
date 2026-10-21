import { ExportDialog } from "../organisms/ExportDialog";

export interface ExportSlotProps {
  open: boolean;
  onClose(): void;
}

/** The shell owns the open state (⌘E, File › Export…, AppHeader › Export); the dialog owns the job. */
export function ExportSlot({ open, onClose }: ExportSlotProps) {
  return <ExportDialog open={open} onClose={onClose} />;
}
