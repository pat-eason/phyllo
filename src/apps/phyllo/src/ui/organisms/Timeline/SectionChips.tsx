import { sectionAtBar } from "@phyllo/model";
import type { Section } from "@phyllo/model";
import { SectionChip } from "@phyllo/ui";
import type { SectionChipRenameHandle } from "@phyllo/ui";
import { memo, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { MouseEvent, Ref } from "react";
import { useContextMenuTrigger, usePositionFeed } from "../../../hooks";
import styles from "./Timeline.module.css";
import type { TimelineActions } from "./useTimelineActions";
import { useTimelineMenus } from "./useTimelineMenus";

/** What the Ruler asks of the chips: open the inline rename of a section, even one that has not rendered yet. */
export interface SectionChipsHandle {
  rename(sectionId: string): void;
}

export interface SectionChipsProps {
  sections: Section[];
  barWidth: number;
  actions: TimelineActions;
  handle?: Ref<SectionChipsHandle>;
}

/** Marks the chip under the playhead as current by writing its attributes (no React render per section change). */
function markCurrent(chips: Map<string, HTMLButtonElement>, currentId: string | null) {
  for (const [id, chip] of chips) {
    if (id === currentId) {
      chip.setAttribute("data-current", "");
      chip.setAttribute("aria-current", "true");
    } else {
      chip.removeAttribute("data-current");
      chip.removeAttribute("aria-current");
    }
  }
}

/**
 * Section row of the ruler. Click a chip to jump to the section, ⌥-click to loop it, double-click to rename.
 * Right-click (or Shift+F10) opens the section menu: Rename, Jump, Loop, Delete.
 * The current chip (section under the playhead, SPEC §6.1) follows `subscribePosition` outside React.
 */
export const SectionChips = memo(function SectionChips({ sections, barWidth, actions, handle }: SectionChipsProps) {
  const { subscribePosition } = usePositionFeed();
  const menus = useTimelineMenus(actions);
  const chips = useRef(new Map<string, HTMLButtonElement>());
  const renames = useRef(new Map<string, SectionChipRenameHandle>());
  /** A rename asked for before its chip rendered (a section just added from a menu). */
  const pendingRename = useRef<string | null>(null);
  const current = useRef<string | null>(null);
  const sectionsRef = useRef(sections);

  const startPendingRename = () => {
    const id = pendingRename.current;
    const rename = id === null ? undefined : renames.current.get(id);
    if (!rename) return;
    pendingRename.current = null;
    rename.start();
  };

  useImperativeHandle(handle, () => ({
    rename(sectionId) {
      pendingRename.current = sectionId;
      startPendingRename();
    },
  }));

  const menu = useContextMenuTrigger((target) => {
    const id = target.dataset["sectionId"] ?? "";
    return menus.section(id, () => renames.current.get(id)?.start());
  });

  useLayoutEffect(() => {
    sectionsRef.current = sections;
    startPendingRename();
    // Re-rendered chips (rename, resize) start without the attribute; put it back.
    markCurrent(chips.current, current.current);
  });

  useEffect(
    () =>
      subscribePosition((position) => {
        const id = sectionAtBar({ sections: sectionsRef.current }, position.bar)?.id ?? null;
        if (id === current.current) return;
        current.current = id;
        markCurrent(chips.current, id);
      }),
    [subscribePosition],
  );

  function onChipClick(section: Section, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.altKey) actions.setLoop({ enabled: true, startBar: section.startBar, endBar: section.endBar });
    else actions.seek(section.startBar);
  }

  return (
    <div className={styles["sections"]}>
      {sections.map((section) => (
        <div
          key={section.id}
          className={styles["sectionSlot"]}
          style={{ left: (section.startBar - 1) * barWidth, width: (section.endBar - section.startBar + 1) * barWidth }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <SectionChip
            ref={(node) => {
              if (node) chips.current.set(section.id, node);
              else chips.current.delete(section.id);
            }}
            className={styles["sectionChip"]}
            name={section.name}
            startBar={section.startBar}
            endBar={section.endBar}
            renameHandle={(node) => {
              if (node) renames.current.set(section.id, node);
              else renames.current.delete(section.id);
            }}
            current={false}
            data-section-id={section.id}
            onContextMenu={menu.onContextMenu}
            onKeyDown={menu.onKeyDown}
            dropRangeFirst
            title={`${section.name}: click to jump here, ⌥-click to loop it`}
            onClick={(event) => onChipClick(section, event)}
            onRename={(name) => actions.dispatch({ type: "section/update", sectionId: section.id, patch: { name } })}
          />
        </div>
      ))}
    </div>
  );
});
