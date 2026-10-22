import { Button, Chip, EmptyState } from "@phyllo/ui";
import type { GrooveSummary } from "@phyllo/model";
import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { isContextMenuKey, useAudition, useContextMenu, useLibrary, useNative } from "../../../hooks";
import type { ContextMenuRequest } from "../../../hooks";
import { useToasts } from "../../toasts";
import { grooveCount } from "./format";
import { GrooveGrid } from "./GrooveGrid";
import { GrooveTable } from "./GrooveTable";
import styles from "./GrooveBrowser.module.css";
import { createGrooveActions } from "./grooveActions";
import type { Notice } from "./grooveActions";
import { grooveMenuEntries } from "./grooveMenu";
import { LibrarySidebar } from "./LibrarySidebar";
import { LibraryToolbar } from "./LibraryToolbar";
import { ManageTagsDialog } from "./ManageTagsDialog";
import type { Panel } from "./ManageTagsDialog";
import { firstSectionBar, readGroove } from "./readGroove";
import { RenameDialog } from "./RenameDialog";
import { hasTag } from "./tags";
import { TagEditorDialog } from "./TagEditorDialog";
import { TrashDialog } from "./TrashDialog";
import { useRowSelection } from "./useRowSelection";
import { useSearchText } from "./useSearchText";

export interface GrooveBrowserProps {
  /** Called after a groove was opened in the project store; the screen navigates to Arrange. */
  onOpenGroove?: (path: string) => void;
  /**
   * "Export…" for one groove (its menu, or the list selection bar with one row selected). The groove is opened first,
   * since export works on the open project; without this prop the action is hidden.
   */
  onExportGroove?: (path: string) => void;
  /** Empty library: the "New groove" button. */
  onNewGroove?: () => void;
  /** Empty library: the "Import..." button. */
  onImport?: () => void;
  /** Clock for "Today, 12:41" style labels. Default: the time the browser mounted. */
  now?: Date | number;
  className?: string;
}

type DialogState =
  | { kind: "rename"; groove: GrooveSummary }
  | { kind: "tags"; targets: GrooveSummary[] }
  | { kind: "trash"; targets: GrooveSummary[] }
  | { kind: "manage"; initialPanel?: Panel };

/**
 * The Groove library: collections and tags on the left, search / sort / tile size / view on top, then the grooves as
 * a grid of tiles or a table. All state comes from `useLibrary()`; file operations go through its actions.
 */
