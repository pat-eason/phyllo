# Phyllo

A desktop DAW-style interface built around [Strudel](https://strudel.cc), the JavaScript port of TidalCycles for live-coding music.

Phyllo is a [Tauri](https://tauri.app) v2 app with a React frontend. Audio runs in the webview via Strudel and Web Audio.

> Early scaffold: the app currently renders a themed shell (tokens, fonts, ThemeProvider).

## Requirements

- Node >= 22
- pnpm 10
- Rust (stable) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Getting started

```bash
pnpm install
pnpm --filter phyllo tauri dev
```

The first run compiles the Rust side, which takes a minute.

## Repository layout

pnpm monorepo; all source lives under `src/`.

| Path | Description |
| --- | --- |
| `src/apps/phyllo` | Tauri v2 desktop app (React + Vite, Rust in `src-tauri/`) |
| `src/packages/engine` | `@phyllo/engine`: thin wrapper over `@strudel/web` (`init`, `play`, `stop`) |
| `src/packages/ui` | `@phyllo/ui`: design tokens, ThemeProvider, fonts, atoms/molecules, Storybook |
| `src/shared/model` | `@phyllo/model`: project model (skeleton) |

## Scripts

```bash
pnpm build   # build every package
pnpm check   # typecheck + lint + test across packages
pnpm e2e     # Playwright smoke test (run `pnpm --filter phyllo exec playwright install chromium` once)
pnpm stories # Storybook for @phyllo/ui
pnpm dev     # Vite frontend only, in a browser (use the tauri command above for the desktop app)
```
