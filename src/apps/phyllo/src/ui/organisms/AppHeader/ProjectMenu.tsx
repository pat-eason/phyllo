import { Icon } from "@phyllo/ui";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLibrary, useNative, useProject, useProjectFile } from "../../../hooks";
import styles from "./ProjectMenu.module.css";

const RECENT_LIMIT = 5;

type MenuView = "closed" | "menu" | "rename";

export interface ProjectMenuProps {
  /** Opens the version history dialog (owned by the screen). The menu item is disabled without it. */
  onVersionHistory?: () => void;
}

/**
 * Project name button with its menu: Rename (inline), Save, Save As…, Show in Finder, Recent, Version History…
 * A menu-button pattern: arrows move between items, Escape closes and returns focus to the button.
 */
export function ProjectMenu({ onVersionHistory }: ProjectMenuProps) {
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
        onKeyDown={(event) => {
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
          <MenuItem label="Rename" onSelect={startRename} />
          <MenuItem label="Save" disabled={saving} onSelect={() => run(() => void save())} />
          <MenuItem label="Save As…" onSelect={() => run(() => void saveAs())} />
          {filePath ? (
            <MenuItem label="Show in Finder" onSelect={() => run(() => void native.revealInFinder(filePath))} />
          ) : null}
          <RecentProjects currentPath={filePath} onPicked={() => close(false)} />
          <hr className={styles["rule"]} />
          <MenuItem label="Version History…" disabled={!onVersionHistory} onSelect={() => run(() => onVersionHistory?.())} />
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

interface MenuItemProps {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
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
