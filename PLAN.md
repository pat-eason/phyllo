# Phyllo build plan

Sources of truth: `__inspiration/mockups/` (SPEC.md wins on behavior, design-system/ wins on UI structure). Decisions in `DECISIONS.md`, log in `PROGRESS.md`. On restart: re-read all three before doing anything.

## Package map (see DECISIONS D1)

| Path | Package | Holds | May import |
|---|---|---|---|
| `src/shared/model` | `@phyllo/model` | `types.ts` (orchestrator-owned), reducer, defaults, param specs, serialization, `content/` (starters, tips, catalogs) | nothing app-level |
| `src/packages/engine` | `@phyllo/engine` | codegen, parser, mini↔grid, bjorklund, share-URL, Strudel runtime, meters, capture | `@phyllo/model`, Strudel |
| `src/packages/ui` | `@phyllo/ui` | tokens.css, ThemeProvider, fonts, atoms, molecules, stories | React only |
| `src/apps/phyllo` | `phyllo` | stores, hooks (§5 contracts), organisms, screens, native TS bridge, `src-tauri/` Rust | everything |

## Working rules
- One task = one subagent, self-contained brief, owns listed paths only. Parallel tasks run in git worktrees; the orchestrator reviews the diff, merges into `phyllo/build`, runs `pnpm check`, commits with the task id.
- Subagents never `pnpm add`/install. Dependencies are added by the orchestrator before dispatch.
- Only the orchestrator edits `src/shared/model/src/types.ts`, package.json files, `src/packages/ui/src/index.ts`, and `src-tauri/src/lib.rs` command registration outside a Rust task.
- Status values: `todo` · `active` · `review` · `done` · `blocked`.

## Milestones and tasks

### M0 Scaffold
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T0.1 | scaffold agent | root configs, `src/packages/ui` skeleton, `src/shared/model` skeleton, app shell, `src-tauri` config + plugins | — | `pnpm check`, app build with woff2, e2e smoke, stories build, `cargo check` | done |
| T0.2 | verify agent | scratchpad only → `DECISIONS.md` (orchestrator writes) | — | every SPEC "(verify)" item resolved with source citations | done |
| T0.3 | orchestrator | `types.ts`, engine Strudel deps pinned, CLAUDE.md update | T0.1, T0.2 | types compile; deps pinned exact | done |

### M1 Engine core (parallel with M2)
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T1.1 | model agent | `src/shared/model/src/**` except `types.ts`, `content/` | T0.3 | reducer covers every action in types; param specs + value mapping (SPEC §6.1); effective mute/solo; `.phyllo` (de)serialize + validate; unit tests | done |
| T1.2 | codegen agent | `src/packages/engine/src/codegen/**`, `src/packages/engine/src/parse/**`, `src/packages/engine/src/share/**` | T0.3 | SPEC §4.1 rules, both scopes, loop window, line map; §4.2 parser with Code-track fallback + prelude; strudel.cc encode/decode; round-trip tests model→code→model | active |
| T1.3 | mini agent | `src/packages/engine/src/mini/**` | T0.3 | SPEC §4.3 toMini/fromMini, bjorklund, `(k,n)` form, unfit-pattern detection; tests with spec examples | done |
| T1.4 | content agent | `src/shared/model/src/content/**` | T0.3 | 7 original starters, tips curriculum, Try-one suggestions, modifier catalog, sound catalog (friendly names), Feel tools | active |
| T1.5 | runtime agent | `src/packages/engine/src/runtime/**` | T0.3, T1.2 | init on gesture, evaluate + hot-swap, keep last good on error + attribution, cycle clock, loop, preview, master limiter/postgain, meters, capture tap, sample registration; unit tests with mocks + browser smoke | active |

