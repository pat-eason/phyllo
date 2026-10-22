# How Phyllo writes code

This page is for readers who already know Strudel and want the exact contract: what each part of a Phyllo project becomes in code, and how code you write is read back. If you're new to Strudel, start with [Strudel in ten minutes](/guide/strudel-basics).

The short version: **the project is the source of truth, and the code is generated from it.** Every edit (a knob, a clip, a pattern) goes through the project, Phyllo regenerates the program (debounced about 60 ms) and hot-swaps it into Strudel without stopping playback. Code you edit goes the other way: it's parsed back into tracks. Paste the generated code into [strudel.cc](https://strudel.cc) and it plays the same.

## A whole program

Here is the House groove starter ("Night Bus" in these screenshots) as the **Whole song** scope of the [code drawer](/screens/code) shows it:

![Whole-song code: setcpm(124/4) followed by four $: arrange(...) blocks](/screenshots/howcode-song.png)

```js
setcpm(124/4)

$: arrange(
     [4, silence],
     [12, s("bd*4").bank("RolandTR909")],
     [4, silence],
     [12, s("bd*4").bank("RolandTR909")])
$: arrange(
     [8, silence],
     [8, s("~ cp").bank("RolandTR909").room(.2)],
     [4, silence],
     [12, s("~ cp").bank("RolandTR909").room(.2)])
$: arrange(
     [16, s("hh*8").bank("RolandTR909").gain("[.4 .7]*4")],
     [4, silence],
     [12, s("hh*8").bank("RolandTR909").gain("[.4 .7]*4")])
$: arrange([8, silence], [24, note("<a1 a1 c2 g1>*2").s("sawtooth").lpf(900)])
```

The layout is always the same:

1. `setcpm(bpm/beatsPerBar)`: the tempo.
2. The **prelude**: top-level code Phyllo keeps but doesn't model (see [below](#reading-code-back)), verbatim.
3. A blank line, then **one block per track**, in track order.
4. `all(x => x.postgain(v))`, only when the master level isn't 1.

## Tempo: one cycle is one bar

`setcpm(124/4)` sets 31 cycles per minute, so **one Strudel cycle is one bar** of 4 beats at 124 BPM. That's why the timeline reads in bars like any DAW, and why mini-notation such as `bd*4` means "four kicks per bar". In Pro the header's tempo readout shows the `setcpm` value too.

## One track, one line

Each track is one `$:` block:

```
$: <source> <modifiers…> <knob values…> <.orbit(n)>
```

| Track kind | Source it writes |
| --- | --- |
| Drums | `s("bd*4").bank("RolandTR909")` |
| Melodic | `note("<a1 c2>").s("sawtooth")`, or `n("…")` / `s("…")` when that's how it was written |
| Chords | `chord("<Am7 Dm7>").voicing()`, plus `.s("…")` when a sound is set |
| Sample | `s("my_loop")` |
| Code | the code as written, untouched |

After the source come the **modifiers**, in the order of the inspector's modifier list (and only the ones switched on). Then the **knob values**, always in this order: `gain`, `pan`, `lpf`, `lpq`, `hpf`, `shape`, `room`, `roomsize`, `delay`, `delaytime`, `delayfeedback`. Then `.orbit(n)` when the track isn't on orbit 1.

Two rules keep the code tidy:

- **Defaults are omitted.** A knob at Strudel's own default (`gain` 0.8, `pan` 0.5…) or reset with a double-click writes nothing.
- **Modulation wins.** If a modifier also sets a parameter (`.lpf(sine.range(400,1400).slow(8))`), the static knob value isn't written, so the two never fight. The inspector shows that knob with an amber ring.

Long blocks wrap at 88 characters: the source stays on the first line and the chained calls continue below, indented.

## Mute and solo

- A **muted** track is written as `_$:`, Strudel's own "don't play this" prefix, so its code stays visible.
- **Solo** doesn't use `S$:`. Phyllo writes `_$:` on every track that *isn't* soloed. The result is explicit, and plays exactly the same when pasted into strudel.cc.

## Clips become `arrange()`

On the timeline, a track plays only where it has clips. In the whole-song code, a track whose clips don't cover the whole song is wrapped in `arrange()`, with one `[bars, pattern]` entry per stretch:

```js
$: arrange([8, silence], [24, note("<a1 a1 c2 g1>*2").s("sawtooth").lpf(900)])
```

- Gaps are `[n, silence]`, and the entries always add up to the song length (32 bars here), so every track loops in step.
- Clip time is **clip-local**: a `<a b c>` pattern starts from its first step at the start of every clip, as you'd expect from DAW clips.
- A track that plays all the way through is written plainly, without `arrange()`.
- A track with no clips at all is written muted (`_$:`) with its plain pattern, so its code is still there to read.

