# Strudel API verification (T0.2, 2026-10-21)

Pinned: @strudel/core 1.2.6, mini 1.2.6, transpiler 1.2.6, tonal 1.2.6, webaudio 1.3.0, superdough 1.3.0, soundfonts 1.3.0 (all latest; also inspected web 1.3.0, midi 1.3.0, osc 1.3.2, draw 1.2.6). Paths below are relative to `node_modules/`; every package ships readable `.mjs` source next to `dist/`. Proof scripts: `scripts/t*.mjs` (run with `scripts/run.sh tN.mjs` against a node_modules containing the pinned packages); raw outputs in `outputs/`. Browser tests ran in Chromium only.

## (a) Verification table

| item | verified? | actual name / signature | source file:line | note |
|---|---|---|---|---|
| setcpm | YES | `setcpm(cpm)` = `setCps(cpm/60)` returns silence; alias `setCpm` | core/repl.mjs:132-135, 216-217 | Only in the scope `repl()` injects into evaluated code, not a core export. `setcpm(90)` → cps 1.5 |
| setcps | YES | `setcps`/`setCps`; also `.cpm(x)` | core/repl.mjs:117-120, 206, 214 | same caveat |
| arrange | YES | `arrange(...[cycles, pat])` = `stepcat(...[c, pat.fast(c)]).slow(total)` | core/pattern.mjs:1469-1473 | length = Σ cycles, then loops; clip-local time; fractional OK |
| silence | YES | `gap(1)`; `nothing = gap(0)` | core/pattern.mjs:1247-1250 | |
| ribbon | YES | `.ribbon(offset, cycles)` alias `rib` = `early(offset).restart(pure(1).slow(cycles))` | core/pattern.mjs:2678 | phase anchored to cycle 0: cycle t plays `offset + (t mod cycles)` |
| zoom/compress/linger/focus | YES | `.zoom(s,e)` 2098, `.compress(b,e)` 1833, `.linger(t)` 2151, `.focus(b,e)` 1888 | core/pattern.mjs | intra-cycle; not loop-region tools |
| swingBy | YES | `.swingBy(x, n)` = `inside(n, late(seq(0, x/2)))`; `swing(n)` = `swingBy(1/3, n)` | core/pattern.mjs:2184, 2193 | |
| lastOf / firstOf | YES | `.lastOf(n, fn)`; `.firstOf(n, fn)` alias `every` | core/pattern.mjs:1995, 2022 | |
| sometimes | YES | `.sometimes(fn)` = `sometimesBy(.5, fn)`; often/rarely/someCycles | core/signal.mjs:800, 783, 839-867 | deterministic, seeded |
| ply / degradeBy / chop | YES | `.ply(n)` pattern.mjs:1905; `.degradeBy(p)` signal.mjs:699; `.chop(n)` pattern.mjs:3291 | | degradeBy deterministic |
| voicing | YES (needs tonal) | `.voicing()` reads chord/dict/anchor/mode/offset/n | tonal/voicings.mjs:196 | undefined until tonal imported; unknown chord → log + silence |
| chord | YES | control `chord` | core/controls.mjs:2130 | |
| fmi / fmh | YES | `fmi` alias `fm` (+1..8), `fmh` (+1..8) | core/controls.mjs:497, 473 | FM matrix superdough/helpers.mjs:414 |
| roomsize | YES | aliases `size`, `sz`, `rsize`; 0..10 | core/controls.mjs:2287 | `room("a:b")` writes key `size` which superdough ignores (reads `roomsize`, superdough.mjs:492) |
| delayfeedback / delayfb | YES | aliases `delayfb`, `dfb`; 0..1 (clamped .98), default .5 | controls.mjs:1745; superdoughoutput.mjs:58; superdough.mjs:193 | |
| delaytime | YES | aliases `delayt`, `dt`; **seconds**; default = delaysync 3/16 cycle | controls.mjs:1769; superdough.mjs:194, 503 | |
| postgain | YES | default 1; per-voice gain after FX (not master) | controls.mjs:431; superdough.mjs:925 | |
| orbit | YES | alias `o`, default 1; Orbit created lazily per number | controls.mjs:2047; superdough.mjs:195; superdoughoutput.mjs:221 | |
| lpf / lpq / hpf | YES | `lpf`=`cutoff` (ctf, lp) 0–20k; `lpq`=`resonance` 0–50; `hpf`=`hcutoff` (hp) | controls.mjs:1204, 1705, 1682 | `lpf("800:10")` sets both |
| shape / room / pan / gain | YES | shape 0..1 (2304); room 0..1 (2196); pan 0..1 (2085); gain default .8 (421) | controls.mjs | |
| bank | YES | prefixes `${bank}_${s}` | controls.mjs:707; superdough.mjs:533 | lookup lowercased (superdough.mjs:60, 160) |
| stack / s / n / note | YES | stack pattern.mjs:1321; `s`=`sound` multi `s:n:gain` (110); n (366); note (388) | | `s("bd:3")` → `{s, n:3}` |
| `$:` / `_$:` / `S$:` | YES | transpiler: `label: expr` → `expr.p('label')`; `_` prefix/suffix mutes; `S…` labels solo | transpiler.mjs:118, 468; core/repl.mjs:171-183, 238-258 | `$` blocks become `$0`, `$1`… and stack |
| bank names | YES | RolandTR909/TR808/LinnDrum/AkaiMPC60 | CDN `tidal-drum-machines.json` (684 banks, 2348 wavs) | not in npm; aliases TR909/TR808/MPC60 |
| waveforms | YES | triangle square sawtooth sine (+user, one), aliases tri sqr saw sin; supersaw, pulse, sbd, bytebeat; noises white pink brown crackle | superdough/synth.mjs:23-29, 42, 153, 296; helpers.mjs:7 | zzfx needs `registerZZFXSounds` |
| gm_epiano1 | YES | 129 `gm_*` via `registerSoundfonts` | soundfonts/gm.mjs:57; fontloader.mjs:144 | network fetch + eval |
| mini parsing | YES | `mini()` 226, `m(str, offset)` 239, `h()` 246, `miniAllStrings()` 259, krill `parse` | mini/mini.mjs | |
| .d.ts | NO | no Strudel/superdough package ships types | | |
| license | YES | AGPL-3.0-or-later (all Strudel, superdough, supradough, @kabelsalat/web) | package.json | deps MIT/Apache/ISC |

