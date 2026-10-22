# Troubleshooting

The status bar along the bottom of the window is the first place to look. Its left end shows whether the audio engine is running, which output it uses and which MIDI input is connected. Its right end shows the project file and when it was last saved.

## I pressed Play and hear nothing

- **First play of a session.** Browsers and web views only start audio after a click or key press. Press **Play** (or <kbd>Space</kbd>) once; the status bar changes from *Not started · press Play*.
- **Drum machines and instruments are silent, synths work.** Built-in drum machines and instruments load from Strudel's servers the first time you use them. Check your network connection, or go to **Settings › Audio** and choose **Download built-in sounds for offline use** while you're online. Synth sounds (`sawtooth`, `square`, `triangle`, `sine`, `supersaw`) never need the network.
- **Everything is muted or something is soloed.** Look for a lit **M** or **S** on the track headers or in the [Mixer](/screens/mixer). While any track is soloed, every un-soloed track is silent.
- **The playhead is in an empty stretch.** Clips only sound where they sit on the timeline. Jump back with **Back to start** in the transport, or click a section chip.
- **Sound comes out of the wrong speakers.** The macOS web view can't route audio to a chosen device, so Phyllo always plays through the system default output. Change it in your Mac's sound settings.

## The status bar says *Audio couldn't start*

The web view refused to start an audio context. Close other apps that hold the audio device exclusively, check your system output, then press Play again. Restarting Phyllo clears a stuck audio device.

## The status bar shows a red error

An error such as *1 error · Bass line 6: …* means one track's Strudel code doesn't run. Phyllo keeps playing the last version that worked, so the music doesn't stop, and marks the failing track. Click the error to open the [code drawer](/screens/code), fix or undo (<kbd>⌘</kbd> <kbd>Z</kbd>) the change, and the error clears as soon as the code runs.

## *MIDI notes need audio — press Play once*

The first note from your keyboard arrived before audio had started. Press Play once; after that, notes play straight away. See [MIDI, OSC and sample folders](/screens/devices) for setting up devices.

## My recording didn't land

After you arm recording (<kbd>R</kbd>) and play, the status bar reports what happened:

| Message | What to do |
| --- | --- |
| *Recorded 7 notes onto Bass* | Nothing; it worked. |
| *Nothing recorded — no notes were played* | Playback stopped before any note arrived. Check the MIDI input is on in **Settings › MIDI & OSC** and the status bar names it. |
| *Select a track to record onto* | Click a track header first. |
| *Couldn't record onto …* | Nothing you played maps onto that track: it's a Code track, or a drum track and the notes weren't General MIDI drum notes. Pick a melodic track, or send General MIDI drum notes (kick on 36, snare on 38…). |

## The step grid says *This pattern can't be shown as steps*

The pattern uses something a 16-step grid can't draw: randomness, a change from bar to bar, triplets and the like. It still plays exactly as written, and you can keep editing it as text. The [mini-notation cheat sheet](/reference/mini-notation#how-the-step-grid-writes-mini-notation) lists the cases.

## I imported code and some of it became a "Code" track

Phyllo turns every `$:` block it understands into a regular track with knobs and clips. Anything it can't map stays as a Code track, exactly as you wrote it, so nothing gets dropped or rewritten. See [How Phyllo writes code](/guide/how-code-works).

## I lost my changes

Open the project menu (click the project name in the header) and choose **Version History…**. With autosave on, Phyllo keeps the 50 most recent saved versions of each project. Grooves moved to the Trash from the library are in your system Trash. See [Files and storage](/reference/files).

## Still stuck?

Phyllo is developed and verified on macOS. MIDI devices, media keys, menu-bar mode and OSC to SuperDirt haven't yet been exercised with real hardware, so problems there are worth reporting on [GitHub](https://github.com/pat-eason/phyllo/issues) with the status bar text and what you were doing.