export function GrooveBrowser({ onOpenGroove, onExportGroove, onNewGroove, onImport, now, className }: GrooveBrowserProps) {
  const library = useLibrary();
  const native = useNative();
  const [mountedAt] = useState(() => Date.now());
  const clock = new Date(now ?? mountedAt);

  const search = useSearchText(library.query, library.setQuery);
  const selection = useRowSelection(library.results.map((groove) => groove.path));
  const [pendingTags, setPendingTags] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const contextMenu = useContextMenu();
  const toasts = useToasts();
  const setNotice = ({ tone, text }: Notice) => void toasts.push({ title: text, tone: tone === "error" ? "error" : "neutral" });
  const returnFocus = useRef<HTMLElement | null>(null);
  const { auditioning, audition, stop } = useAudition();

  const actions = createGrooveActions({ library, native, notify: setNotice, onOpenGroove, onExportGroove });
  const listView = library.view === "list";
  const selectedPaths = listView ? selection.selected : [];
  const selectedGrooves = library.grooves.filter((g) => selectedPaths.includes(g.path));
  // Export works on one groove at a time (it becomes the open project), so the bar offers it for a single row only.
  const exportable = onExportGroove && selectedGrooves.length === 1 ? selectedGrooves[0] : undefined;
  const unusedPending = pendingTags.filter((tag) => !hasTag(library.tags.map((t) => t.name), tag));
  const tagSuggestions = [...library.tags.map((t) => t.name), ...unusedPending];
  const filtersActive = library.selectedTags.length > 0 || library.query !== "";

  // Play on a tile or row auditions the groove's first section as a clean preview; the open project comes back on stop.
  function previewGroove(groove: GrooveSummary) {
    if (auditioning === groove.path) {
      stop();
      return;
    }
    audition(groove.path, () => readGroove(native, groove), { startBar: firstSectionBar }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      setNotice({ tone: "error", text: `Couldn't play ${groove.name}: ${reason}` });
    });
  }

  // Opening ends the audition first so the previous project (and its unsaved-changes guard) is back in place.
  function openGroove(groove: GrooveSummary) {
    stop();
    void actions.open(groove);
  }

  function clearAll() {
    search.reset();
    library.clearFilters();
  }

  function restoreFocus() {
    queueMicrotask(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    });
  }

  function closeDialog() {
    setDialog(null);
    restoreFocus();
  }

  function exportGroove(groove: GrooveSummary) {
    stop();
    void actions.exportGroove(groove);
  }

  // DAW convention: right-clicking an unselected row selects just that row; on a selected row the menu covers the selection.
  function buildGrooveMenu(groove: GrooveSummary): ContextMenuRequest | null {
    const inSelection = listView && selection.isSelected(groove.path);
    if (listView && !inSelection) selection.select(groove.path, "only");
    const paths = inSelection ? selection.selected : [groove.path];
    const targets = library.grooves.filter((g) => paths.includes(g.path));
    return {
      label: targets.length > 1 ? `Actions for ${targets.length} grooves` : "Groove actions",
      entries: grooveMenuEntries(targets, {
        open: openGroove,
        rename: (target) => setDialog({ kind: "rename", groove: target }),
        duplicate: (target) => void actions.duplicate(target),
        reveal: (target) => void actions.reveal(target),
        editTags: (list) => setDialog({ kind: "tags", targets: list }),
        exportGroove: onExportGroove ? exportGroove : undefined,
        setFavorite: (list, favorite) => void actions.setFavorite(list, favorite),
        trash: (list) => setDialog({ kind: "trash", targets: list }),
      }),
    };
  }

  function openContextMenu(groove: GrooveSummary, event: MouseEvent<HTMLElement>) {
    returnFocus.current = null;
    const request = buildGrooveMenu(groove);
    if (request) contextMenu.openFromEvent(event, request);
  }

  function openContextKey(groove: GrooveSummary, event: KeyboardEvent<HTMLElement>) {
    if (!isContextMenuKey(event)) return;
    event.preventDefault();
    event.stopPropagation();
    returnFocus.current = event.target instanceof HTMLElement ? event.target : null;
    const request = buildGrooveMenu(groove);
    if (request) contextMenu.openAtElement(event.currentTarget, request);
  }

  function createTag(name: string) {
    const exists = hasTag(tagSuggestions, name);
    const targets = library.grooves.filter((groove) => selectedPaths.includes(groove.path));
    if (targets.length > 0) {
      void actions.addTag(targets, name).then((error) => {
        setNotice(error ? { tone: "error", text: error } : { tone: "info", text: `Added ${name} to ${grooveCount(targets.length)}.` });
      });
    } else if (exists) {
      setNotice({ tone: "info", text: `${name} already exists.` });
    } else {
      setPendingTags((current) => [...current, name]);
      setNotice({ tone: "info", text: `${name} will be saved once a groove uses it. Select rows in list view, or right-click a groove and choose Edit tags.` });
    }
  }

  function openManage(initialPanel?: Panel) {
    returnFocus.current = null;
    setDialog({ kind: "manage", ...(initialPanel ? { initialPanel } : {}) });
  }

  function mergeTag(tag: string, into: string) {
    void actions.rewriteTag(tag, into).then((error) => {
      setNotice(error ? { tone: "error", text: error } : { tone: "info", text: `Merged ${tag} into ${into}.` });
    });
  }

  const handlers = {
    onOpen: openGroove,
    onPreview: previewGroove,
    onFavoriteChange: (groove: GrooveSummary) => void actions.toggleFavorite(groove),
    onContextMenu: openContextMenu,
    onContextKey: openContextKey,
  };

  return (
    <div className={className ? `${styles["root"]} ${className}` : styles["root"]} data-view={library.view}>
      <LibrarySidebar
        collection={library.collection}
        counts={library.counts}
        onCollectionChange={library.setCollection}
        tags={library.tags}
        pendingTags={unusedPending}
        selectedTags={library.selectedTags}
        onToggleTag={library.toggleTag}
        onDismissPending={(tag) => setPendingTags((current) => current.filter((t) => t !== tag))}
        selectedGrooveCount={selectedPaths.length}
        onCreateTag={createTag}
        onManageTags={() => openManage()}
        onRenameTag={(tag) => openManage({ tag, mode: "rename" })}
        onDeleteTag={(tag) => openManage({ tag, mode: "delete" })}
        onMergeTag={mergeTag}
      />

      <section className={styles["main"]} aria-label="Groove library">
        <LibraryToolbar
          searchText={search.text}
          onSearchTextChange={(text) => search.change(text)}
          sort={library.sort}
          onSortChange={library.setSort}
          tileSize={library.tileSize}
          onTileSizeChange={library.setTileSize}
          view={library.view}
          onViewChange={library.setView}
        />

        <div className={styles["filters"]}>
          <span className={styles["count"]} role="status">
            {grooveCount(library.results.length)}
          </span>
          {library.selectedTags.map((tag) => (
            <Chip key={tag} variant="removable" removeLabel={`Remove filter ${tag}`} onRemove={() => library.toggleTag(tag)}>
              {tag}
            </Chip>
          ))}
          {filtersActive ? (
            <button type="button" className={styles["clearAll"]} onClick={clearAll}>
              Clear all
            </button>
          ) : null}
        </div>

        {selectedPaths.length > 0 ? (
          <div className={styles["bulkBar"]} role="toolbar" aria-label="Selected grooves">
            <span className={styles["bulkCount"]}>{selectedPaths.length} selected</span>
            <Button
              size="sm"
              onClick={() => {
                returnFocus.current = null;
                setDialog({ kind: "tags", targets: selectedGrooves });
              }}
            >
              Add tags
            </Button>
            {exportable ? (
              <Button size="sm" onClick={() => exportGroove(exportable)}>
                Export…
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => {
                returnFocus.current = null;
                setDialog({ kind: "trash", targets: selectedGrooves });
              }}
            >
              Move to Trash
            </Button>
            <Button size="sm" variant="ghost" onClick={selection.clear}>
              Clear selection
            </Button>
          </div>
        ) : null}

        <div className={styles["content"]}>
          {library.error ? (
            <div className={styles["problem"]} role="alert">
              <span>Couldn&apos;t read your grooves: {library.error}</span>
              <Button size="sm" onClick={() => void library.refresh()}>
                Try again
              </Button>
            </div>
          ) : !library.loaded ? (
            <p className={styles["quiet"]} role="status">
              Loading grooves...
            </p>
          ) : library.grooves.length === 0 ? (
            <div className={styles["emptyStack"]}>
              <EmptyState
                title="No grooves yet"
                body="Make your first groove, or import a .phyllo or .strudel file."
                action={onNewGroove ? { label: "New groove", onClick: onNewGroove } : undefined}
              />
              {onImport ? (
                <Button variant="ghost" onClick={onImport}>
                  Import...
                </Button>
              ) : null}
            </div>
          ) : library.results.length === 0 ? (
            <EmptyState
              title={emptyTitle(library.collection, filtersActive)}
              body={emptyBody(library.collection, filtersActive)}
              action={filtersActive ? { label: "Clear filters", onClick: clearAll } : undefined}
            />
          ) : listView ? (
            <GrooveTable
              grooves={library.results}
              now={clock}
              sort={library.sort}
              onSortChange={library.setSort}
              selection={selection}
              previewingPath={auditioning}
              {...handlers}
            />
          ) : (
            <GrooveGrid grooves={library.results} size={library.tileSize} now={clock} previewingPath={auditioning} {...handlers} />
          )}
          {library.scanErrors.length > 0 ? (
            <p className={styles["quiet"]}>{library.scanErrors.length === 1 ? "1 file couldn't be read." : `${library.scanErrors.length} files couldn't be read.`}</p>
          ) : null}
        </div>
      </section>

      {dialog?.kind === "rename" ? (
        <RenameDialog name={dialog.groove.name} onRename={(name) => actions.rename(dialog.groove, name)} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === "tags" ? (
        <TagEditorDialog
          targets={dialog.targets}
          suggestions={tagSuggestions}
          onSave={(tags) => actions.saveTags(dialog.targets, tags)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === "trash" ? (
        <TrashDialog names={dialog.targets.map((g) => g.name)} onConfirm={() => actions.trash(dialog.targets)} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === "manage" ? <ManageTagsDialog tags={library.tags} onRewrite={actions.rewriteTag} onClose={closeDialog} initialPanel={dialog.initialPanel} /> : null}
    </div>
  );
}

function emptyTitle(collection: "all" | "favorites" | "recent", filtersActive: boolean): string {
  if (filtersActive) return "No grooves match";
  if (collection === "favorites") return "No favorites yet";
  if (collection === "recent") return "Nothing opened recently";
  return "No grooves match";
}

function emptyBody(collection: "all" | "favorites" | "recent", filtersActive: boolean): string {
  if (filtersActive) return "Try a different word, or remove a tag filter.";
  if (collection === "favorites") return "Tap the star on a groove to keep it here.";
  if (collection === "recent") return "Grooves you open in the last 14 days show up here.";
  return "Try a different word, or remove a tag filter.";
}