## (b) Proofs (trimmed)

```
arrange([8,silence],[8,s("bd*4")]): c0-7:0 c8-15:4 c16-23:0 (loops)
arrange([1,silence],[2,n("<0 1 2 3>")],[1,silence]): c1=0 c2=1 | c5=2 c6=3 (clip-local, continues)
note("<c d e f>").ribbon(1,2): d e d e d e
<b0..b9>.ribbon(4,3).late(38): c38=b4 c39=b5 c40=b6 c41=b4 | .early(6): c0=b6
swingBy(1/6,4) on hh*8: 0 7/48 1/4 19/48 ... | lastOf(4,rev): c3 reversed
aliases → {"roomsize":4,"delayfeedback":.3,"delaytime":.25,"resonance":5,"cutoff":800,"hcutoff":100,"orbit":2,"fmi":3,"fmh":2}
room("0.5:4") → {room:.5,size:4}   ← size ignored by superdough
```

Mini-notation errors: bad mini throws plain `Error: [mini] parse error at line N: Expected …` (line only, counted across the program). For a column call krill `parse('"…"')`: throws `name === 'SyntaxError'` with `.location.start {offset, line, column}` (offset includes the opening quote). JS syntax errors come from acorn with `.loc {line, column}`. Runtime TypeErrors carry no location.

Transpiler output:
```
setcpm(120 / 4);
s(m('bd*4', 19)).bank(m('RolandTR909', 32)).gain(0.82).p('$');
note(m('c2', 66)).p('_$');
chord(m('<Cm7 Fm7>', 81)).voicing().s(m('gm_epiano1', 106)).p('$');
return n(m('0 2', 128)).scale(m('C:minor', 141)).p('lead');
```

Hot-swap: `evaluate()` clears previous `.p()` patterns and swaps the new pattern while the scheduler keeps running. `hush()` inside a program drops blocks above it. `all(fn)` transforms the whole stack. Without labels only the last expression plays.

Errors: eval/parse errors → `onEvalError`, `evaluate` returns `undefined`, last good program keeps playing. **Query-time errors are swallowed by `queryArc`** (pattern.mjs:414-420): the whole stack goes silent with only a `[query] error` log. `pat.query(new State(new TimeSpan(...)))` throws instead — use it as a strict guard (t6, t7). Scheduler errors only surface via the `document` `strudel.log` CustomEvent (core/logger.mjs:14-31).

