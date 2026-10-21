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
- D28 Red accent: record/mute use magenta via local overrides scoped to `[data-accent='red']` (dark `#E0457B`/ink `#1A0A07`, light `#C2336A`/white for ≥4.5:1) — resolves SPEC §2.3 / §10 Q6 — atoms/TransportKey, ToggleButton.
- D29 Record TransportKey flips its label ("Record"/"Stop recording") without `aria-pressed`; Loop uses `aria-pressed`; Play flips Play/Pause — avoids double announcement — atoms/TransportKey.
- D30 ToggleButton `onChange(pressed, event)` passes the event second so parents can read ⌥/⌘ modifiers — Solo exclusive-click etc. — atoms/ToggleButton.
- D31 Form atoms (TextField, Select, Slider) put `className` on the wrapper and `ref`/native props on the inner control — wrapper carries label/description, consumers need the input — atoms/TextField, Select, Slider.
- D32 Removable Chip's accessible name is "Remove <text>" (override via `removeLabel`) — generic, reads naturally — atoms/Chip.
- D33 Literal radii 9 px (fields) / 7 px (chips) / 12 px (plates) where tokens.css has no matching radius — Kit values; tokens unchanged — atoms.
- D34 MIDI port ids are `<in|out>:<name>:<index among same-name ports>`; incoming channels are 1-based (Strudel `midichan`), note-on vel 0 → `noteoff`, pitch bend 14-bit in `data1`, clock/sensing/SysEx dropped, CC/bend bursts coalesced ≤1/ms — stable ids across rescans, matches Strudel conventions — src-tauri/src/midi.rs.
- D35 MIDI output is scheduled on a dedicated Rust thread (sleep until ~2 ms before due, then spin); `atMs` relative to command arrival, clamped 0–60 s; close/panic drop queued messages and send all-notes-off — JS hands over haps with look-ahead — midi.rs.
- D36 OSC numbers: integral values within int32 → int32, else float32; `atMs` present → bundle timetagged now+atMs, else plain message; disabled by default (`127.0.0.1:57120`) — SuperDirt accepts both — src-tauri/src/osc.rs.
- D37 Browser `NativeApi` uses Web MIDI when available (Chromium dev) — lets MIDI be exercised outside Tauri — src/native/webmidi.ts.
- D38 Knob emits normalized 0–1 only; ⌥-click/Enter call `onRequestEdit` so the organism (which knows units) shows the typed-value input; `onChangeStart/End` bracket drags for undo grouping and the "replace modulation?" prompt — atoms/Knob.
- D39 Fader value is dB; marks evenly spaced along the throw with piecewise-linear dB between them; bottom = −∞ (−60) — SPEC §6.4 — atoms/Fader/faderScale.ts.
- D40 Meter can be driven by `level` prop, a ref handle (`set(l,r)`/`reset()`), or a `subscribe` prop, all writing to the DOM directly with 20 dB/s release + peak hold — playhead/meters must not re-render React (design-system §5) — atoms/Meter.
- D41 `gainToDb`/`dbToGain` exist in both `@phyllo/ui` (Fader) and `@phyllo/model` (params) — ui must stay model-free; two one-line functions, tested in both — accepted duplication.

