# Phylo

A desktop DAW-style interface built around [Strudel](https://strudel.cc), the JavaScript port of TidalCycles for live-coding music.

Phylo is a [Tauri](https://tauri.app) v2 app with a React frontend. Audio runs in the webview via Strudel and Web Audio.

> Early scaffold: the app currently has a single Play/Stop button that plays a demo pattern.

## Requirements

- Node >= 22
- pnpm 10
- Rust (stable) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Getting started

```bash
pnpm install
pnpm --filter phylo tauri dev
```

The first run compiles the Rust side, which takes a minute.

## Repository layout

pnpm monorepo; all source lives under `src/`.

| Path | Description |
| --- | --- |
| `src/apps/phylo` | Tauri v2 desktop app (React + Vite, Rust in `src-tauri/`) |
| `src/packages/engine` | `@phylo/engine`: thin wrapper over `@strudel/web` (`init`, `play`, `stop`) |
| `src/shared` | Code shared between apps and packages (empty for now) |

## Scripts

```bash
pnpm build   # build every package
pnpm lint    # tsc --noEmit across packages
pnpm dev     # Vite frontend only, in a browser (use the tauri command above for the desktop app)
```
