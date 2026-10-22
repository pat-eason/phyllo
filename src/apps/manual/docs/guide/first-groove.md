# Your first groove

In about ten minutes you'll go from an empty Phyllo to a groove you've changed yourself, saved, and can play back. You don't need to know Strudel, music theory or any other music software. Each step names the button to press, and the screenshot marks it with a numbered badge.

::: tip Already know Strudel?
Skim this page for where things live, then read [How Phyllo writes code](/guide/how-code-works). Every step here has a "For Strudel users" note showing the code it changes.
:::

## 1. Pick a starter

On first launch, Phyllo opens on **Guided start**. (If you already have grooves, press **New groove** in the library to get here.) A starter is a short, finished groove (drums, maybe a bass or chords) that you can play straight away and then change.

![Guided start with the House groove card selected and the code preview below](/screenshots/first-pick-starter.png)

<div class="callouts">

1. **Click a starter card.** We'll use **House groove**: a four-on-the-floor kick, an offbeat clap, hi-hats and a rolling bass. The mini grid on each card is a preview of its rhythm.
2. **The code it writes.** This is the Strudel program the starter makes. You don't have to read it; it's here to show that every groove in Phyllo is real code you can take anywhere.

</div>

::: details For Strudel users
The preview is exactly what Phyllo will generate: `setcpm(124/4)` followed by one `$:` line per track. Phyllo counts one cycle as one bar, so `setcpm` is the tempo divided by the beats in a bar.
:::

## 2. Set tempo and key, then continue

Scroll down to the panel under the starters.

<div class="crop">

![Tempo stepper, key menu, Preview and Continue buttons](/screenshots/first-tempo-key.png)

</div>

<div class="callouts">

1. **Tempo**: <kbd>−</kbd> and <kbd>+</kbd> nudge the speed by one beat per minute (BPM). You can type a number too, or press **Tap** in time with a song you like. Phyllo averages your last four taps. Tempo stays between 40 and 240 BPM.
2. **Key**: the musical key. Changing it moves the bass, melody and chord tracks to the new key. Drums don't change.
3. **Preview**: plays the starter without creating a project, so you can audition starters one after another. Press **Stop preview** to stop.
4. **Continue**: creates your project and opens the main window.

</div>

## 3. Press play

You're now in **Arrange**, Phyllo's main window. Each row is a **track**, one instrument or sound, and the coloured blocks show where each track plays along the song.

![Arrange right after Continue, with the play button, readout and track list called out](/screenshots/first-arrange.png)

<div class="callouts">

1. **Play**: or press <kbd>Space</kbd>. Press it again to pause. The stop button next to it stops and returns to the start.
2. **Readout**: where you are in **bar · beat · 16th**, the tempo, the key, and the Strudel cycle count. Click the tempo number to type a new one, or click **BPM · TAP** to tap it.
3. **Tracks**: Kick, Clap, Hats and Bass. Each block is a clip, and its label (`bd*4`, `~ cp`) is the rhythm it plays.

</div>

The loop button (the circular arrows next to stop) is on, so playback cycles around the loop region, shown as the green line over bars 9–16 in the ruler.

::: warning No sound?
The first time you play a drum machine, Phyllo downloads its samples, so give it a moment. If it stays silent, check the status bar at the bottom left. It shows the audio engine's state and any error. See [Troubleshooting](/reference/troubleshooting).
:::

The rest of this tutorial uses a copy of the House groove named **Night Bus**. Yours is called **Untitled Groove** until you rename it in step 8.

## 4. Mute and solo

Two buttons on every track help you hear one part at a time:

- **M (Mute)** silences that track. Press it again to bring it back. Shortcut: <kbd>M</kbd> mutes the selected track.
- **S (Solo)** plays only that track and silences the rest. Shortcut: <kbd>S</kbd>.

![Clap muted and Kick soloed in the track list](/screenshots/first-mute-solo.png)

<div class="callouts">

1. **Clap muted**: its clips fade to show they're silent.
2. **Kick soloed**: every other track fades because only the kick plays.

</div>

Turn both off again before you carry on.

::: details For Strudel users
Mute writes `_$:` instead of `$:` for that track, so Strudel skips it. Solo mutes every other track the same way.
:::

## 5. Shape a sound

Click the **Bass** track name to select it. The panel on the right, the **inspector**, now shows the bass's settings.

![Brightness knob turned down on the bass, Try one suggestions, and the code drawer open](/screenshots/first-shape-sound.png)

