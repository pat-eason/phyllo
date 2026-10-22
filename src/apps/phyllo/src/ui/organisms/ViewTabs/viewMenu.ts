import type { MenuEntryInput } from "@phyllo/ui";
import { acceleratorFor } from "../../shell/shortcuts";
import type { ShellActionId } from "../../shell/shortcuts";
import type { ViewName } from "./ViewTabs";

const VIEW_CHOICES: readonly { view: ViewName; label: string; action: ShellActionId }[] = [
  { view: "arrange", label: "Arrange", action: "view.arrange" },
  { view: "pattern", label: "Pattern editor", action: "view.pattern" },
  { view: "mixer", label: "Mixer", action: "view.mixer" },
  { view: "library", label: "Groove library", action: "view.library" },
];

/** Right-click menu of a view tab: every view, the current one checked; choosing one navigates like its tab. */
export function viewMenuEntries(current: ViewName, onNavigate: (view: ViewName) => void): MenuEntryInput[] {
  return VIEW_CHOICES.map(({ view, label, action }) => ({
    id: view,
    label,
    checked: view === current,
    accelerator: acceleratorFor(action),
    onSelect: () => {
      if (view !== current) onNavigate(view);
    },
  }));
}