## (c) Recommended packages and engine sketch

Use core, mini, transpiler, tonal, webaudio (re-exports superdough), soundfonts. Avoid `@strudel/web` (850 KB bundle with its own copy of core → two Pattern classes; audio starts on mousedown only), `@strudel/midi` (Web MIDI + private AudioContext), `@strudel/osc` trigger (WebSocket to `ws://localhost:8080`).

Bundler/CSP: define `process.env.NODE_ENV` (nanostores, core logger); CSP must allow `'unsafe-eval'` (`Function()` in core/evaluate.mjs:38, soundfont `eval`) and `data:` worklets; `connect-src` must cover sample hosts and the Tauri asset protocol.

```ts
import * as core from '@strudel/core';
import { repl, evalScope, Pattern, register, State, TimeSpan, Fraction } from '@strudel/core';
import * as mini from '@strudel/mini'; import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler'; import * as webaudio from '@strudel/webaudio';
import { webaudioOutput, setAudioContext, initAudio, registerSynthSounds, registerZZFXSounds, samples,
  registerSamplesPrefix, loadBuffer, superdough, getSuperdoughAudioController, setSuperdoughAudioController } from '@strudel/webaudio';
import { registerSoundfonts, setSoundfontUrl } from '@strudel/soundfonts';

export async function initFromGesture(o) {            // call inside click/keydown
  ctx = new AudioContext(); setAudioContext(ctx); setSuperdoughAudioController(null);
  await initAudio({}); await ctx.resume();            // initAudio never resumes (superdough.mjs:291)
  mini.miniAllStrings(); await evalScope(core, mini, tonal, webaudio);
  registerSynthSounds(); registerZZFXSounds(); registerSoundfonts();
  r = repl({ defaultOutput: webaudioOutput, getTime: () => ctx.currentTime, transpiler,
             onEvalError: o.onEvalError, onToggle: o.onToggle, editPattern: p => transportWrap(p) });
  const out = getSuperdoughAudioController().output; out.destinationGain.disconnect();
  out.destinationGain.connect(limiter).connect(masterAnalyser).connect(ctx.destination); // + capture tap
}
export async function evaluate(code) { const p = await r.evaluate(code); if (p) try { p.query(new State(new TimeSpan(Fraction(0), Fraction(2)), {_cps: r.scheduler.cps})); } catch (e) { /* revert + mark */ } }
export function heardCycle() { const s = r.scheduler; if (!s.started) return 0;
  const t = ctx.getOutputTimestamp?.().contextTime ?? ctx.currentTime - (ctx.outputLatency||0);
  return s.num_cycles_at_cps_change + (t - s.seconds_at_cps_change - s.latency) * s.cps; }
export const preview = (v, d = .5) => superdough({...v}, ctx.currentTime + .02, d);
// user samples: samples({vox:[convertFileSrc(path)]}) or registerSamplesPrefix('phyllo:', async u => [map, base])
```

- `loadBuffer(url, ctx)` every sample before play: an uncached sample is skipped on its first trigger (sampler.mjs:297).
- Per-orbit meters tap `controller.nodes[n].output`; per-track pre-reverb meters via `.analyze(id)` (superdough.mjs:967), works with shared orbits.
- Re-apply the master chain whenever the controller is reset/replaced.
- Seek: `editPattern: p => p.early(B)`; `stop()` resets the clock to cycle 0 (cyclist.mjs:117).
- Loop region: `p.ribbon(start, len).late(c0)`.
- Look-ahead 0.1 s is fixed in the Cyclist constructor (cyclist.mjs:17, 65); `repl()` doesn't forward it → a custom Cyclist is needed to make it configurable.

## (d) Share-URL codec (tested, t4)

`strudel.cc/#` + `encodeURIComponent(base64(UTF-8 bytes))` (core/util.mjs:340-364). Matches upstream, round-trips unicode/emoji, decodes the documented `ImMzIGUzIg%3D%3D` → `"c3 e3"`, and survives a 300 kB program where upstream throws `RangeError`. `?id` short links live in strudel.cc's Supabase and can't be decoded offline.