<div class="callouts">

1. **Brightness**: drag the knob up or down, or click it and use the arrow keys. Lower makes the bass darker and softer, higher makes it brighter and buzzier. To type an exact value, click the knob and press <kbd>Enter</kbd> (or <kbd>⌥</kbd>-click it). Double-click resets it. The other knobs are **Volume**, **Space** (reverb), **Echo** (delay), **Pan** (left/right) and **Grit** (distortion).
2. **Try one**: ready-made ideas such as **Slow filter sweep** or **Bouncier**. Click one to hear it and click it again to take it away. **More ideas** shows the rest.
3. **Code**: press **Show code** (or <kbd>⌘</kbd> <kbd>/</kbd>) to watch the code change as you turn a knob. Changes land within about a tenth of a second, while the music keeps playing.

</div>

::: details For Strudel users
Each Guided knob writes one function, and the label under it says which: Volume `.gain()`, Brightness `.lpf()`, Space `.room()`, Echo `.delay()`, Pan `.pan()`, Grit `.shape()`. A knob left at its default writes nothing. **Try one** suggestions are modifiers: Slow filter sweep is `.lpf(sine.range(400,1400).slow(8))`, Bouncier is `.swingBy(1/6, 4)`.
:::

## 6. Change a pattern

Click **Kick** to select it, then look at the **Pattern** box in the inspector. It holds the track's rhythm in Strudel's *mini-notation*, a tiny language for rhythms: `bd*4` means "play the bass drum four times per bar".

![Kick pattern changed to bd(3,8) with its clips updated on the timeline](/screenshots/first-edit-pattern.png)

<div class="callouts">

1. **Pattern**: replace `bd*4` with `bd(3,8)`. The line below explains what you typed: "(3,8)" spreads 3 hits evenly over 8 steps. Phyllo applies the change as you type. If the text isn't valid, Phyllo shows the error and keeps playing the last valid pattern.
2. **The clips update**: the kick's blocks now show `bd(3,8)` and its new rhythm.
3. **Edit pattern**: prefer clicking to typing? This opens the [Pattern editor](/screens/pattern-editor), a grid of 16 steps you click on and off. The grid and the text stay in sync both ways.

</div>

A few more to try: `bd ~ bd ~` (`~` is a rest), `bd*2 [~ bd]` (square brackets squeeze two steps into one), `bd?` (each hit has a 50% chance). The [Mini-notation cheat sheet](/reference/mini-notation) has the rest.

## 7. Add a track

The **Sound library** on the left lists every built-in sound. Press the ▶ button next to any sound to hear it.

![Open hat in the sound library and the Add track drop zone called out](/screenshots/first-add-track.png)

<div class="callouts">

1. **Drag a sound**, here **Open hat**, by its row (or the ⠿ handle on the right).
2. **Drop it on the dashed Add track row** to make a new track playing that sound. Dropping it on an existing track's lane swaps that track's sound instead, or adds a new track just below when the two don't fit (a synth onto a drum track, say).

</div>

Not a fan of dragging? Click **Add track** and choose the kind of track you want:

![The Add track menu: Drums, Melodic, Chords, Sample, Code](/screenshots/first-add-track-menu.png)

<div class="callouts">

1. **Drums** (a drum machine pattern), **Melodic** (synth notes), **Chords** (a chord progression), **Sample** (your own sound file) or **Code** (free Strudel code). Pick a sound for it afterwards in the inspector's **Sound** menu.

</div>

## 8. Save and name it

Phyllo saves for you. A new project is filed into `~/Music/Phyllo` within a couple of seconds, and every later change autosaves too.

![Project menu open with Save highlighted, and the autosave time in the status bar](/screenshots/first-save.png)

<div class="callouts">

1. **Project menu**: click the project name at the top left. **Rename** gives your groove a real name, **Save** (<kbd>⌘</kbd> <kbd>S</kbd>) saves right now, **Save As…** (<kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>S</kbd>) makes a copy, and **Version History…** takes you back to an earlier save.
2. **Status bar**: says when the last autosave happened. Click the file path next to it to reveal the file on disk.

</div>

## Where next

- [A tour of the window](/guide/tour) names every part of the screen you just used.
- [Strudel in ten minutes](/guide/strudel-basics) explains the code behind what you just did, if you're curious.
- [Export](/screens/export) turns your groove into a WAV, MP3 or a strudel.cc link to share.
- When the Guided labels start to feel limiting, try [Pro mode](/guide/guided-and-pro).
