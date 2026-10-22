# MIDI, OSC and sample folders

Phyllo makes all its sound by itself, so none of this is needed to get started. This page is for when you want to play it from a keyboard or pad controller, send patterns to other software, or use your own samples.

::: warning Not yet tested with real hardware
MIDI devices, media keys, menu-bar mode and OSC to SuperDirt are built and unit-tested, but haven't been exercised with real hardware yet. If something doesn't behave as described here, please report it.
:::

## MIDI

Connect a controller, then open **Settings › MIDI & OSC**. Phyllo reads MIDI devices natively, so they work even though the system web view has no Web MIDI of its own.

<div class="crop">

![MIDI & OSC settings with the device table, CC mapping and SuperDirt address called out](/screenshots/devices-midi-osc.png)

</div>

<div class="callouts">

1. **Devices** — every MIDI input and output, with its direction and what Phyllo uses it for. Flip the switch on the right to turn a device on. **Rescan devices** looks again if you plugged something in while Phyllo was open.
2. **CC mapping** — **Map 8 knobs to the inspector (CC 13–20)** sends your controller's first eight knobs to the eight Pro knobs on the selected track (volume, filter, resonance, grit, reverb, room size, echo, pan). **Clear** removes the mapping.
3. **SuperDirt address** — host and port for OSC (see [below](#osc-to-superdirt)).

</div>

### Play the selected track

With an input turned on, notes you play sound through whichever track is selected, using its sound and effects. How hard you hit a key sets the volume. Notes ring for a fixed half second (note-offs are ignored), and nothing plays until audio has started, so press play once first.

Drum pads and controllers that send General MIDI drum notes (channel 10) play the drum track's kit: kick, snare, hats and so on.

### Record into a pattern

As soon as a MIDI input is turned on, a **Record** button joins the transport. An output on its own doesn't add it, since there's nothing to record from.

1. Select the track you want to record onto.
2. Press **Record** (or <kbd>R</kbd>) to arm, then play.
3. Play your part while the song runs.
4. Stop. Phyllo writes what you played into the selected track's pattern as one change, so <kbd>⌘</kbd> <kbd>Z</kbd> undoes the whole take.

Notes are snapped to sixteenths. A take that spans several bars becomes a pattern that alternates bar by bar. Drum notes on a drum track become steps in its kit; notes on a chord track turn it into a melody track. Code tracks can't be recorded onto.

::: details For Strudel users
The take is written as mini-notation: one bar is a plain sequence, several bars fold into `<…>` (one entry per bar), rotated so each bar lands on the cycle where you played it. Velocity isn't recorded.
:::

### Send MIDI out

Turn on an output device, then add `.midi()` to a track's code (in the inspector's modifiers or the code drawer). The track's events go out to the first enabled output, timed to line up with what you hear. Use this to drive hardware synths or another app.

## OSC to SuperDirt

If you have SuperCollider with [SuperDirt](https://github.com/musikinformatik/SuperDirt) running, Phyllo can send it patterns, the same way TidalCycles does.

1. Turn on **SuperDirt** in the device table (off by default).
2. Check **SuperDirt address**: `127.0.0.1` port `57120` is SuperDirt's default.
3. Add `.osc()` to the tracks that should play through SuperCollider.

## Sample folders

Link a folder of your own sounds and every audio file in it (and in its subfolders) becomes a sound you can use. Link one from **Settings › Sample folders**, or from the **Samples** tab of the [sound library panel](/screens/sound-library):

<div class="crop">

![Samples tab in the sound library panel with Link a folder… called out](/screenshots/devices-samples-tab.png)

</div>

- WAV, AIFF, FLAC, MP3, OGG and M4A files are picked up.
- Each file becomes a sound named after it, so `vox.wav` plays with `s("vox")`.
- Linked folders are watched: drop a new file in with Finder and it shows up in the library without a restart.
- Your folders stay where they are. Phyllo links to them and doesn't copy anything; if a folder moves, it's marked **Not found**.

## Offline sounds

The built-in drum machines, sampled instruments and soundfonts load from the internet the first time you use them, then stay cached on disk in `~/Music/Phyllo/.cache/sounds/`. The basic synths (sawtooth, square, triangle, sine, supersaw) need no download at all.

To make sure everything works on a plane or a stage with no Wi-Fi, go to **Settings › Audio › Offline sounds** and press **Download built-in sounds for offline use** while you're online. **Clear cache** deletes the downloads again.

## Media keys and the menu bar

Both live in **Settings › System**:

- **Media keys control playback** (on by default): the play/pause and skip keys on your keyboard control Phyllo even when another app is in front. On macOS, Phyllo also shows up in the system's Now Playing controls.
- **Keep playing from the menu bar** (off by default): closing the window leaves a small transport in the menu bar, so the music keeps playing. From there you can play, pause, stop, **Show Phyllo** or **Quit Phyllo**.
