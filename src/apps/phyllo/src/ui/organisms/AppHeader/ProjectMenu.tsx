import { Icon, compactMenu } from "@phyllo/ui";
import type { MenuEntryInput } from "@phyllo/ui";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useContextMenuTrigger, useLibrary, useNative, useProject, useProjectFile } from "../../../hooks";
import styles from "./ProjectMenu.module.css";
import { projectMenuEntries, projectMenuGroups } from "./projectMenuEntries";
import type { ProjectMenuCommands } from "./projectMenuEntries";

const RECENT_LIMIT = 5;

type MenuView = "closed" | "menu" | "rename";

export interface ProjectMenuProps {
  /** Opens the version history dialog (owned by the screen). The menu item is disabled without it. */
  onVersionHistory?: () => void;
  /** Opens the export dialog (owned by the screen). The menu has no Export item without it. */
  onExport?: () => void;
}

/**
 * Project name button with its menu: Rename (inline), Save, Save As…, Show in Finder, Recent, Version History…, Export…
 * Right-clicking the button opens the same items (one builder, `projectMenuGroups`).
 * A menu-button pattern: arrows move between items, Escape closes and returns focus to the button.
 */
export function ProjectMenu({ onVersionHistory, onExport }: ProjectMenuProps) {
  const { projectName, filePath, saving, save, saveAs } = useProjectFile();
  const { dispatch } = useProject();
  const native = useNative();
  const [view, setView] = useState<MenuView>("closed");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const renameDone = useRef(false);

  // Outside clicks close the menu; the listener only exists while it is open.
  useEffect(() => {
    if (view !== "menu") return undefined;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setView("closed");
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [view]);

  function close(restoreFocus: boolean) {
    setView("closed");
    if (restoreFocus) buttonRef.current?.focus();
  }

  /** Menu actions close the menu (focus back on the trigger) and then run. */
  function run(action: () => void) {
    close(true);
    action();
  }

  function startRename() {
    renameDone.current = false;
    setView("rename");
  }

  function finishRename(save: boolean, name: string) {
    if (renameDone.current) return;
    renameDone.current = true;
    const next = name.trim();
    if (save && next !== "" && next !== projectName) dispatch({ type: "project/rename", name: next });
    close(true);
  }

  const commands: ProjectMenuCommands = {
    rename: startRename,
    save: () => void save(),
    saveAs: () => void saveAs(),
    reveal: filePath ? () => void native.revealInFinder(filePath) : undefined,
    versionHistory: onVersionHistory,
    exportProject: onExport,
  };
  const trigger = useContextMenuTrigger(() => {
    if (view === "rename") return null;
    setView("closed");
    return { label: "Project", entries: projectMenuEntries({ saving }, commands), returnFocus: buttonRef.current };
  });
  return (
    <div ref={rootRef} className={styles["root"]}>
      <button
        ref={buttonRef}
        type="button"
        className={styles["trigger"]}
        aria-haspopup="menu"
        aria-expanded={view === "menu"}
        data-renaming={view === "rename" ? "" : undefined}
        tabIndex={view === "rename" ? -1 : undefined}
        onClick={() => setView(view === "menu" ? "closed" : "menu")}
        onContextMenu={trigger.onContextMenu}
        onKeyDown={(event) => {
          trigger.onKeyDown(event);
          if (event.key === "ArrowDown" && view === "closed") {
            event.preventDefault();
            setView("menu");
          }
        }}
      >
        <span className={styles["name"]}>{projectName}</span>
        <Icon name="chevron-down" size={14} />
      </button>
      {view === "rename" ? (
        <input
          ref={focusAndSelect}
          className={styles["renameInput"]}
          aria-label="Project name"
          defaultValue={projectName}
          maxLength={80}
          onBlur={(event) => finishRename(true, event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== "Escape") return;
            // Focus moves to the trigger below; without this the Enter keypress would activate it and reopen the menu.
            event.preventDefault();
            finishRename(event.key === "Enter", event.currentTarget.value);
          }}
        />
      ) : null}
      {view === "menu" ? (
        <MenuPanel onClose={close}>
          <DropdownItems
            saving={saving}
            commands={commands}
            currentPath={filePath}
            run={run}
            onRecentPicked={() => close(false)}
          />
        </MenuPanel>
      ) : null}
    </div>
  );
}

