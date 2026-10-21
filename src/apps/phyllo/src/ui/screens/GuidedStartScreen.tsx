import { AppHeader } from "../organisms/AppHeader";
import { StarterPicker, StarterPickerHeaderActions } from "../organisms/StarterPicker";
import { useShell } from "../shell/shellContext";
import styles from "./screens.module.css";

/** Guided start (`03`): first launch and File › New. Scrolls as a page; any created/opened project goes to Arrange. */
export function GuidedStartScreen() {
  const shell = useShell();
  const toArrange = () => shell.navigate({ screen: "arrange" });
  return (
    <div className={styles["page"]}>
      <AppHeader
        variant="compact"
        hideProjectName
        actions={
          <StarterPickerHeaderActions
            onOpened={toArrange}
            onError={(message) => shell.notify({ title: "Couldn't open the groove", detail: message, tone: "error" })}
          />
        }
      />
      <StarterPicker showHeader={false} onOpened={toArrange} />
    </div>
  );
}