## Model (M1)
- D42 Param defaults are Strudel's (gain .8, pan .5, delayfeedback .5, shape/room/delay 0; lpf/lpq/hpf/roomsize/delaytime unset); `track/setParam` with null, "" or the default removes the key so codegen omits it; values clamped/rounded per spec; gain range 0–2 for the mixer's +6 dB — SPEC §4.1 "omit params left at defaults" — model/params.ts, reducer.ts.
- D43 Clip/section overlap: the edited range wins; neighbours are trimmed, removed, or split (right half id `<id>~2`); `clip/split` valid for `start < atBar ≤ end` — deterministic reducer — model/reducer.ts.
- D44 Reducer never stamps `modified`; the persistence layer does — reducer stays pure/deterministic — model/reducer.ts.
- D45 `code/replace` matches by id then position+kind; matched tracks keep id, color, clips, solo (code can't express solo), and keep name only when the incoming name is generic and orbit only when incoming is 1; mute comes from code — code is the source of truth except for arrangement/identity — model/reducer.ts.
- D46 New project: 120 BPM 4/4, C minor, 32 bars, one "Song" section, loop on over bars 1–8, master postgain 1 + limiter on — SPEC "Loop on (default)" — model/factories.ts.
- D47 Clips/modifiers missing ids on load get stable derived ids (`<trackId>:c1`, `:m1`); hard parse errors only for bad JSON/format/tracks, everything else coerced with warnings — no id churn on autosave — model/serialize.ts.
- D48 Guided pan text `Center`/`Left 16`/`Right 30`; Pro `C`/`L16`/`R30`; unset lpf reads "off" with the knob fully open — model/params.ts.

## Engine (M1)
- D49 Euclid rotation follows Strudel (positive r shifts hits later; `bd(3,8,2)` → steps 0,2,5; r ≥ n unrotated), verified against Strudel's own euclid for all k≤n≤16 — SPEC §4.3 — engine/mini/bjorklund.ts.
- D50 Text → grid fitness is decided semantically (compare cycles 0–15 + inspect for random ops), not by syntax: lossless `<bd bd>*4` / aligned polymeters fit; triplets, alternation, `?`, `|`, two hits of one sound on one step refuse with the SPEC message + a `detail` — SPEC §4.3 "no lossy grid" — engine/mini/parse.ts.
- D51 Grid ignores durations (onsets only); `bd:3` is its own row; `row.euclid` only set while steps still equal the rhythm, so stale flags can't emit wrong `(k,n)` code — engine/mini.
- D52 Velocity lane → `.gain("<pattern>")` with `~` on inactive steps (regenerated when steps change), a single number when all equal; per-row velocities in multi-row drum patterns deferred to T4.1 (one `.gain()` applies to all layers) — SPEC §6.3 (proposed) — engine/mini/velocity.ts.
- D53 `previewRows` snaps off-grid hits and never throws; `clipViz(track, cycle)` takes a cycle so multi-bar clips of `<…>` patterns vary per bar; chords voiced with tonal, unknown symbols fall back to a small table — engine/mini/viz.ts.
- D54 Export sink streams raw f32 chunks over Tauri binary IPC (`x-session` header) to a temp spool, normalizes on finish (peak set exactly to target; silence untouched), encodes block-wise and renames atomically; bare names go to `~/Music/Phyllo/Exports/`, other paths must be absolute with an existing folder — large renders never go through JSON — src-tauri/src/export.rs.
- D55 Encoders: WAV via hound (16-bit TPDF dither fixed seed, 24 rounded, 32 float), FLAC via flacenc (16/24 only), MP3 320 CBR via mp3lame-encoder (LAME built from source; no Xing tag) — pure-Rust where possible — src-tauri/src/encode.rs.
- D56 LAME (mp3lame-sys) is LGPL; statically linked alongside the AGPL Strudel stack — recorded for the M7 license review (D7) — Cargo.toml.
- D57 Browser fallback encodes WAV + SMF in JS and downloads; FLAC/MP3 → `unsupported_format` — exports testable without Tauri — src/native/exportBrowser.ts.

## Content (M1)
- D58 Changing the starter key transposes melodic/chord tracks by root distance only (`semitonesBetween` in −5..+6); the mode label is stored as given — remapping modes would change the music — SPEC §6.2 (proposed) — model/content/transpose.ts.
- D59 Starters are original model data (not parsed code): 16-bit stage splits hats into their own track to match "4 tracks"; Breakbeat hats use the AkaiMPC60 bank; per-starter section names and tags; ambient bus roomsize 5 — SPEC §6.2; mockup code showed 3 tracks — model/content/starters.ts.
- D60 Feel tools: Fill is a 3-position slider (off, `fast(2)`, `fast(4)`); a slider at its off value removes the modifier — SPEC §6.3 — model/content/feel.ts.
- D61 Tip copy is original (step-3 title from the mockup); step 1 targets the Library Starters tab (`starter-picker`); seven `data-tip-target` anchors: starter-picker, track-mute, track-solo, inspector-knob-lpf, inspector-try-one, inspector-pattern, header-export — model/content/tips.ts.
- D62 Modifier catalog = 50 functions, each verified in installed Strudel source (non-existent `rolled`, `rot`, `arpMode`, `acidenv` dropped); drum sounds per bank taken from the real `tidal-drum-machines.json` — model/content/modifiers.ts, sounds.ts.
- D63 GrooveCard takes display data (`GrooveCardData`, renamed from the agent's `GrooveSummary` to avoid clashing with the model type), `variant="tile"|"row"`, `size` 1–5; cover is a button "Open <name>" with the play button as a sibling (no nested interactive elements); favorite/play are local buttons because IconButton can't draw a filled star at 12 px — molecules/GrooveCard.
- D64 StarterCard uses `aria-pressed` (doc) and Punchcard `{color, steps}[]` rows; TipCard has no outer margin, `compact` keeps Hide tips reachable, progress is `role="progressbar"` — molecules/StarterCard, TipCard.
