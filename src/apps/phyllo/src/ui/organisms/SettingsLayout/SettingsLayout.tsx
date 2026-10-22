import { useEffect } from "react";
import type { MouseEvent } from "react";
import { AccentPicker } from "../AccentPicker";
import { AudioSection } from "./AudioSection";
import { CodeEditorSection } from "./CodeEditorSection";
import { GeneralSection } from "./GeneralSection";
import { MidiSection } from "./MidiSection";
import { SampleFoldersSection } from "./SampleFoldersSection";
import { SETTINGS_SECTIONS, sectionDomId } from "./sections";
import type { SettingsSectionId } from "./sections";
import { SettingsSection } from "./SettingsSection";
import { ShortcutsSection } from "./ShortcutsSection";
import { SystemSection } from "./SystemSection";
import { scrollToSection, useScrollSpy } from "./useScrollSpy";
import styles from "./settings.module.css";

export interface SettingsLayoutProps {
  /** "Open version history…" (System). The Settings window asks the main window to open it. */
  onOpenHistory?: () => void;
  /** Section to scroll to on mount (deep links, stories). Default: the top. */
  initialSection?: SettingsSectionId;
  /** Replaces the engine's list of built-in sound URLs for "Download built-in sounds" (stories, tests). */
  listSoundUrls?: () => Promise<string[]>;
  className?: string;
}

/**
 * The Settings window's content: a section nav (highlights the section in view, click to scroll) and one long
 * page of sections. Every value comes from `useSettings()` / `useNative()` / `useTips()` and the engine host, so
 * it works in the separate Settings window without any Arrange state.
 */
export function SettingsLayout({ onOpenHistory, initialSection, listSoundUrls, className }: SettingsLayoutProps) {
  const { active, goTo } = useScrollSpy(initialSection ?? SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    if (initialSection) scrollToSection(initialSection, false);
  }, [initialSection]);

  function handleNavClick(event: MouseEvent<HTMLAnchorElement>, id: SettingsSectionId) {
    // The app routes on the URL hash (#/settings), so the anchor must not navigate.
    event.preventDefault();
    goTo(id);
  }

  const classes = className ? `${styles["root"]} ${className}` : styles["root"];

  return (
    <div className={classes}>
      <div className={styles["navColumn"]}>
        <nav aria-label="Settings sections" className={styles["nav"]}>
          <h1 className={styles["navTitle"]}>Settings</h1>
          {SETTINGS_SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${sectionDomId(id)}`}
              className={styles["navLink"]}
              aria-current={active === id ? "true" : undefined}
              onClick={(event) => handleNavClick(event, id)}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>

      <main className={styles["main"]}>
        <div className={styles["topFade"]} aria-hidden="true" />
        <div className={styles["content"]}>
          <GeneralSection />
          <SettingsSection
            id="appearance"
            title="Appearance"
            description="The accent colors play, selection, meters, toggles and code keywords. Track colors stay your own."
          >
            <AccentPicker />
          </SettingsSection>
          <AudioSection listSoundUrls={listSoundUrls} />
          <MidiSection />
          <SampleFoldersSection />
          <ShortcutsSection />
          <CodeEditorSection />
          <SystemSection onOpenHistory={onOpenHistory} />
        </div>
        <div className={styles["bottomFade"]} aria-hidden="true" />
      </main>
    </div>
  );
}
