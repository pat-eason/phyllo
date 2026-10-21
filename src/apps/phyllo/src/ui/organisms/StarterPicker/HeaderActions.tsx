import { Button } from "@phyllo/ui";
import { useNative, useProject, useUiMode } from "../../../hooks";

const OPEN_FILTERS = [
  { name: "Phyllo project", extensions: ["phyllo"] },
  { name: "Strudel code", extensions: ["strudel"] },
];

export interface StarterPickerHeaderActionsProps {
  /** A project was opened or created (the screen leaves Guided start). */
  onOpened: () => void;
  /** Called with a message when opening fails; a cancelled dialog is silent. */
  onError?: (message: string) => void;
}

/**
 * "Open project…" and "I know Strudel — skip to Pro". `StarterPicker` renders them in its own compact header;
 * a screen that supplies its own `AppHeader` passes `showHeader={false}` and places this in `actions`.
 */
export function StarterPickerHeaderActions({ onOpened, onError }: StarterPickerHeaderActionsProps) {
  const native = useNative();
  const { newProject, openProject } = useProject();
  const { setMode } = useUiMode();

  const openFromDisk = async () => {
    try {
      const picked = await native.openDialog({ title: "Open project", filters: OPEN_FILTERS });
      const path = Array.isArray(picked) ? picked[0] : picked;
      if (path === null || path === undefined) return;
      const result = await openProject(path);
      if (result.ok) onOpened();
      else if (result.cancelled !== true) onError?.(result.error);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : String(error));
    }
  };

  const skipToPro = () => {
    newProject("blank");
    setMode("pro");
    onOpened();
  };

  return (
    <>
      <Button onClick={() => void openFromDisk()}>Open project…</Button>
      <Button variant="ghost" onClick={skipToPro}>
        I know Strudel — skip to Pro
      </Button>
    </>
  );
}
