# Strudel in ten minutes

You never have to write code to use Phyllo. But every knob, step and clip turns into [Strudel](https://strudel.cc), and once you can read a few lines of it, the code drawer becomes a second way to work. This page covers the handful of ideas Phyllo uses and shows the control that writes each one.

Strudel is a JavaScript version of [TidalCycles](https://tidalcycles.org), a language for live-coding music. The official [Strudel tutorial](https://strudel.cc/learn/) goes much further than this page. Everything here plays the same in Phyllo and on strudel.cc.

## Cycles: the loop everything fits into

Strudel thinks in **cycles**. A pattern describes what happens during one cycle, and the cycle repeats. Phyllo makes **one cycle equal one bar**, so the timeline reads in bars like any other music app. The first line of every Phyllo program sets that up:

```js
setcpm(124/4)   // 124 beats per minute ÷ 4 beats per bar = 31 cycles (bars) per minute
```

→ In Phyllo: the **tempo** in the header readout. In Pro, the readout shows the actual call, `setcpm(31)`.

## Sounds: `s()` and `note()`

`s()` plays a sound by name. Drum sounds have short names, and `.bank()` picks which drum machine they come from:

```js
s("bd").bank("RolandTR909")       // a TR-909 bass drum
```

→ In Phyllo: the **Sound** menu in the inspector, and the drum machine buttons (**TR-909**, **TR-808**, **LinnDrum**, **MPC60**) in the sound library. The library lists each drum's short code next to its name: Bass drum `bd`, Snare `sd`, Closed hat `hh`, Clap `cp` and so on.

`note()` plays pitches, and `.s()` picks the instrument that plays them:

```js
note("a1 c2 g1").s("sawtooth")    // a sawtooth synth playing A, C, G
```

→ In Phyllo: a **Melodic** track. The synths (`sawtooth`, `square`, `triangle`, `sine`, `supersaw`) and instruments (Piano, Strings, Choir…) are in the sound library. Chord tracks work the same way with `chord("…").voicing()`.

## Mini-notation: rhythm in a string

The text inside the quotes is **mini-notation**. Its steps share the cycle equally: `"bd sd"` plays two steps, each half a bar long, and `"bd sd hh sd"` plays four quarter-bar steps.

| Write | Means |
| --- | --- |
| `bd*4` | four bass drums in the bar |
| `~ cp` | rest, then clap: a clap on the off-beat |
| `[bd bd] sd` | two kicks squeezed into the first half |
| `<a1 c2 g1>` | a different note each bar, in turn |
| `bd, hh*8` | both at once, as layers |
| `bd?` | a 50% chance to play |
| `bd(3,8)` | three hits spread evenly over eight steps |

→ In Phyllo: the **Pattern** box in the inspector, the step grid in the [Pattern editor](/screens/pattern-editor) (which writes this text for you), and the label on every clip. More symbols are in the [Mini-notation cheat sheet](/reference/mini-notation).

## Effects: functions chained with dots

Everything after the sound is a function that changes it, chained with dots:

```js
s("hh*8").bank("RolandTR909").gain(.6).lpf(2000).room(.3)
```

That's the hi-hats, a bit quieter (`gain`), duller (`lpf`, a low-pass filter) and in a bigger space (`room`, reverb).

→ In Phyllo: the **knobs** in the inspector. In Guided they have plain names and show their function underneath: **Volume** `.gain()`, **Brightness** `.lpf()`, **Space** `.room()`, **Echo** `.delay()`, **Pan** `.pan()`, **Grit** `.shape()`. A knob at its default writes nothing at all.

Effect values can be patterns too: `.gain("[.4 .7]*4")` alternates quiet and loud hits. Phyllo shows a patterned knob as *patterned* and asks before replacing the pattern with a single value.

## Changing the pattern itself

Some functions don't change the sound, they change *when* things play:

```js
.swingBy(1/6, 4)              // swing the timing
.sometimes(x => x.ply(2))     // now and then, double each hit
.lastOf(4, rev)               // every fourth bar, play it backwards
```

→ In Phyllo: **Try one** in Guided (these three are **Bouncier**, **Busier now and then** and **Flip every 4th bar**) and the **Modifiers** list in Pro, which applies them in order.

## Tracks: `$:` lines

Each line that starts with `$:` is its own pattern, and they all play together:

```js
$: s("bd*4").bank("RolandTR909")
$: s("~ cp").bank("RolandTR909")
$: note("<a1 a1 c2 g1>*2").s("sawtooth").lpf(900)
```

→ In Phyllo: each `$:` line is one **track**. Mute a track and its line becomes `_$:`, which Strudel skips.

## Song structure: `arrange()`

A loop is a start, but a song changes over time. Strudel's `arrange()` plays patterns for a number of cycles each, one after another. Phyllo writes one `arrange()` per track from the clips on the timeline, with `silence` filling the gaps:

```js
$: arrange([4, silence], [12, s("bd*4").bank("RolandTR909")], [4, silence], [12, s("bd*4").bank("RolandTR909")])
```

→ In Phyllo: the **clips** on the timeline. This line is the kick in the House groove: silent for 4 bars, playing for 12, a 4-bar break, then 12 more.

## See it for yourself

Open the code drawer (<kbd>⌘</kbd> <kbd>/</kbd>) and choose **Whole song · arrange()** to see the full program while you work. **This section** shows just the part of the song under the playhead.

![The code drawer open under the timeline, showing the whole song's arrange() code](/screenshots/basics-code.png)

*The House groove as code. Each `$: arrange(` block is one of the tracks above it.*

Press **Copy strudel.cc link**, paste the link into a browser, and the same groove plays on strudel.cc. It also works the other way: paste a strudel.cc link into the **Import** box on Guided start, or open a `.strudel` file with **Import…** in the library, and each `$:` block becomes a track. [How Phyllo writes code](/guide/how-code-works) explains how the two stay in sync.
