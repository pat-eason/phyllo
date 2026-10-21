import { Kbd } from "@phyllo/ui";
import { SettingsSection } from "./SettingsSection";
import { SHORTCUT_GROUPS } from "./shortcuts";
import styles from "./settings.module.css";

/** Read-only reference of the keyboard shortcuts, grouped. */
export function ShortcutsSection() {
  return (
    <SettingsSection id="shortcuts" title="Shortcuts" description="Keys work when focus isn’t in a text field. ⌘ is Ctrl on Windows and Linux.">
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title} className={styles["tableWrap"]}>
          <table className={`${styles["table"]} ${styles["shortcutTable"]}`}>
            <caption className={styles["shortcutCaption"]}>{group.title}</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Keys</th>
              </tr>
            </thead>
            <tbody>
              {group.shortcuts.map((shortcut) => (
                <tr key={shortcut.action}>
                  <td>{shortcut.action}</td>
                  <td>
                    <span className={styles["shortcutKeys"]}>
                      {shortcut.keys.map((combo) => (
                        <Kbd key={combo.join("+")} keys={[...combo]} />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </SettingsSection>
  );
}
