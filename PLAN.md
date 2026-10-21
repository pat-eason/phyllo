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
| T1.2 | codegen agent | `src/packages/engine/src/codegen/**`, `src/packages/engine/src/parse/**`, `src/packages/engine/src/share/**` | T0.3 | SPEC §4.1 rules, both scopes, loop window, line map; §4.2 parser with Code-track fallback + prelude; strudel.cc encode/decode; round-trip tests model→code→model | done |
| T1.3 | mini agent | `src/packages/engine/src/mini/**` | T0.3 | SPEC §4.3 toMini/fromMini, bjorklund, `(k,n)` form, unfit-pattern detection; tests with spec examples | done |
| T1.4 | content agent | `src/shared/model/src/content/**` | T0.3 | 7 original starters, tips curriculum, Try-one suggestions, modifier catalog, sound catalog (friendly names), Feel tools | done |
| T1.V | verifier | read-only | T1.1–T1.5 | adversarial round-trip/parse/reducer fuzzing + browser runtime checks of starters | done |
| T1.5 | runtime agent | `src/packages/engine/src/runtime/**` | T0.3, T1.2 | init on gesture, evaluate + hot-swap, keep last good on error + attribution, cycle clock, loop, preview, master limiter/postgain, meters, capture tap, sample registration; unit tests with mocks + browser smoke | done |

