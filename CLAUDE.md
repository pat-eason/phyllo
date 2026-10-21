# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm monorepo (`pnpm@10.34.5`, Node >=22) for strudel-daw, a DAW-style UI around Strudel. The desktop app is **Phyllo**, a Tauri v2 + React + Vite app. Rust 1.95+ is required for the Tauri side. Every package has `typecheck` (`tsc --noEmit`), `lint` (ESLint) and `test` (Vitest); `pnpm check` runs all three. Dependency versions live in the `catalog:` block of `pnpm-workspace.yaml` (new deps are pinned exact).

## Workspace layout

All source lives under `src/`. `pnpm-workspace.yaml` globs `src/apps/*`, `src/packages/*` and `src/shared/*`; a package must be a direct child of one of those directories to be picked up.

- `src/apps/` — live services (e.g. a Next.js app)
- `src/packages/` — isolated, contextual modules
- `src/shared/` — functionality or logic shared between apps and packages

Place new code by role: anything deployable goes in `apps`, self-contained modules in `packages`, and logic that both apps and packages consume in `shared`. Current packages:

- `src/apps/phyllo` — Tauri v2 desktop app (React frontend, Rust in `src-tauri/`)
- `src/packages/ui` (`@phyllo/ui`) — design tokens (`tokens.css`/`tokens.json`, verbatim copies of `__inspiration/mockups/design-system`), `ThemeProvider`, bundled fonts, atoms and molecules, Storybook stories. Must not depend on `@phyllo/engine` or Tauri. Organisms, screens and stores live in the app.
- `src/shared/model` (`@phyllo/model`) — project model skeleton (types and pure helpers).
- `src/packages/engine` (`@phyllo/engine`) — thin wrapper over `@strudel/web` (`init`, `play`, `stop`). `@strudel/web` ships no types, so `src/strudel-web.d.ts` declares the subset used; keep that declaration referenced from `index.ts` so consuming apps' `tsc` picks it up.

## Commands

Root scripts fan out across every workspace package with `pnpm -r`, so they only do work once a package defines the matching script:

```bash
pnpm install
pnpm build            # pnpm -r build
pnpm dev              # pnpm -r --parallel dev
pnpm typecheck        # pnpm -r typecheck
pnpm lint             # pnpm -r lint (ESLint flat config at the repo root)
pnpm test             # pnpm -r test (Vitest)
pnpm check            # typecheck + lint + test (what CI runs)
pnpm e2e              # Playwright user flows against the Vite dev server (port 1420); `pnpm --filter phyllo e2e:visual` for screen captures
pnpm stories          # Storybook for @phyllo/ui on port 6006
pnpm --filter <name> <script>   # target a single package, e.g. run one package's tests
```

Run the desktop app with `pnpm --filter phyllo tauri dev` (not root `pnpm dev`, which only starts the Vite frontend in a browser). Audio needs a user gesture, so `play` must be called from a click handler.
