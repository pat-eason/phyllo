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