### Fixes from verifiers
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| F1 | orchestrator | content/starters | T1.V | lofi chords voice in all keys (T1.V #1) | done |
| F2 | fix agent | model reducer/serialize, engine parse/codegen | T1.V | T1.V #2–#9, #13–#18; verifier fuzz passes | done |
| F4 | fix agent | @phyllo/ui atoms/molecules/tokens/stories | T2.V | T2.V defects 1–20; axe clean except documented by-design rules | done |
| F3 | fix agent | engine runtime | T1.V, T6.6 | T1.V #10 unknown chord → error, #11 stop releases voices, #12 limiter default on + ceiling, #19 offline error flood, #20 pattern error column | done |

### M2 Atoms, then molecules
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T2.1 | atoms-A | Icon, Logo, Surface, Kbd, StatusDot, Swatch | T0.1 | design-system §8 DoD, stories all states both themes | done |
| T2.2 | atoms-B | Button, IconButton, TransportKey, ToggleButton, SegmentedControl, Switch, Checkbox | T2.1 | same | done |
| T2.3 | atoms-C | TextField, Select, Slider, Chip | T2.1 | same | done |
| T2.4 | atoms-D | Knob, Fader, Meter, StepCell | T2.1 | same + slider a11y, value-passing onChange | done |
| T2.5 | molecules-A | Readout, TransportControls, TrackHeader, SoundRow, SectionChip, Toast, EmptyState | T2.2–T2.4 | same | done |
| T2.6 | molecules-B | Clip, ParamKnob, SuggestionButton, ModifierRow, PatternField, StepRow | T2.2–T2.4 | same | done |
| T2.7 | molecules-C | TipCard, StarterCard, GrooveCard, SettingRow | T2.2–T2.4 | same | done |
| T2.V | verifier | read-only + `e2e/stories/**` | T2.5–T2.7 | screenshots vs `png/kit.png` both themes, 2 accents; defects filed | done |

### M6a Native core (Rust, starts early, parallel with M1/M2)
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T6.1 | rust-A | `src-tauri/src/**`, `src-tauri/Cargo.toml`, `src/apps/phyllo/src/native/**` | T0.1 | project IO (atomic write), library index of `~/Music/Phyllo`, history snapshots, folder watching (`notify`) + sample folder serving; typed TS bindings; `cargo test` + `cargo clippy` clean | done |
| T6.2 | rust-B | same | T6.1 | MIDI in/out bridge (`midir`), OSC UDP to SuperDirt; TS bindings | done |
| T6.3 | rust-C | same | T6.2 | PCM stream sink + WAV/FLAC/MP3 encoder, normalize post-pass, MIDI file writer | done |
| T6.4 | rust-D | same + `tauri.conf.json` | T6.3 | tray/menu-bar transport, media keys, file associations, notifications w/ Reveal, app menu, settings window | done |
| T6.6 | rust-E | same | T6.4 | local cache/mirror for Strudel default sample maps + soundfonts so built-in sounds work offline after first use (V15) | done |

### M3 Arrange screen
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T3.1 | state agent | `src/apps/phyllo/src/state/**`, `src/apps/phyllo/src/hooks/**` | M1 | all §5 hooks, Zustand stores, mock providers for stories; playhead/meters via subscriptions, not React state | done |
| T3.2 | organism agent | AppHeader, StatusBar, ViewTabs | T3.1, M2 | organism docs + SPEC §6.1; stories with mocked hooks | done |
| T3.3 | organism agent | ViewToolbar, Timeline | T3.1, M2 | same + clip editing, DnD, no re-render while playing | done |
| T3.4 | organism agent | LibraryPanel | T3.1, M2 | same | done |
| T3.5 | organism agent | CodeDrawer, TipCoach | T3.1, M2 | same + inline pattern edit, Edit code mode | done |
| T3.6 | organism agent | Inspector | T3.1, M2 | same | done |
| T3.7 | shell agent | App/main, router, all screens (Arrange, Pattern, Mixer, Library, GuidedStart, Settings), shortcuts, menu/media/open-file glue, unsaved/history dialogs, e2e flows | all organisms | SPEC §6.1 acceptance + §7; e2e flows | done |
| T3.V | verifier | read-only | T3.7 | §6.1 checklist + screenshot parity 01/02/accent-* | todo |

### M4 Pattern editor and Mixer
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T4.1 | organism agent | StepSequencer, PatternTools | T3.1, M2 | SPEC §4.3, §6.3; steps/velocity/live code/Euclid/feel/piano roll | done |
| T4.2 | organism agent | ChannelStrip, MixerStrips | T3.1, M2 | SPEC §6.4; track/bus/master strips, Rec output | done |
| T4.3 | (folded into T3.7) | PatternEditorScreen, MixerScreen | | | done |
| T4.V | verifier | read-only | T4.3 | png 04/05 parity, §6.3/§6.4 | todo |

### M5 Projects
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T5.1 | organism agent | GrooveBrowser | T3.1, M2 | SPEC §6.7 | done |
| T5.2 | organism agent | StarterPicker | T3.1, M2 | SPEC §6.2 | done |
| T5.3 | organism agent | SettingsLayout, AccentPicker | T3.1, M2 | SPEC §6.6, offline sounds download | done |
| T5.4 | organism agent | ExportDialog + export pipeline + engine note query | F3, T6.3 | SPEC §6.5 all tabs, notification | done |
| T5.5 | (folded into T3.7) | version history UI, screens Library/GuidedStart/Settings | | | done |
| T5.V | verifier | read-only | T5.5 | png 03/06/07/08* parity | todo |

### M6b Native wiring
| id | owner | owns | deps | acceptance | status |
|---|---|---|---|---|---|
| T6.5 | wiring agent | state/sampleFolders, midiInput, recorder; engine stopPreview | T3.1, T6.1–T6.2 | B1, B2, B4 + MIDI record | done |
| T6.V | verifier | read-only | T6.5, T3.7 | native features in `tauri dev` | todo |

### M7 Polish
T7.1 shortcuts (SPEC §7) · T7.2 a11y pass (SPEC §8) · T7.3 screenshot parity fixes · T7.4 performance (no React re-render for playhead/meters) · T7.5 `pnpm tauri build` packaging + end-to-end smoke (open, play starter, edit, save, reopen, export WAV) · T7.V final verifier against SPEC §6 + DoD.

### Follow-ups backlog (not yet assigned)
- B1 Sample folders: call `native.sampleFoldersWatch(all)` + `sampleFolderScan` → `engine.registerSamples({name: [convertFileSrc(path)]})` with collision suffixes; rescan on `onSamplesChanged` (state layer) — from T3.4/T6.1.
- B2 `engine.preview` has no stop → add `stopPreview()` (engine runtime) — from T3.4.
- ~~B3~~ done (D139).
- B4 MIDI input → selected track notes / CC map → inspector knobs (state layer, uses T6.2 events) — from T3.1.
- B5 Tag manage: rename/merge/delete across files; recolor needs a model field — from T3.1/T5.1.
- B6 Audition another program without replacing the open project (GrooveBrowser tile play, StarterPicker preview): generalize StarterPicker's `useAudition` (load as non-dirty, restore on stop) into a shared hook, or add an engine audition slot; then enable GrooveCard play (needs a `disabled`/`previewing` prop) — from T5.1/T5.2.
- B7 Molecule gaps: GrooveCard `selected` row + play `disabled`; Readout caption action + cell popover (key menu); StatusDot `tone="plain"`; SegmentedControl compact padding; Chip code `selected`; IconButton/TextField/Select 40 px size — from T3.2/T3.4/T5.1/T5.2.
- B8 Engine should honour `settings.audio.sampleRate` (AudioContext sampleRate on init) — from T5.3.
- B9 CodeDrawer should consume `useCodeEditorPrefs()` (font size, line numbers) — from T5.3.
- B10 ParamKnob: `aria-valuetext`/`aria-label` + caption slot props (Inspector writes the attribute after render as a workaround); Knob double-click "unset" callback — from T3.6.
- B11 Pro value text `.78` vs mockup `0.78` — decide in T7.3 parity pass (model `PARAM_SPECS.format`) — from T2.6/T3.6.
- B12 Rec output / export naming: avoid overwriting earlier takes after relaunch (native "unique export path" like `project_new_path` for Exports/) — from T4.2.
- B13 TrackHeader attribute passthrough for Mute/Solo (tip anchors), SectionChip imperative `current`, SegmentedControl per-option attrs — from T3.3.
- B14 App-level toast queue (Mixer/CodeDrawer/Library each render their own) — from T4.2/T3.5.
- B15 Timeline lane virtualization past ~40 tracks; ↑/↓ track navigation — from T3.3.
- B16 Multi-cycle step patterns (2/4 cycles) in `miniToRows`/`rowsToMini` + StepSequencer length control; Euclid rotation control — from T4.1.
- B17 StepRow roving tabindex + `onPreview` on the row label; Slider fluid width — from T4.1.
- B18 UI for T6.5: show recorder `lastTake` + `midiInput.hint` (status bar/toast), list `useSampleNames()` in Inspector sound picker (sample tracks) and Library Samples tab; LibraryPanel/Inspector preview toggles call `stopPreview()` — from T6.5.
