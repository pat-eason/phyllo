# Pattern editor

The pattern editor is where you decide *what a track plays inside one bar*: which drum hits land on which step, which notes a melody uses, how hard each hit is, and how it feels. Every click rewrites the track's mini-notation, and typing mini-notation redraws the grid, so you can work whichever way suits you.

Open it with <kbd>⌘</kbd> <kbd>2</kbd>, the **Pattern** tab at the top of the window, or **Edit pattern** in the [track inspector](/screens/inspector). It always edits the track that is selected in Arrange.

## The step grid

Drum tracks open on **Steps**: one row per drum sound, sixteen steps per row, four steps to a beat.

![Pattern editor on the Kick track of Night Bus, with the editor tabs, step grid, writes column, Add sound, velocity lane, live code, length, kit and Play pattern called out](/screenshots/pattern-steps.png)

<div class="callouts">

1. **Steps · Piano roll · Code** — three ways to edit the same pattern. Drum tracks start on Steps, note tracks on Piano roll, anything else on Code.
2. **Step grid** — click a cell to turn a hit on or off, or press and drag along a row to paint several. Click a row's name to select it (the velocity lane and the Euclid tool follow the selected row); the small play button next to it auditions the sound.
3. **writes** — the mini-notation each row produces, updated as you click. Here the kick row writes `bd*4`: the bass drum four times per bar.
4. **+ Add sound** — adds a row for another sound from the track's kit (snare, toms, crash…). The row is saved once it has at least one hit.
5. **Velocity** — how hard each hit of the selected row plays. Drag up and down across the bars to draw, or focus a bar and use the arrow keys (<kbd>Page Up</kbd>/<kbd>Page Down</kbd> for bigger jumps, <kbd>Home</kbd> silent, <kbd>End</kbd> full).
6. **Live code** — the track's sound call, kept in sync with the grid in both directions. Edit the text and press <kbd>Enter</kbd> (or click away) to apply it; <kbd>Esc</kbd> puts it back.
7. **Length** — patterns are one cycle long (one bar, 16 steps) in this version.
8. **Kit** — the drum machine the track uses: TR-909, TR-808, LinnDrum or MPC60. Changing it keeps your steps and swaps the sounds.
9. **Play pattern** — plays just this track, soloed, so you can hear your edits on their own. The temporary solo is taken back when you stop, switch tracks or leave the editor.

</div>

The keyboard works too: <kbd>Tab</kbd> into the grid, move with the arrow keys and toggle a step with <kbd>Space</kbd> or <kbd>Enter</kbd>.

::: details For Strudel users
All rows of a drum track live in one `s("…")` call, layered with commas, and the kit is `.bank()`:

```js
s("bd*4, cp(5,8)").bank("RolandTR909")
```

When a track has a single row, velocity is written as a `.gain("…")` pattern (the lane's caption says `Kick → .gain()`). With several rows each hit carries its own gain instead (`cp:0:gain`), so rows don't fight over one `.gain()`. The grid reads mini-notation it can lay out on 16 steps — `~`, `*`, `[ ]`, `,`, Euclid `(k,n)` and the like. If a pattern doesn't fit (longer than a bar, triplets, `<…>` alternation…), the Steps tab says why and shows the text, which keeps playing as written; **Replace with a step pattern** starts the row over on the grid.
:::

## Spread hits evenly, Feel and the cheat sheet

The right-hand column holds tools that write the pattern for you.

<div class="crop">

![Pattern tools column with Spread hits evenly, Feel and Mini-notation, quickly called out](/screenshots/pattern-tools.png)

</div>

<div class="callouts">

1. **Spread hits evenly** — a Euclidean rhythm: choose how many **Hits** (1–8) to spread as evenly as possible over 8 steps, check the preview, then **Apply to** the selected drum row. It only works on drum rows.
2. **Feel** — three sliders that change how the *whole track* grooves, without touching its steps:
   - **Swing** pushes every other step a little late.
   - **Chance to skip** randomly leaves out a share of the hits.
   - **Fill every 4th cycle** plays every fourth bar two or four times as fast, like a drum fill.

   In Guided mode each slider says in words what it's doing. Back at the far left a slider is **off** and writes nothing.
3. **Mini-notation, quickly** — the eight symbols you'll use most, with what they do. The full list is in the [mini-notation cheat sheet](/reference/mini-notation).

</div>

Here the Clap row got **5** hits from Spread hits evenly:

![The Clap row after applying five hits over eight steps, writing cp(5,8)](/screenshots/pattern-euclid.png)

*Five claps spread over the bar; the writes column now reads `cp(5,8)`.*

::: details For Strudel users
The Euclid tool writes `sound(hits,8)` into the row. Each Feel slider adds one modifier to the track's chain, so it shows up in the inspector's modifier list and in the code:

| Slider | Writes |
| --- | --- |
| Swing | `.swingBy(1/6, 4)` (up to a third) |
| Chance to skip | `.degradeBy(.3)` |
| Fill every 4th cycle | `.lastOf(4, x => x.fast(2))` or `x.fast(4)` |

If you hand-write one of these calls with the same shape, the slider picks it up.
:::

## Piano roll

Melodic tracks that play `note("…")` open on **Piano roll**: sixteen steps across, the pitches of the project's key down the side (two octaves).

![Piano roll on the Lead track of Neon Orchard with the key bar, the note grid and the live code called out](/screenshots/pattern-piano-roll.png)

<div class="callouts">

1. **Key and Snap to key** — the project's key (set in the header or on Guided start). With **Snap to key** on, only notes in the key are shown; turn it off to reach every semitone.
2. **Note grid** — click a cell to place a note on that step, click it again to remove it. Each step holds one note, and a new note plays as you place it so you can hear it.
3. **Live code** — the same `note("…")` call, editable as text.

</div>

Chord tracks and patterns the roll can't lay out (more than one note per step, `<…>` alternation and so on) stay editable in the **Code** tab.

## Code tab

**Code** shows the track's generated Strudel exactly as it appears in the [code drawer](/screens/code) (read-only), with an editable **Pattern** field under it.

<div class="crop">

![Code tab showing the Kick track's generated arrange() code and its editable pattern field](/screenshots/pattern-code.png)

</div>

<div class="callouts">

1. **Generated code** — the track's whole line, including the `arrange()` that places its clips on the timeline.
2. **Pattern** — the mini-notation alone. Type and press <kbd>Enter</kbd>; mistakes are flagged with the column where Strudel stopped understanding, and nothing changes until the pattern is valid. Underneath, Phyllo explains the pattern in plain words (`"*4" plays it four times per cycle.`).

</div>

Code tracks (anything imported that Phyllo can't map to a sound and a pattern) are edited as text in the code drawer instead.

## Limits

- One bar, 16 steps. Longer patterns, triplets and odd subdivisions play fine but are edited as text.
- The piano roll holds one note per step; chords live in chord tracks and are edited as text.
- Spread hits evenly always spreads over 8 steps.
