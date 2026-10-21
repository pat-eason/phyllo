import { SettingRow, Slider, Switch } from "@phyllo/ui";
import { useId } from "react";
import { FONT_SIZE_MAX, FONT_SIZE_MIN, useCodeEditorPrefs } from "./codeEditorPrefs";
import { SettingsSection } from "./SettingsSection";
import styles from "./settings.module.css";

/** Font size and line numbers for the code drawer (kept on this device, not in the app settings). */
export function CodeEditorSection() {
  const { fontSize, lineNumbers, update } = useCodeEditorPrefs();
  const sizeId = useId();
  const linesId = useId();

  return (
    <SettingsSection
      id="editor"
      title="Code editor"
      description="How the code drawer looks. These are kept on this device. Wrapping long lines is coming later."
    >
      <div className={styles["group"]}>
        <SettingRow
          id={sizeId}
          title="Font size"
          help="Size of the code in the code drawer."
          control={
            <div className={styles["controlRow"]}>
              <Slider
                value={fontSize}
                onChange={(next) => update({ fontSize: next })}
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                label="Code font size"
                aria-labelledby={sizeId}
                valueText={(value) => `${value} pixels`}
                width={160}
              />
              <span className={styles["readout"]} aria-hidden="true">
                {fontSize} px
              </span>
            </div>
          }
        />
        <SettingRow
          id={linesId}
          title="Show line numbers"
          help="Numbers down the left edge of the code drawer."
          divider={false}
          control={<Switch checked={lineNumbers} onChange={(on) => update({ lineNumbers: on })} label="Show line numbers" aria-labelledby={linesId} />}
        />
      </div>
    </SettingsSection>
  );
}
