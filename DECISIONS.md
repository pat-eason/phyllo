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

## UI (M2)
- D17 tokens.css: `--ph-accent-text` / `--ph-code-kw` declared on `:root, [data-theme]` instead of `:root` only — a nested `data-theme` subtree (ThemePair stories, Settings preview) otherwise inherits the outer theme's accent — src/packages/ui/src/tokens.css (only deviation from the verbatim copy).
- D18 Icon `chevron-down` uses Kit's `chevron` path; `clock`/`arrow-right` paths come from Export/Onboarding sources — Kit `icons` array lacks them — atoms/Icon/icons.ts.
- D19 Surface adds `floating` (card shadow) and `edge: top|bottom` (chrome line); plate/inset radius is a literal 12px (no token) — the doc's states had no prop to express them — atoms/Surface.
- D20 Kbd builds a spoken default `aria-label` ("Command K"); word keys join with "+" — screen readers can't read ⌘ — atoms/Kbd.
- D21 Swatch is `role="radio"` + `aria-checked`; roving focus belongs to the parent radiogroup (AccentPicker) — atoms/Swatch.
- D22 Keep `forwardRef` on focusable atoms despite React 19 — design-system §3 convention; harmless in 19 — atoms/*.

## Native (M6)
- D23 All file IO goes through app Rust commands; the JS `fs` plugin stays at `fs:default` (supersedes D15's widening) — least privilege, one validated path — src-tauri/src/commands.rs.
- D24 `NativeApi` has a Tauri impl and an in-memory/localStorage browser impl chosen by `isTauri()` — Vite dev, Playwright and Storybook run without Tauri — src/apps/phyllo/src/native/.
- D25 Library scan reads only `*.phyllo` directly in `~/Music/Phyllo/` (no subfolders); opened timestamps in sidecar `.phyllo-index.json`; env `PHYLLO_HOME` overrides the root — keeps the index fast and testable — src-tauri/src/library.rs.
- D26 History snapshot ids are monotonic UTC ms timestamps (`20261021T124100123Z`), newest 50 kept in `.history/<id>/` — sortable and prune-safe — src-tauri/src/history.rs.
- D27 Asset protocol enabled (`$HOME/Music/Phyllo/**`); each linked sample folder is added to the scope at scan time — user folders live anywhere — tauri.conf.json, samples.rs.

## Verified APIs (T0.2 — full evidence in docs/strudel-verification/REPORT.md)
- V1 Pin @strudel/core 1.2.6, mini 1.2.6, transpiler 1.2.6, tonal 1.2.6, webaudio 1.3.0, soundfonts 1.3.0 (latest; exact) and drop @strudel/web — web bundles a second copy of core (two Pattern classes) and only starts audio on mousedown — src/packages/engine/package.json.
- V2 Verified names: setcpm, setcps, arrange, silence, ribbon, swingBy, lastOf, firstOf, sometimes, ply, degradeBy, chop, voicing (needs tonal), chord, fmi, fmh, roomsize, delayfeedback (alias delayfb), delaytime (seconds), postgain (per voice), orbit (default 1), lpf/lpq/hpf/shape/room/pan/gain, bank; banks RolandTR909, RolandTR808, LinnDrum, AkaiMPC60 — all exist at the pinned versions — REPORT (a).
- V3 Mute = `_$:` (verified). Solo keeps the SPEC rule (`_$:` on every non-soloed track) rather than Strudel's `S$:` — generated code stays explicit and plays the same pasted into strudel.cc — engine/codegen.
- V4 Codegen emits `.roomsize()` / `.delayfeedback()` / `.delaytime()` as separate calls, never `room("a:b")` — superdough ignores the `size` key that form writes — engine/codegen.
- V5 Arrangement uses `arrange([gap, silence], [len, pat], …)` padded to `lengthBars` so the total is exactly the song; clip time is clip-local (a `<a b>` pattern restarts at each clip) — matches DAW clip semantics; verified `arrange` loops after its total — engine/codegen.
- V6 Transport position, seek and loop live in the runtime's `editPattern` wrapper (`p.early(B)` to seek; `.ribbon(start, len).late(c0)` for loop), not in the generated code — they're playback state, not song content (principle 1 covers the song code) — engine/runtime.
- V7 Playhead = `heardCycle()` from the scheduler's cps-change anchors minus scheduler latency, using `getOutputTimestamp` — `scheduler.now()` runs ~50 ms ahead of audio — engine/runtime.
- V8 Errors: eval/parse via `onEvalError` + `strudel.log` events; after each evaluate run a strict `pattern.query(State(0..2))` guard because `queryArc` swallows query-time errors and silences everything; on failure revert to the last good program and attribute the error to a track via LineMap / per-track query — engine/runtime.
- V9 Per-track meters via `.analyze("<trackId>")` appended to each track line in the **evaluated** code only (display code unchanged, same line count); per-orbit/master via analysers on `controller.nodes[n].output` / after `destinationGain` — answers SPEC §10 Q1 without one-orbit-per-track — engine/codegen + runtime.
- V10 Master chain: `destinationGain` → DynamicsCompressor limiter (when enabled) → master analyser → destination, plus a capture tap; re-applied whenever superdough's controller is reset — Strudel has no master limiter — engine/runtime.
- V11 Export renders offline (OfflineAudioContext, ~19× real time) with our own render loop, waiting for orbit reverb IRs before `startRendering()`; real-time capture is the fallback; Strudel's `renderPatternAudio` is not used (closes the live context, silent with FX) — answers SPEC §10 Q3 — engine/runtime + T5.4.
- V12 MIDI out: override `Pattern.prototype.midi` with an `onTrigger` handler that sends to the Rust bridge (T6.2); OSC: `register('osc', …)` → Rust UDP; never import @strudel/midi or @strudel/osc — WKWebView has no Web MIDI; Strudel's OSC needs a Node WebSocket bridge — engine/runtime.
- V13 Share links: our own `code2hash`/`hash2code` (UTF-8 → base64 → URI component, chunked) — upstream overflows on large programs; `?id` short links can't be decoded offline and show an error — engine/share.
- V14 Call `ctx.resume()` after `initAudio()` and `loadBuffer()` every used sample before play — 1.3.0 never resumes the context and skips uncached samples on first trigger — engine/runtime.
- V15 Default sample banks/soundfonts load from Strudel's CDN/GitHub at runtime (network needed for built-in sounds); synth waveforms work offline. Mirroring them into a local cache is follow-up T6.6 — they are not in any npm package — engine/runtime.
- V16 Scheduling look-ahead is fixed at 0.1 s in Strudel's Cyclist; the Settings value is applied only if the runtime can construct its own Cyclist, otherwise the control is shown disabled with a note — `repl()` doesn't forward latency — engine/runtime, T5.3.
- V17 No Strudel package ships types; engine keeps ambient `declare module` files (one per area; ambient declarations merge) — engine/src/types/.
- V18 Strudel evaluation needs CSP `'unsafe-eval'` and `data:` worklets; Tauri CSP stays `null` until M7 hardening — tauri.conf.json.