```ts
export function code2hash(code: string): string { const b = new TextEncoder().encode(code); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return encodeURIComponent(btoa(s)); }
export function hash2code(h: string): string { const s = atob(decodeURIComponent(h));
  return new TextDecoder().decode(Uint8Array.from(s, c => c.charCodeAt(0))); }
export function fromShareUrl(u: string) { const f = u.split('#')[1]; if (f) return { code: hash2code(f) };
  const q = u.split('?')[1]?.split('#')[0]?.split('&')[0]; return q ? { shortId: q } : null; }
```

## (e) SPEC §10 answers

- **Q3 faster-than-real-time export: YES, ~19×** (16 s of audio in 828 ms, Chromium). Don't use Strudel's `renderPatternAudio` (webaudio.mjs:40): it closes the live context, forces a download, and its dist inlines a duplicate audio controller so reverb/delay fail ("cannot connect to an AudioNode belonging to a different audio context") and the render is silent. Our own render works: set an `OfflineAudioContext`, reset the controller, `initAudio`, `await superdough(...)` per hap in time order, **wait until every orbit's `reverbNode.buffer` is set** (IR generated async, reverb.mjs:39-51), then `startRendering()`. Limits: `.analyze` off offline; a mid-song roomsize change isn't reproduced (last IR applies); stems need one render per track.
- **Q4 arrangement semantics: confirmed.** `arrange` loops after its total → song needs a tail or a transport stop. Clip time is local on the first pass and continues on later loops. Anchor `ribbon` with `.late(c0)`.
- **Q5 function names:** all exist; see (a). Additions: `S$:` solo; `room("a:b")` doesn't set roomsize; `delaytime` is seconds; `orbit` defaults to 1.
- **Q1:** `.analyze(id)` gives per-track pre-reverb meters even with shared orbits (superdough.mjs:967).
- **Q2:** device selection via `initAudio({audioDeviceName})` → `setSinkId`; WKWebView support UNVERIFIED.

## Other details
- REPL options: defaultOutput, onEvalError, beforeEval, afterEval, beforeStart, getTime, transpiler, onToggle, editPattern, onUpdateState, sync, id.
- Custom outputs: `Pattern.prototype.onTrigger(fn, dominant)` (pattern.mjs:843); trigger path `getTrigger` (repl.mjs:295).
- MIDI: don't import @strudel/midi; define `Pattern.prototype.midi` → `onTrigger` → Tauri invoke, converting `targetTime` with `getOutputTimestamp`; fields read at midi.mjs:367-385.
- OSC: `register('osc', …)` overrides; reuse `parseControlsFromHap` (osc.mjs:34).
- Audio graph: voice source → FX → `post` gain → `orbit.summingNode`; each orbit has one shared ConvolverNode reverb + one feedback-delay worklet fed from `post`; `summingNode` → `orbit.output` → panner/splitter → `channelMerger` → `destinationGain` → destination (superdoughoutput.mjs:141-227).
- Default samples: `strudel.b-cdn.net` (drum machines, VCSL, piano, Dirt subsets; CORS `*`); `github:` → raw.githubusercontent (sampler.mjs:128-144); soundfonts from `felixroos.github.io/webaudiofontdata/sound/*.js` run with eval (`setSoundfontUrl` allows self-hosting). All mirrorable.
- Attribution: haps carry `context.locations` (char offsets into source, pattern.mjs:558); `.tag('trk1')` adds to `context.tags` (pattern.mjs:2701); the `.p()` id is not copied into hap values.
- Drawing: `.color()` (controls.mjs:2554), `.pianoroll()`, `.punchcard()`, `.scope()`, `.spectrum()`, `Drawer` (draw/draw.mjs:136).

## (f) Risks
1. AGPL-3.0-or-later everywhere.
2. Default sounds depend on a third-party CDN, GitHub and GitHub Pages; sample/soundfont content licenses unverified.
3. CSP must allow `unsafe-eval` + `data:` worklets.
4. 1.3.0 bugs: duplicated audio context in webaudio/midi dists; `initAudio` never resumes; async reverb missing from naive offline renders; `room("a:b")` drops size; upstream `code2hash` overflows on large programs.
5. No TypeScript types.
6. No seek API; look-ahead fixed.
7. Uncached samples skipped on first trigger.
8. Query-time errors silently mute everything.
9. `evalScope` writes to `globalThis`.
10. UNVERIFIED in WKWebView/WebView2: `data:` worklets, `setSinkId`, MediaRecorder codecs, unconnected analysers.
