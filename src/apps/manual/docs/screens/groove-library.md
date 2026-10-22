# Groove library

The groove library is your collection of projects. Phyllo calls a project a *groove*: each one is a `.phyllo` file in `~/Music/Phyllo`. Open the library with <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>L</kbd>. Phyllo also lands here when it starts, unless it's set to reopen your last groove (Settings › System) or you have no grooves yet, in which case you see Guided start.

![Groove library in grid view with collections, tags, search, sort, tile size, view toggle, a groove card, Import and New groove called out](/screenshots/library-grid.png)

<div class="callouts">

1. **Collections** — **All grooves**, **Favorites** (starred) and **Recent** (opened in the last 14 days), each with a count.
2. **Tags** — click a tag to show only grooves that have it; click more tags to narrow further (a groove must have all of them). **Manage** renames, merges or deletes tags across every groove. **New tag** adds one to the grooves you've selected in list view.
3. **Search** — matches names, tags, key, BPM and the sounds a groove uses. `c minor`, `124`, `lo-fi` and `808` all work.
4. **Sort** — Last edited, Name, Created or BPM.
5. **Tile size** — how big the cards are in grid view, from compact to large. Small sizes hide the details line.
6. **Grid / list view**.
7. **Groove card** — a punch-card picture of the first tracks' steps, then name, tempo, key, length, tags and when it was last edited. Click the picture to open the groove.
8. **Play** — previews the groove from its first section without opening it. Click again to stop.
9. **Star** — adds the groove to Favorites.
10. **Import…** — adds `.phyllo` or `.strudel` files to the library. Importing a single file opens it straight away.
11. **New groove** — goes to Guided start to pick a starter, tempo and key.

</div>

Tags are saved inside each `.phyllo` file, so they travel with it when you copy or share the file.

## List view and bulk actions

List view shows the same grooves as a table you can sort by clicking a column heading.

![Groove library in list view with columns for name, tags, BPM, key, length, tracks and edited date](/screenshots/library-list.png)

Click a row to select it, <kbd>⌘</kbd>-click to add or remove rows, and <kbd>⇧</kbd>-click to select a range. With rows selected, a bar appears with **Add tags**, **Move to Trash** and **Clear selection**, plus **Export…** when exactly one row is selected.

::: info
Export works on the open groove, so **Export…** opens the selected groove first (saving any pending edits to the one you had open) and then shows the [Export dialog](/screens/export) for it. Exporting several grooves in one go isn't supported yet.
:::

## Groove actions

Right-click a card or row (or press <kbd>⇧</kbd> <kbd>F10</kbd> on it) for everything else:

<div class="crop">

![Context menu for a groove: Open, Rename, Duplicate, Edit tags, Export…, Show in Finder, Move to Trash](/screenshots/library-context-menu.png)

</div>

- **Open**, **Rename**, **Duplicate**
- **Edit tags** — add existing or new tags, or remove them.
- **Export…** — opens the groove, then the [Export dialog](/screens/export) for it.
- **Show in Finder** — reveals the `.phyllo` file.
- **Move to Trash** — asks first, then moves the file to the system Trash, so you can still get it back from there.

## Autosave and version history

You never have to remember to save. With **Autosave and version history** on (Settings › System, on by default), Phyllo writes the open groove about a second and a half after each change, and the status bar shows when it last did. <kbd>⌘</kbd> <kbd>S</kbd> saves right away, and <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>S</kbd> saves a copy under a new name.

Every save also keeps a snapshot. To go back to one, open the project menu (click the groove's name at the top left) and choose **Version History…**:

<div class="crop">

![Project menu opened from the groove name, with Version History… highlighted](/screenshots/library-project-menu.png)

</div>

<div class="crop">

![Version history dialog listing two saved versions with Restore buttons](/screenshots/library-version-history.png)

</div>

Pick a time and press **Restore**. Restoring is an ordinary edit, so <kbd>⌘</kbd> <kbd>Z</kbd> undoes it if you picked the wrong one. Phyllo keeps the newest 50 versions of each groove, in `~/Music/Phyllo/.history/` (see [Files and storage](/reference/files)).

The same project menu also has **Rename**, **Save**, **Save As…**, **Show in Finder** and your recent grooves.
