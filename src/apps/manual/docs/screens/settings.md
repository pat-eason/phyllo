# Settings

Open Settings with <kbd>⌘</kbd> <kbd>,</kbd> or the sliders button in the header. Settings is one long page: the list on the left jumps to a section, and **Done** at the top right takes you back to your groove. Changes apply as you make them; there's nothing to save.

Settings belong to this Mac, not to a groove, so they don't travel with your `.phyllo` files.

![Settings in the dark theme with the section list and the Appearance section called out](/screenshots/settings-appearance.png)

<div class="callouts">

1. **Sections** — General, Appearance, Audio, MIDI & OSC, Sample folders, Shortcuts, Code editor, System.
2. **Appearance** — theme, accent colour and a live preview of both.

</div>

## General

<div class="crop">

![General settings: Default interface, Show tips in Guided mode, Projects folder](/screenshots/settings-general.png)

</div>

- **Default interface** — **Guided** or **Pro**, the mode Phyllo opens in. You can still switch any time with the switch in the header or <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>G</kbd>. It only changes what you see, never the groove. See [Guided and Pro](/guide/guided-and-pro).
- **Show tips in Guided mode** — the five-step tour that points at real controls. **Restart tips** starts it again from step one.
- **Projects folder** — where your `.phyllo` files and exports live (`~/Music/Phyllo` unless the `PHYLLO_HOME` environment variable says otherwise). **Show in Finder** opens it.

## Appearance

- **Theme** — **Dark**, **Light** or **Match system**.
- **Accent** — Green, Red, Blue, Purple, Orange or Teal. The accent colours the play button, selections, meters, switches and code keywords. Track colours are your own and don't change.
- **Preview** — shows the theme and accent on real controls before you leave the page.

## Audio

<div class="crop">

![Audio settings: Output device, Sample rate, Scheduling look-ahead and Offline sounds](/screenshots/settings-audio.png)

</div>

- **Output device** — greyed out on macOS: the system web view Phyllo plays through can't switch devices, so sound follows the system default output. Change it in System Settings › Sound.
- **Sample rate** — **Match device**, 44.1 kHz or 48 kHz. Exports can still choose their own rate.
- **Scheduling look-ahead** — how far ahead Phyllo schedules notes: 50, 100 (default), 150 or 250 ms. Raise it if playback stutters while the computer is busy; lower it if knob moves feel slow to reach your ears.
- **Offline sounds** — the built-in drum machines, synths and instruments load from the internet the first time they're used. **Download built-in sounds for offline use** fetches them all now, with progress and the size on disk; **Clear cache** frees the space. See [MIDI, OSC and sample folders](/screens/devices#offline-sounds).

## MIDI & OSC

Lists MIDI devices and the SuperDirt OSC output, with switches to turn each one on, plus **CC mapping** and the **SuperDirt address**. Everything here is explained on [MIDI, OSC and sample folders](/screens/devices).

## Sample folders

Link folders of your own audio files. Linked folders are watched: drop a file into one in Finder and it shows up in the sound library, ready to use as `s("name")`. Each folder shows **Watching**, or **Not found** if it has moved. See [Sample folders](/screens/devices#sample-folders).

## Shortcuts

A reference table of every keyboard shortcut, grouped by Transport, Tracks and tools, and so on. Keys work whenever you're not typing in a text field. ⌘ is Ctrl on Windows and Linux. Shortcuts can't be changed in this version. The full list is also in [Keyboard shortcuts](/reference/shortcuts).

## Code editor

How the [code drawer](/screens/code) looks:

- **Font size** — 12 to 16 px (12 by default).
- **Show line numbers** — on by default.

These two are kept in this app's local storage rather than with your other settings.

## System

<div class="crop">

![System settings: media keys, menu bar, file associations, reopen last groove, autosave and version history](/screenshots/settings-system.png)

</div>

- **Media keys control playback** (on) — the play/pause and skip keys on your keyboard work even when Phyllo is in the background.
- **Keep playing from the menu bar** (off) — closing the window leaves a small transport in the menu bar and the music keeps going. **Show Phyllo** brings the window back; **Quit Phyllo** ends it.
- **Open .phyllo and .strudel files with Phyllo** (on) — whether Phyllo opens files you double-click in Finder. Your system sets up the file association when Phyllo is installed; this switch decides whether Phyllo accepts them.
- **Reopen the last groove on launch** (off) — on: Phyllo opens straight into what you were working on. Off: it opens the library (or Guided start if you have no grooves yet).
- **Autosave and version history** (on) — saves every change shortly after you make it and keeps a snapshot each time. Turn it off and you save with <kbd>⌘</kbd> <kbd>S</kbd> yourself, with no version history.
- **Version history** — **Open version history…** jumps to the [version history](/screens/groove-library#autosave-and-version-history) of the open groove.
