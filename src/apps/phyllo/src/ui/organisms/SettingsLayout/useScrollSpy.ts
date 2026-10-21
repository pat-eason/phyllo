import { useCallback, useEffect, useState } from "react";
import { SETTINGS_SECTIONS, sectionDomId } from "./sections";
import type { SettingsSectionId } from "./sections";

/** A section counts as "in view" once its top edge is within this many px of the window top. */
const ACTIVE_OFFSET_PX = 140;

function currentSection(): SettingsSectionId | null {
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
  if (atBottom && window.scrollY > 0) return SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1]?.id ?? null;
  let active: SettingsSectionId | null = null;
  for (const { id } of SETTINGS_SECTIONS) {
    const element = document.getElementById(sectionDomId(id));
    if (element && element.getBoundingClientRect().top <= ACTIVE_OFFSET_PX) active = id;
  }
  return active;
}

/** Scrolls a section's top to the window top. Smooth only when asked and when motion isn't reduced. */
export function scrollToSection(id: SettingsSectionId, smooth: boolean): void {
  const element = document.getElementById(sectionDomId(id));
  if (!element || typeof element.scrollIntoView !== "function") return;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: smooth && !reduced ? "smooth" : "auto", block: "start" });
}

export interface ScrollSpy {
  active: SettingsSectionId;
  /** Scrolls to a section and marks it active right away. */
  goTo(id: SettingsSectionId): void;
}

/**
 * Which section the page is showing (scroll-spy over the window scroll) and how to jump to one. The nav is
 * highlighted from `active`; a click sets it at once so the highlight doesn't lag the smooth scroll.
 */
export function useScrollSpy(initial: SettingsSectionId): ScrollSpy {
  const [active, setActive] = useState<SettingsSectionId>(initial);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = currentSection();
      if (next !== null) setActive(next);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  const goTo = useCallback((id: SettingsSectionId) => {
    setActive(id);
    scrollToSection(id, true);
  }, []);

  return { active, goTo };
}
