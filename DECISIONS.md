# Decisions

One line each: decision — reason — where. Strudel verification results are in the "Verified APIs" section.

## Architecture
- D1 Keep the pnpm monorepo: `@phyllo/model` (src/shared/model), `@phyllo/engine` (src/packages/engine), `@phyllo/ui` (src/packages/ui), app (src/apps/phyllo) — repo CLAUDE.md layout rules predate the handoff; package boundaries enforce "no engine imports below organisms" — PLAN.md package map.
- D2 Handoff's `src/model/types.ts` lives at `src/shared/model/src/types.ts` — shared by engine and app — D1.
- D3 Atoms + molecules in `@phyllo/ui`; organisms + screens in the app at `src/apps/phyllo/src/ui/{organisms,screens}` — organisms need hooks/stores, atoms/molecules must render with only ThemeProvider (design-system §1) — design-system README §2 adapted.
- D4 React 19 instead of React 18 — scaffold already on 19.x, no API we use differs, story/test tooling supports it — src/apps/phyllo/package.json.
- D5 TypeScript stays on 6.0.x (not 7.x) — 7 is the native-compiler rewrite; ESLint/typescript-eslint and Vite tooling support is less certain — all package.json.
- D6 Parallel subagents work in git worktrees; orchestrator merges and commits with task ids; subagents never install deps — avoids lockfile and commit races in a shared tree — PLAN.md working rules.
- D7 Strudel packages are AGPL-3.0-or-later, so Phyllo as distributed must be AGPL-compatible — recorded only; publishing is out of scope for this build — LICENSE follow-up in M7.

## Tooling (T0.1)
- D8 Storybook 10.6.3 (`@storybook/react-vite`) instead of Ladle — Ladle has no custom toolbar controls for theme × accent and bundles its own Vite 6 — src/packages/ui/.storybook.
- D9 ESLint 9.39.5, not 10 — `eslint-plugin-jsx-a11y` 6.10.2 supports ESLint ≤9 and a11y linting matters more than the major — eslint.config.js.
- D10 Exact versions pinned once in the `catalog:` block of pnpm-workspace.yaml; packages reference `catalog:` — single place to pin — pnpm-workspace.yaml.
- D11 Source Serif 4 from `@fontsource-variable/source-serif-4` re-declared under family "Source Serif 4" in fonts.css (opsz + italic) — tokens.css names the family "Source Serif 4" and stays verbatim — src/packages/ui/src/fonts.css.
- D12 Latin font subsets only — UI copy is English — src/packages/ui/src/fonts.css.
- D13 `ThemeContext` exposes `{mode, theme, accent}` (README showed `{theme, accent}`); without matchMedia, system resolves to dark — Settings needs the raw mode; dark is the default look — ThemeProvider.tsx.
- D14 `@phyllo/ui` ships `base.css` (reset, full-height root, body bg/text from tokens) imported by app and Storybook — every surface needs the same ground — src/packages/ui/src/base.css.
- D15 Tauri capabilities start at each plugin's `:default`; fs scope is widened for `~/Music/Phyllo` in T6.1 — least privilege until needed — capabilities/default.json.
- D16 Global-shortcut plugin registered under `#[cfg(desktop)]` — plugin is desktop-only — src-tauri/src/lib.rs.
