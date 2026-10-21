import { AppHeader } from "../organisms/AppHeader";
import { MixerStrips } from "../organisms/MixerStrips";
import { ScreenTabs } from "./ScreenTabs";
import styles from "./screens.module.css";

/**
 * Mixer (`05`): compact header with the view tabs; one strip per track / bus + master. The "Faders write `.gain()`…"
 * hint that screens.md puts in the header is rendered by MixerStrips itself, so the header carries no actions
 * (showing it twice would repeat the sentence).
 */
export function MixerScreen() {
  return (
    <div className={styles["screen"]}>
      <AppHeader className={styles["chrome"]} variant="compact" viewTabs={<ScreenTabs current="mixer" />} />
      <main className={styles["mixer"]} aria-label="Mixer">
        <MixerStrips />
      </main>
    </div>
  );
}
