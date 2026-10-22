# Files and storage

Phyllo keeps your work as ordinary files you can back up, sync or put under version control.

## Where things live

| What | Where |
| --- | --- |
| Projects (grooves) | `~/Music/Phyllo/*.phyllo` |
| Exports | `~/Music/Phyllo/Exports/` |
| Version history | `~/Music/Phyllo/.history/<project id>/` |
| Cached built-in sounds | `~/Music/Phyllo/.cache/sounds/` |
| Settings (theme, devices, preferences) | The app's config folder; on macOS `~/Library/Application Support/com.phyllo.app` |

Set the `PHYLLO_HOME` environment variable to use a different folder instead of `~/Music/Phyllo`. Everything in the first four rows moves with it.

## File types

`.phyllo`
: A Phyllo project. It's JSON (`"format": "phyllo/1"`) holding the tempo, key, sections, tracks, clips, mixer settings, tags and favourite flag. Tags live inside the file, so they travel with it when you copy it to another machine.

`.strudel`
: Plain Strudel code. Phyllo can open one (each `$:` block becomes a track) and export one. Paste its contents into [strudel.cc](https://strudel.cc) and it plays.

Double-clicking either kind in Finder opens it in Phyllo, as long as **Settings › System** allows file associations (it does by default).

## Saving, autosave and history

- **Save** (<kbd>⌘</kbd> <kbd>S</kbd>) writes the project to its `.phyllo` file. A new groove gets a file named after the project the first time it's saved.
- **Autosave** is on by default (**Settings › System**). About a second and a half after your last change, Phyllo writes the file again, and the status bar shows *Autosaved* with the time.
- **Version history**: every save, manual or automatic, also stores a snapshot while autosave is on. Phyllo keeps the 50 newest snapshots per project. Open them from the project menu (click the project name in the header) under **Version History…**.
- Switching to another project never loses pending edits: an autosave that hasn't run yet is written out first.
- **Move to Trash** in the [groove library](/screens/groove-library) moves the file to the system Trash, so you can still recover it from there.

## Running in a browser

When you run only the frontend (`pnpm --filter phyllo dev`, see [Install and launch](/guide/install)), there's no file system. Projects live in the browser's `localStorage` under a pretend `/Phyllo` folder, version history lasts only until you reload, and exports download through the browser. Clearing the site's data clears your grooves, so use the desktop app for anything you want to keep.
