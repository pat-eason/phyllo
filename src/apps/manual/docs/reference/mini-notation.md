# Mini-notation cheat sheet

Mini-notation is the little language inside the quotes of a Strudel pattern: the `bd*4` in `s("bd*4")`. Phyllo shows it in the inspector's **Pattern** field, under the step grid's **writes** column, and in the Pattern editor's **Live code** field. Anything you type there is real Strudel, so everything on this page also works on [strudel.cc](https://strudel.cc).

## The basics

One pattern fills **one cycle**, and in Phyllo one cycle is one bar. Whatever you write is squeezed or stretched to fit that bar.

| Type | Means | Try |
| --- | --- | --- |
| `bd sd` | Two steps: kick on the first half, snare on the second | `bd sd bd sd` |
| `~` | A rest: stay silent for one step | `bd ~ sd ~` |
| `bd*4` | Repeat four times within the step | `hh*8` |
| `[a b]` | Fit both sounds into a single step | `bd [sd sd]` |
| `<a b>` | Take turns, playing one per cycle | `<bd sd>` |
| `a, b` | Play together, as layers | `bd*4, hh*8` |
| `bd?` | A 50% chance to play | `hh*8?` |
| `bd(3,8)` | Spread 3 hits evenly over 8 steps (Euclidean rhythm) | `bd(3,8)` |
| `a@3` | Stretch over three steps | `bd@3 sd` |

These are the same eight entries as the **Mini-notation, quickly** panel in the Pattern editor.

## Notes and chords

Melodic tracks use note names inside `note("…")`. A letter, an optional `b` or `#`, and an octave number:

| Type | Means |
| --- | --- |
| `c3 e3 g3` | Three notes in a row |
| `a1 a1 c2 g1` | A bass line; lower numbers are lower octaves |
| `[c3,e3,g3]` | A chord: the notes play together |
| `<a1 c2>*2` | Alternate between two notes, twice per bar |

The key you pick on Guided start transposes melodic and chord tracks for you; you don't have to rewrite note names by hand.

## How the step grid writes mini-notation

The Pattern editor's step grid is one bar of 16 steps. Each row is one sound, and the grid writes the shortest mini-notation that matches what you clicked:

| Grid | Writes |
| --- | --- |
| A hit on every beat | `bd*4` |
| Hits on beats 2 and 4 | `[~ cp]*2` |
| Every eighth note | `hh*8` |
| Kick on beats 1 and 3, snare on beat 4 | `[bd ~]*2, ~ ~ ~ sd` (one layer per row) |
| Spread hits evenly, 3 hits over 8 | `bd(3,8)` |
| Several rows at once | `bd*4, [~ cp]*2, hh*8` (rows become layers) |

It also works backwards: type `bd*4` into the Live code field and the grid lights up. Some patterns can't be drawn on 16 steps without losing something, so the grid steps aside with *This pattern can't be shown as steps* and the text stays fully editable. That happens when a pattern:

- uses random choice (`?` or `|`),
- changes from cycle to cycle (`<bd sd>`),
- has hits between steps, such as triplets,
- contains values that aren't sound names, or
- plays the same sound twice on one step.

::: details For Strudel users
Phyllo doesn't restrict the mini-notation you can type: the pattern string goes into the generated code as-is, and the step grid reads it with `@strudel/mini` itself (`mini2ast`, then querying 16 cycles of events). Polymeters (`{a b c}%4`), weights, replication (`a!2`) and sample numbers (`bd:3`) all play. Only the grid's two-way sync is limited, and it only gives up for the reasons above.
:::

## Further reading

- [Strudel: First Sounds](https://strudel.cc/workshop/first-sounds/) introduces the same ideas with live examples.
- [Strudel: Mini-notation](https://strudel.cc/learn/mini-notation/) is the full reference.
