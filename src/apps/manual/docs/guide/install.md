# Install and launch

Phyllo is a desktop app built with [Tauri 2](https://tauri.app). The sound comes from Strudel, running inside the app's web view, and a small Rust shell handles files, devices and the operating system. For now you build it from source. There's no signed installer yet.

## What you need

- **Node 22** or newer, and **pnpm 10**. Running `corepack enable` picks up the pinned `pnpm@10.34.5`.
- **Rust 1.95** or newer, plus the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS. On macOS that's the Xcode Command Line Tools.
- **A network connection** the first time you use the built-in drum machines and instruments. They load from Strudel's servers and then stay cached on disk. Synth sounds (`sawtooth`, `square`, `triangle`, `sine`, `supersaw`) work offline from the start.

Phyllo is developed and tested on macOS. The Rust side is cross-platform, but nobody has tested the Windows and Linux builds yet.

::: tip Going fully offline
**Settings › Audio › Download built-in sounds for offline use** fetches every built-in sound ahead of time. After that, Phyllo needs no network at all. See [Settings](/screens/settings).
:::

## Run it

From the repository root:

```bash
pnpm install
pnpm --filter phyllo tauri dev
```

The first run compiles the Rust side, which takes a minute or two. Later runs start in seconds.

### Running in a browser instead

To work on Phyllo's interface without Tauri, run only the frontend:

```bash
pnpm --filter phyllo dev      # then open http://localhost:1420
```

In a browser, an in-memory stand-in replaces the native layer. Projects are kept in the browser's `localStorage`, and exports arrive as downloads. Everything works except MIDI and OSC devices, linked sample folders and the real file system. This manual's screenshots are taken in this mode.

## Build a release app

```bash
pnpm --filter phyllo tauri build
```

The bundle lands in `src/apps/phyllo/src-tauri/target/release/bundle/`. On macOS that's `macos/Phyllo.app`. The build isn't code-signed or notarized, so macOS may refuse to open a copy that was downloaded or moved to another Mac until you allow it in **System Settings › Privacy & Security**.

To check a release build end to end, run the self-test. It builds `Phyllo.app`, launches it against a temporary data folder and drives the real app. It opens a starter, plays it, edits it, saves it, reopens it from the library and exports WAV, MIDI, `.strudel` and FLAC, then prints a pass/fail report.

```bash
pnpm --filter phyllo selftest      # add --skip-build to reuse the last build
```

## The first launch

Phyllo shows a short startup animation and then picks a screen:

- **Your library is empty** (the very first launch), so you land on **Guided start**. Pick a starter groove, set its tempo and key, and continue into the app. [Your first groove](/guide/first-groove) walks through it step by step.
- **You already have grooves**, so you land on the [Groove library](/screens/groove-library), where you can open one, preview it or make a new one.

Want Phyllo to pick up where you left off? Turn on **Settings › System › Reopen the last groove on launch**. Phyllo then opens your last project straight into Arrange, and falls back to the library if that file has gone.

![Guided start on first launch: starter cards, a strudel.cc import box and the header buttons called out](/screenshots/install-guided-start.png)

<div class="callouts">

1. **Starters**: six ready-made grooves, from House to Ambient, plus a blank project.
2. **Paste a strudel.cc link**: already have a Strudel sketch? Paste its link and press **Import**. Each `$:` pattern in it becomes its own track.
3. **Open project…**: open a `.phyllo` or `.strudel` file from disk.
4. **I know Strudel — skip to Pro**: skips the starters and opens an empty project in Pro mode. See [Guided and Pro](/guide/guided-and-pro).

</div>

Once you have saved a few grooves, launch opens the library instead:

![The Groove library with eight grooves, tags and favourites](/screenshots/install-library.png)

*The Groove library: every `.phyllo` file in your Phyllo folder.*

## Where your work is saved

New projects save themselves. Autosave files them into `~/Music/Phyllo` within a couple of seconds, and every save also keeps a snapshot in version history. Exports go to `~/Music/Phyllo/Exports`. [Files and storage](/reference/files) lists every location, including how to point Phyllo at another folder with `PHYLLO_HOME`.