### M2 Atoms, then molecules
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T2.1 | atoms-A | Icon, Logo, Surface, Kbd, StatusDot, Swatch | T0.1 | design-system §8 DoD, stories all states both themes | done |
| T2.2 | atoms-B | Button, IconButton, TransportKey, ToggleButton, SegmentedControl, Switch, Checkbox | T2.1 | same | done |
| T2.3 | atoms-C | TextField, Select, Slider, Chip | T2.1 | same | done |
| T2.4 | atoms-D | Knob, Fader, Meter, StepCell | T2.1 | same + slider a11y, value-passing onChange | done |
| T2.5 | molecules-A | Readout, TransportControls, TrackHeader, SoundRow, SectionChip, Toast, EmptyState | T2.2–T2.4 | same | active |
| T2.6 | molecules-B | Clip, ParamKnob, SuggestionButton, ModifierRow, PatternField, StepRow | T2.2–T2.4 | same | active |
| T2.7 | molecules-C | TipCard, StarterCard, GrooveCard, SettingRow | T2.2–T2.4 | same | active |
| T2.V | verifier | read-only + `e2e/stories/**` | T2.5–T2.7 | screenshots vs `png/kit.png` both themes, 2 accents; defects filed | todo |

### M6a Native core (Rust, starts early, parallel with M1/M2)
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T6.1 | rust-A | `src-tauri/src/**`, `src-tauri/Cargo.toml`, `src/apps/phyllo/src/native/**` | T0.1 | project IO (atomic write), library index of `~/Music/Phyllo`, history snapshots, folder watching (`notify`) + sample folder serving; typed TS bindings; `cargo test` + `cargo clippy` clean | done |
| T6.2 | rust-B | same | T6.1 | MIDI in/out bridge (`midir`), OSC UDP to SuperDirt; TS bindings | done |
| T6.3 | rust-C | same | T6.2 | PCM stream sink + WAV/FLAC/MP3 encoder, normalize post-pass, MIDI file writer | done |
| T6.4 | rust-D | same + `tauri.conf.json` | T6.3 | tray/menu-bar transport, media keys, file associations, notifications w/ Reveal, app menu, settings window | active |
| T6.6 | rust-E | same | T6.4 | local cache/mirror for Strudel default sample maps + soundfonts so built-in sounds work offline after first use (V15) | todo |

### M3 Arrange screen
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T3.1 | state agent | `src/apps/phyllo/src/state/**`, `src/apps/phyllo/src/hooks/**` | M1 | all §5 hooks, Zustand stores, mock providers for stories; playhead/meters via subscriptions, not React state | todo |
| T3.2–T3.6 | organism agents | AppHeader+StatusBar · ViewToolbar+Timeline · LibraryPanel · CodeDrawer+TipCoach · Inspector | T3.1, M2 | organism docs + SPEC §6.1; stories with mocked hooks | todo |
| T3.7 | screen agent | `screens/ArrangeScreen`, routing/app shell | T3.2–T3.6 | SPEC §6.1 acceptance criteria | todo |
| T3.V | verifier | read-only | T3.7 | §6.1 checklist + screenshot parity 01/02/accent-* | todo |

### M4 Pattern editor and Mixer
T4.1 StepSequencer+PatternTools+PatternEditorScreen · T4.2 ChannelStrip (track/bus/master)+MixerScreen · T4.V verifier.

### M5 Projects
T5.1 GrooveBrowser+LibraryScreen · T5.2 StarterPicker+GuidedStartScreen · T5.3 SettingsLayout+AccentPicker+settings window · T5.4 ExportDialog + capture pipeline (uses T6.3) · T5.5 autosave + version history UI · T5.V verifier.

### M6b Native wiring
T6.5 wire MIDI/OSC/sample folders/media keys/tray into stores + Settings · T6.V verifier.

### M7 Polish
T7.1 shortcuts (SPEC §7) · T7.2 a11y pass (SPEC §8) · T7.3 screenshot parity fixes · T7.4 performance (no React re-render for playhead/meters) · T7.5 `pnpm tauri build` packaging + end-to-end smoke (open, play starter, edit, save, reopen, export WAV) · T7.V final verifier against SPEC §6 + DoD.