function focusAndSelect(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

interface MenuPanelProps {
  onClose: (restoreFocus: boolean) => void;
  children: React.ReactNode;
}

function MenuPanel({ onClose, children }: MenuPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  function items(): HTMLButtonElement[] {
    return Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  }

  // Focus the first item as the menu opens, so the keyboard lands inside it.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const index = all.findIndex((item) => item === document.activeElement);
    const move = (to: number) => {
      event.preventDefault();
      all[(to + all.length) % all.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(all.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        onClose(true);
        break;
      case "Tab":
        onClose(false);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={panelRef} role="menu" aria-label="Project" tabIndex={-1} className={styles["panel"]} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

interface DropdownItemsProps {
  saving: boolean;
  commands: ProjectMenuCommands;
  currentPath: string | null;
  /** Closes the dropdown (focus back on the trigger), then runs the action. */
  run: (action: () => void) => void;
  onRecentPicked: () => void;
}

/** The dropdown's items from the shared builder, with Recent between the file actions and the rest. */
function DropdownItems({ saving, commands, currentPath, run, onRecentPicked }: DropdownItemsProps) {
  const groups = projectMenuGroups(
    { saving },
    {
      ...commands,
      save: () => run(commands.save),
      saveAs: () => run(commands.saveAs),
      reveal: commands.reveal && (() => run(() => commands.reveal?.())),
      versionHistory: commands.versionHistory && (() => run(() => commands.versionHistory?.())),
      exportProject: commands.exportProject && (() => run(() => commands.exportProject?.())),
    },
  );
  return (
    <>
      <MenuItems entries={groups.file} />
      <RecentProjects currentPath={currentPath} onPicked={onRecentPicked} />
      <hr className={styles["rule"]} />
      <MenuItems entries={groups.more} />
    </>
  );
}

/** Renders builder entries as menu buttons; the project menu only has plain items. */
function MenuItems({ entries }: { entries: MenuEntryInput[] }) {
  return (
    <>
      {compactMenu(entries).map((entry) =>
        entry.type === "separator" ? (
          <hr key="rule" className={styles["rule"]} />
        ) : entry.type === "submenu" ? null : (
          <MenuItem key={entry.id} label={entry.label} disabled={entry.disabled} onSelect={entry.onSelect} />
        ),
      )}
    </>
  );
}

interface MenuItemProps {
  label: string;
  onSelect: () => void;
  disabled?: boolean | undefined;
}

function MenuItem({ label, onSelect, disabled = false }: MenuItemProps) {
  return (
    <button type="button" role="menuitem" className={styles["item"]} disabled={disabled} onClick={onSelect}>
      {label}
    </button>
  );
}

interface RecentProjectsProps {
  currentPath: string | null;
  onPicked: () => void;
}

/** Last opened grooves from the library. Mounted only while the menu is open, so the header never subscribes to it. */
function RecentProjects({ currentPath, onPicked }: RecentProjectsProps) {
  const { grooves, open } = useLibrary();
  const recent = grooves
    .filter((groove) => groove.opened !== null && groove.path !== currentPath)
    .sort((a, b) => Date.parse(b.opened ?? "") - Date.parse(a.opened ?? ""))
    .slice(0, RECENT_LIMIT);

  if (recent.length === 0) return null;
  return (
    <>
      <hr className={styles["rule"]} />
      <div role="group" aria-label="Recent">
        <div className={styles["groupLabel"]} aria-hidden="true">
          Recent
        </div>
        {recent.map((groove) => (
          <MenuItem
            key={groove.path}
            label={groove.name}
            onSelect={() => {
              void open(groove.path);
              onPicked();
            }}
          />
        ))}
      </div>
    </>
  );
}
