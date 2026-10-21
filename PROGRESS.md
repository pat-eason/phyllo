# Progress log (append-only)

## 2026-10-21
- Read sources (README, SPEC, design-system README, screens.md). Created branch `phyllo/build`. Wrote PLAN.md, DECISIONS.md.
- Dispatched T0.1 (M0 scaffold) and T0.2 (Strudel API verification) in parallel.
- T0.1 done. Verified by orchestrator: `pnpm check` green (ui 7 tests, app 1), `cargo check` green. Agent also verified app build ships 9 woff2, e2e smoke passes, Storybook builds with theme/accent toolbar. Decisions D8–D16.
- T0.3 types.ts committed (022fc9d); param names to re-check against T0.2. Dispatched T2.1 (base atoms) and T6.1 (Rust project IO/library/history/sample folders) in worktrees.
- T2.1 merged (387ad1e): Icon, Logo, Surface, Kbd, StatusDot, Swatch + ThemePair story helper; 83 ui tests. Follow-up f07f315: accent-text tokens scoped per theme (D17), user-event added.
- T6.1 merged (0d7761b): Rust project IO/library/history/trash/sample folders + NativeApi (tauri + browser impls). Orchestrator re-ran: pnpm check green (ui 83, app 40), cargo test 30 passed.
- Dispatched T2.2 (buttons/toggles), T2.3 (form atoms), T2.4 (Knob/Fader/Meter/StepCell) in parallel worktrees.
- Note: Agent worktrees start from `main`; briefs now require `git merge --ff-only phyllo/build` first.
- Dispatched T6.2 (MIDI/OSC bridge).
- T0.2 done: Strudel verification — report + proof scripts in docs/strudel-verification/; decisions V1–V18. T0.3 done: Strudel packages pinned in engine, @strudel/web dropped, ambient types at engine/src/types/strudel.d.ts, Vitest inlines Strudel deps (smoke test passes), acorn + playwright added to engine.
- T2.3 merged (a8b8440): TextField, Select, Slider, Chip. T2.2 merged (fda8e16): Button, IconButton, TransportKey, ToggleButton, SegmentedControl, Switch, Checkbox. ui: 226 tests green after merge.
- Dispatched M1 in parallel worktrees: T1.1 (model reducer/params/serialize), T1.2 (codegen/parse/share), T1.3 (mini↔grid, bjorklund, viz data), T1.4 (content), T1.5 (Strudel runtime + browser harness).
- T6.2 merged (63802f1): midir MIDI in/out with scheduled output thread + hot-plug poller, rosc OSC sender, NativeApi + Web MIDI browser fallback. Orchestrator re-ran: cargo test 64 passed (1 ignored hw smoke), clippy clean, app 66 tests. Real-device MIDI untested (no ports on this machine) — flagged for T6.V.
- T2.4 merged (0d819d1): Knob, Fader, Meter, StepCell; ui 334 tests. All 21 atoms done. Dispatched molecules T2.5–T2.7.
- T1.1 merged (b79063c): ids, params, factories, reducer (all actions), serialize/migrate, time helpers; model 221 tests.
- T1.3 merged (ab24e8d): bjorklund (matches Strudel euclid), rowToMini/miniToRows with semantic fit check, velocity↔gain, previewRows, clipViz; engine 1653 tests (incl. 300 seeded round-trips).
- T6.3 merged (2f059ac): binary-IPC export sessions, WAV/FLAC/MP3 encoders, normalize, SMF writer, streamAudioBuffer + browser fallback. Orchestrator re-ran: cargo test 92 passed, clippy clean, app 101 tests. Live Tauri binary-IPC path untested — flagged for T5.V.
- T1.4 merged (d143821): 7 original starters + transpose, tips, suggestions, 50 verified modifiers, sound catalogs, feel tools, cheat sheet, explainPattern, tags; model 533 tests. Fixed barrel clash (feel's formatNumber kept internal).
- T2.7 merged (5b7ac12): TipCard, StarterCard, GrooveCard (tile + row), SettingRow, shared Punchcard; ui 380 tests.
- T1.2 merged (8bca6ce): generate (both scopes, arrange, wrap, LineMap, instrument), modulatedParams/modulationRange, acorn-based parse with Code-track fallback, mini error columns, share codec; engine 1868 tests total. Orchestrator added ParseResult ok/error/buses and code/replace buses/master/lengthBars (+ reducer + test). pnpm check green.
- T2.5 merged (4364dcf): Readout, TransportControls, TrackHeader, SoundRow, SectionChip, Toast, EmptyState; ui 449 tests.
- T2.6 merged (1bde935): Clip, ParamKnob, SuggestionButton, ModifierRow, PatternField, StepRow; ui 513 tests, Storybook builds. All 17 molecules done.
- T1.5 merged (26aefff): createEngine (own scheduler, hot-swap with last-good fallback + track attribution, heard-cycle clock, loop/seek/pause, look-ahead, previews, limiter, track/orbit/master meters, capture tap, offline render incl. stems, MIDI/OSC outputs via bridge, sample preload). Engine 1993 unit tests + 12 Playwright browser tests (agent-run; orchestrator re-ran unit suite). Orchestrator: runtime barrel, kind 'runtime', e2e script, Vite define. pnpm check green; app builds. M1 complete.
- Dispatched T3.1 (app state/hooks) and T1.V (M1 verifier).
- T6.4 merged (45d1b12): app menu + recent, Settings window, tray/menu-bar mode + keep-running, macOS media keys/Now Playing, file associations + open-file queue, export notification w/ Reveal, broadcast sync. Orchestrator re-ran: cargo test 117 passed, clippy clean, app 136 tests. Agent ran the dev binary (menus, settings window, quit path) — tray/media keys compiled not exercised.
- T1.V done (verifier): 85 adversarial unit tests (69 pass) + Chromium runs of all 7 starters. Codegen rules, generated-code validity, parser robustness (3000 garbage inputs), mini↔grid, reducer invariants (excluding NaN), serialization, runtime timing/mute latency (5.7–7.5 ms)/error attribution/loop all pass. 20 defects filed → F1 (done: lofi `Fmaj7`→`F^7`, regression test across 12 keys), F2 (code/replace + parse, dispatched), F3 (runtime, after T6.6).
- T3.1 merged (96d7eef): createAppStores + PhylloProvider, project (undo/gestures/autosave/history/import), engine (debounced instrumented eval, scopes, errors, meter feed), transport (position feed), selection, settings (persist + effects + cross-window), tips, library (filters/sort/prefs) stores; all §5 hooks; mocks + fake engine. Orchestrator fixed native method names (mediaSetEnabled etc.) and switched settings sync to native.broadcast. App 198 tests green.
