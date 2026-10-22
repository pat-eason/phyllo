# Track inspector

The panel on the right of [Arrange](/screens/arrange) shapes whichever track is selected: its sound, its pattern, its knobs and its effects. Click a track name (or one of its clips) to inspect it. Every change goes straight into the code and is heard while the song plays.

Fold the inspector away with <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>J</kbd>, or drag its edge to make it wider.

## Guided

![The inspector in Guided for the Bass track, with the name, Edit pattern, the sound picker, the pattern field, the knobs and Try one called out](/screenshots/inspector-guided.png)

<div class="callouts">

1. **Name**: double-click it (or focus it and press <kbd>Enter</kbd> or <kbd>F2</kbd>) to rename the track. Under it, the sound in plain words ("Sawtooth synth").
2. **Edit pattern**: opens this track in the [Pattern editor](/screens/pattern-editor), with its step grid or piano roll.
3. **Sound**: the track's sound, written as code. Click to choose another (below).
4. **Pattern**: what the track plays, in Strudel's mini-notation. Under it, Phyllo explains the pattern in plain words.
5. **Shape the sound**: six knobs. Drag up or down to turn one.
6. **Try one**: one-click ideas that make the part more interesting.

</div>

### Sound

Click the sound to open a searchable list. For a drum track the list is drum machines (TR-909, TR-808, LinnDrum, MPC60); for other tracks it's synths, instruments and your samples. In Guided you can search by feel, like "warm" or "bright":

<div class="crop">

![The sound picker open over the inspector, searching for "warm"](/screenshots/inspector-sound-picker.png)

</div>

For synth, instrument and sample tracks, if the name you type isn't in the list, **Use this sound name as typed** sets it anyway, so any sound Strudel knows can be used.

### Pattern

Type into the **Pattern** box to change what the track plays. `bd*4` is four kicks per bar; `~ cp` is a rest then a clap; `<a1 c2 g1>` plays one note per cycle in turn. The [mini-notation cheat sheet](/reference/mini-notation) has the full list.

Changes are heard as soon as you pause typing. If what you've typed isn't valid, the box shows where it went wrong ("Column 5: …") and **the last valid pattern keeps playing**, so a typo never stops the music.

### Knobs

| Knob | Turns up | Code |
| --- | --- | --- |
| **Volume** | Louder | `.gain()` |
| **Brightness** | A more open, brighter tone (it's a low-pass filter) | `.lpf()` |
| **Space** | More reverb | `.room()` |
| **Echo** | More delay | `.delay()` |
| **Pan** | Left ↔ right | `.pan()` |
| **Grit** | More distortion | `.shape()` |

- **Drag** a knob up or down, scroll over it, or use the arrow keys when it's focused.
- **Double-click** a knob to reset it. The call disappears from the code entirely rather than being set to a default value.
- <kbd>⌥</kbd>-click a knob, or press <kbd>Enter</kbd> on it, to type an exact value in real units (Hz, seconds and so on).

If a knob has an amber ring, something else already moves that setting over time (a modifier such as a filter sweep, or a pattern of values). Turning it asks **Replace the modulation with a fixed value?** Choose **Replace** to pin it, or **Keep modulation**.

When a MIDI controller knob is mapped to a setting, a **CC** badge shows its number. See [MIDI, OSC and sample folders](/screens/devices).

### Try one

**Try one** offers four ideas for the track, with **More ideas** for the rest. Click one to add it; click it again to take it back off. They're tailored to the kind of track:

| Idea | Code it adds | Offered on |
| --- | --- | --- |
| Slow filter sweep | `.lpf(sine.range(400,1400).slow(8))` | every track |
| Bouncier | `.swingBy(1/6, 4)` | every track |
| Busier now and then | `.sometimes(x => x.ply(2))` | every track |
| Flip every 4th bar | `.lastOf(4, rev)` | every track |
| Drop a few hits | `.degradeBy(.2)` | drums |
| Fast fill every 4th bar | `.lastOf(4, x => x.fast(2))` | drums |
| Crunchy | `.crush(6)` | drums, samples |
| Echoey repeats | `.echo(3, 1/8, .6)` | melodic |
| Add a fifth above | `.off(1/8, x => x.add(note(7)))` | melodic |
| Octave pops now and then | `.sometimes(x => x.add(note(12)))` | melodic |
| Stereo twist | `.jux(rev)` | melodic, chords |
| Up an octave | `.transpose(12)` | melodic, chords |
| Break the chord up | `.arp("0 1 2 1")` | chords |
| Pulse on the beat | `.struct("x*4")` | chords |
| Half speed | `.speed(.5)` | samples |
| Chop it up | `.chop(8)` | samples |

Ideas you've added show up in Pro as modifiers, so switching modes never loses them.

## Pro

Pro shows the same sound and pattern, eight knobs named after their Strudel functions, and the full **modifier chain** in place of Try one. Here the Bass track has two ideas from Try one applied:

![The inspector in Pro with the Parameters knobs, the Add modifier button, a modifier row and its on/off switch called out](/screenshots/inspector-pro.png)

<div class="callouts">

1. **Parameters**: `gain`, `lpf`, `lpq` (filter resonance), `shape`, `room`, `roomsize`, `delay`, `pan`, each with its current value. A modulated knob shows its range (`~400–1.4k`) and an amber ring.
2. **Add modifier** (+): search Strudel functions ("fast", "jux", "lpf") and pick one.
3. **A modifier**: its code and what it does. Drag the ⠿ handle to reorder, or press <kbd>⌥</kbd> <kbd>↑</kbd> / <kbd>⌥</kbd> <kbd>↓</kbd>. Double-click the code (or press <kbd>Enter</kbd> on it) to edit it in place. Hover the row for its remove button.
4. **On/off switch**: an off modifier stays in the list, dimmed, but is left out of the code. Handy for A/B-ing an effect.

</div>

### Modifiers (Pro)

Modifiers are applied **in order, top to bottom**, exactly as they're chained in the code. Besides **+**, you can drag a snippet from the library's [Snippets tab](/screens/sound-library#snippets-pro) onto this list. If a modifier's code doesn't parse, the row is outlined in red with the error under it.

::: details For Strudel users
A track's code is `source` + modifiers (in list order) + knob values + `.orbit(n)`:

```js
$: note("<a1 a1 c2 g1>*2").s("sawtooth")
     .lpf(sine.range(400,1400).slow(8)).lastOf(4, rev)
```

Knobs at their default value write nothing (Volume rests at `.8`, so no `.gain()` above). A knob whose setting is also driven by a modifier is skipped, so the modifier wins, which is why `lpf` above reads `~400–1.4k` instead of a number. See [How Phyllo writes code](/guide/how-code-works).
:::

## Code tracks

A [Code track](/screens/code#code-tracks) holds Strudel that Phyllo can't map onto a sound, a pattern and knobs. Its inspector shows the code read-only, with the note **Code track — edit in the code drawer**; edit it with **Edit code** in the [code drawer](/screens/code).

## Nothing selected?

With no track selected the inspector says **Select a track to shape its sound**. Click a track name on the left.