The **This section** scope skips all this: it shows only the tracks that have a clip in the current section, unwrapped. It's the version to grab when you want to jam on one part in strudel.cc.

## Mixer: gain, sends and orbits

The [Mixer](/screens/mixer) writes into the same blocks:

- **Faders** write `.gain()`.
- **Space** and **Echo** sends write `.room()` and `.delay()`.
- Each track plays on an **orbit** (`.orbit(n)`, 1 by default). In Strudel, every track on one orbit shares a single reverb and a single delay. Phyllo shows each orbit as a **bus** with its own `roomsize`, `delaytime` and `delayfeedback`.

Because Strudel configures an orbit's reverb and delay from the notes that use them, a bus setting is written onto **every track on that orbit that sends to it** (unless that track sets the value itself). So changing a bus's room size changes the code of all the tracks that use its reverb. `roomsize`, `delaytime` and `delayfeedback` are always separate calls, never the `room("a:b")` shorthand, because Strudel ignores the size part of that form.

The **master** level becomes `all(x => x.postgain(v))` at the end of the program. The master limiter isn't in the code: it's part of Phyllo's audio output, not of Strudel.

## What isn't in the code

Some things are playback state, not song content, so they never appear in the code you see, copy or export:

- the **loop region** and **playhead position** (Phyllo applies them around the program while it plays);
- the **meters** (Phyllo adds `.analyze("<track id>")` to the copy it runs, never to the copy it shows);
- the master **limiter** and the chosen output device.

## Reading code back

Whenever code comes in (**Edit code** → **Apply**, a pasted strudel.cc link, an opened `.strudel` file) Phyllo parses it into tracks. The rule is simple: **it never drops or rewrites code it can't map.**

**Blocks become tracks.**

- Every `$:` / `_$:` block, and every labelled block (`bass:`, `_bass:`), is a track. A label becomes the track's name; `_` means muted. Without any labels, the program's final expression is the one track, as in Strudel.
- If two blocks share a label, only the last one plays in Strudel, so the earlier one comes in muted.

**A block becomes a typed track** (sound, pattern, knobs, modifiers) when it's a source call on one quoted pattern (`s`, `sound`, `note`, `n`, or `chord(…)` followed by `.voicing()`) followed by chained calls:

- `.bank("…")` and `.s("…")` right after the source set the sound;
- a single number or quoted value on a known parameter (`.gain(.6)`, `.lpf(1200)`, `.pan("<0 1>")`) becomes a knob, unless something later in the chain also sets it, in which case the call is kept as a modifier so the meaning doesn't change;
- `.orbit(n)` sets the track's bus;
- everything else becomes a modifier, kept as written and in order.

**Anything else becomes a Code track** holding the exact expression, with a note saying why: not a source call (`stack(…)`, a variable), a source without one string-literal argument, `chord()` without `.voicing()`, or a block containing comments.

**Clips come from `arrange()`.** A block wrapped in `arrange([n, silence | pattern], …)`, with one repeated pattern, gets one clip per entry. Any other block keeps the clips its track already had, or gets one clip covering the whole song if it's new.

**Top-level statements:**

| Statement | Becomes |
| --- | --- |
| `setcpm(a/b)`, `setcpm(x)`, `setcps(x)` | The tempo (if it fits Phyllo's BPM range; otherwise it stays in the prelude and still plays as written) |
| `all(x => x.postgain(v))` | The master level |
| `hush()` | Mutes the blocks above it, then is dropped |
| a bare `silence` | Dropped |
| anything else (`samples(…)`, `const …`, comments outside tracks) | Kept verbatim in the prelude |

Syntax errors don't touch the project: you get the line and column, and everything stays as it was.

The result is a fixed point: generate a project's code, parse it back, and you get the same project. That's what lets you move freely between knobs and code.

## Share links

**Copy strudel.cc link** in the code drawer encodes the code shown (section or whole song) the same way strudel.cc does: `https://strudel.cc/#` plus the code as base64. Phyllo encodes in chunks, so even very long songs make a working link. Links in that form also import back into Phyllo. strudel.cc's short links (`?abc123`) live in its online database and can't be opened offline.

## Further reading

- [Code drawer](/screens/code): viewing, editing and importing code.
- [Track inspector](/screens/inspector): the knobs and modifiers that become the chained calls.
- The project repository's `docs/strudel-verification/REPORT.md` lists every Strudel function Phyllo relies on, checked against the pinned Strudel packages (core 1.2.6, webaudio 1.3.0).
