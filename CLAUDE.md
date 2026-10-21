# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm monorepo (`pnpm@10.34.5`, Node >=22) for strudel-daw. The repo is freshly scaffolded: the workspace roots exist but contain no packages yet, so no build, lint or test tooling is configured beyond the root scripts.

## Workspace layout

All source lives under `src/`. `pnpm-workspace.yaml` globs `src/apps/*`, `src/packages/*` and `src/shared/*`; a package must be a direct child of one of those directories to be picked up.

- `src/apps/` — live services (e.g. a Next.js app)
- `src/packages/` — isolated, contextual modules
- `src/shared/` — functionality or logic shared between apps and packages

Place new code by role: anything deployable goes in `apps`, self-contained modules in `packages`, and logic that both apps and packages consume in `shared`. Each of the three directories currently holds only a `.gitkeep`; delete it when adding the first package.

## Commands

Root scripts fan out across every workspace package with `pnpm -r`, so they only do work once a package defines the matching script:

```bash
pnpm install
pnpm build            # pnpm -r build
pnpm dev              # pnpm -r --parallel dev
pnpm lint             # pnpm -r lint
pnpm test             # pnpm -r test
pnpm --filter <name> <script>   # target a single package, e.g. run one package's tests
```
