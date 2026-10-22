# Mixer

The mixer is where you balance the tracks against each other: how loud each one is, how much reverb and echo it gets, which effects it runs through, and how loud the whole song comes out. Open it with <kbd>⌘</kbd> <kbd>3</kbd> or the **Mixer** tab.

Every strip is a view of the same project, so whatever you change here also shows in the inspector and in the code.

![Mixer for Night Bus with the parts of a track strip, the shared bus and the master called out](/screenshots/mixer-overview.png)

<div class="callouts">

1. **Strip header** — the track's name and sound. Click it to select the track (the inspector and pattern editor follow).
2. **Inserts** — the effects on this track, in order. Click a number to type a new value (<kbd>Enter</kbd> keeps it, <kbd>Esc</kbd> reverts, an empty value removes the effect). **+ Effect** adds one; see [below](#effects).
3. **Space and Echo** — how much of the track goes to its bus's reverb (Space) and delay (Echo). Drag up or down; double-click to reset.
4. **Bus** — which bus (Strudel *orbit*) the track sends to. **New bus** gives the track a reverb and delay of its own.
5. **Fader and meter** — the track's volume in dB, with its level meter beside it. Drag the fader, scroll on it, or use the arrow keys (<kbd>Shift</kbd> for bigger steps). Double-click resets to 0 dB. The number underneath is the current setting.
6. **M and S** — mute and solo, the same buttons as on the timeline.
7. **Bus strip** — one per bus in use. Its three knobs set the reverb's room size and the delay's time and feedback for *every* track on that bus; **M** mutes all of them at once.
8. **Master** — the output of the whole song. See [Master](#master).

</div>

The hint at the top of the screen sums it up: faders write `.gain()`, sends write `.room()` and `.delay()` on the track's bus.

::: tip When a control greys out
If a track's volume, Space or Echo is driven by a pattern (the Hats strip above shows **pattern** instead of a fader: its `.gain("[.4 .7]*4")` accents the hats), the control is locked so it can't flatten your pattern. Edit it in the inspector or the code instead.
:::

::: details For Strudel users
- The fader writes `.gain()` (0 dB is gain 1; the starters sit at `.8`, about −1.9 dB).
- Space and Echo write `.room()` and `.delay()`.
- **Bus** writes `.orbit(n)`. In Strudel, reverb and delay are per orbit, so the bus strip's `roomsize`, `delaytime` and `delayfeedback` are written to every track on that orbit — that's why they live on a shared strip.
- Bus **M** mutes every track on the orbit; it isn't a separate send.
:::

## Effects

**+ Effect** opens a short menu of what the track doesn't use yet.

<div class="crop">

![The + Effect menu on the Clap strip, listing parameters and modifiers](/screenshots/mixer-effect-menu.png)

</div>

- **Parameters** set one value on the track: a low-pass filter to darken it (`.lpf(1.2k)`), a high-pass filter to cut the low end (`.hpf(300)`), filter resonance (`.lpq(10)`), grit (`.shape(.3)`) or a pan (`.pan(.3)`). They appear as insert rows you can retype.
- **Modifiers** add a chained effect such as a slow filter sweep, bit crush, sample-rate reduction, vowel filter, distortion, phaser or `jux` stereo play. They join the track's modifier list in the [inspector](/screens/inspector), where you can reorder, edit or switch them off.

## Master

<div class="crop">

![The master strip in the dark theme with output device, output settings, peak readout, fader and Rec output called out](/screenshots/mixer-master.png)

</div>

<div class="callouts">

1. **Output device** — where sound plays. The macOS web view can't switch devices, so this follows the system default; change the output in your system's sound settings.
2. **Output** — **postgain** (the master level the fader sets), the **limiter** that stops the mix from clipping (on by default), and the audio engine's sample **rate** once sound has started.
3. **Peak** — the loudest level the master has reached recently. Keep it under 0 dB.
4. **Master fader and meter** — the level of the whole song.
5. **Rec output** — records what you hear, in real time, to a 24-bit WAV in your Exports folder. Press it again to stop; a message offers to reveal the file. For a faster-than-real-time render, use [Export](/screens/export).

</div>

::: details For Strudel users
The master fader becomes `all(x => x.postgain(…))` in the generated program (nothing is written while it's at 1). The limiter is an engine setting rather than code, so it doesn't travel with a pasted strudel.cc link.
:::
