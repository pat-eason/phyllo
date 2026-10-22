# Export

Export turns a groove into something you can share or take into another app: a finished audio file, one file per track, a MIDI file, or the Strudel code itself. Open it with <kbd>⌘</kbd> <kbd>E</kbd> or the **Export** button at the top right. It always exports the groove that's open.

## Mixdown

A mixdown is the whole mix in one stereo file: what you hear when you press play.

<div class="crop">

![Export dialog on Mixdown with export type, range, format settings, destination, options and the Export WAV button called out](/screenshots/export-mixdown.png)

</div>

<div class="callouts">

1. **Export type** — Mixdown, Stems, MIDI or Code.
2. **What to export** — the **Whole song**, the **Loop region** (the bars between the loop markers on the timeline), or **A section** such as Intro or Drop. Each card shows the bars and running time.
3. **Format, Bit depth, Sample rate, Tail**
   - **Format**: WAV, FLAC or MP3 320.
   - **Bit depth**: 24-bit (the default), 16-bit or 32-bit float. MP3 is always 320 kbps.
   - **Sample rate**: your device's rate or 44.1 kHz.
   - **Tail**: None, 2 bars or 4 bars of extra time after the end so reverb and echo can ring out instead of being cut off.
4. **Save to** — the file to write. It defaults to your Exports folder (`~/Music/Phyllo/Exports`) and the groove's name; **Choose…** picks somewhere else.
5. **Options**
   - **Normalize peak to −1 dBFS** raises or lowers the whole file so its loudest moment sits just under full scale.
   - **Save the Strudel code next to the audio** writes a `.strudel` file with the same name, so you always know what made the sound.
   - **Show in Finder when done**.
6. **Export** — the button names what it will do (*Export WAV*, *Export 4 stems*…).

</div>

Phyllo renders the song *faster than real time*: the grey note above the buttons estimates how long it will take. The first export can take longer while the built-in sounds download. While it runs you can close the dialog and keep working; Phyllo tells you when the file is ready, with a button to reveal it.

## Stems

Stems are one audio file per track, for mixing the song in another DAW. The settings are the same as Mixdown, plus a **Tracks** list to choose which tracks to bounce (muted tracks are marked). Each track is rendered on its own, soloed, and the files land in the folder you pick, named `<groove> - <track>`.

<div class="crop">

![Export dialog on Stems with the track checklist](/screenshots/export-stems.png)

</div>

## MIDI

MIDI export writes the notes as a `.mid` file you can drop into any DAW or notation app. It's instant, because Phyllo reads the notes straight from the patterns instead of rendering audio.

<div class="crop">

![Export dialog on MIDI with range, track layout and destination](/screenshots/export-midi.png)

</div>

- **Tracks**: **One track per pattern** gives each Phyllo track its own MIDI track; **Single track** puts everything on one.
- Drum tracks go to MIDI channel 10, the General MIDI drum channel, so drum hits arrive as kick, snare, hat and so on.

## Code

Code export shares the groove as Strudel instead of sound.

<div class="crop">

![Export dialog on Code with Strudel file and strudel.cc link choices](/screenshots/export-code.png)

</div>

- **Strudel file** writes a `.strudel` file. It opens in Phyllo (each `$:` block becomes a track) or pastes into [strudel.cc](https://strudel.cc) as is.
- **strudel.cc link** copies a link to the clipboard. The whole program travels inside the link, so whoever opens it hears the groove without an account. Long songs make long links.
- **Code** chooses the whole song (with its `arrange()` timeline) or a single section.

::: details For Strudel users
The exported program is exactly what the [code drawer](/screens/code) shows for that scope: `setcpm(bpm/beatsPerBar)`, one `$:` line per track, muted tracks as `_$:`, and `arrange([bars, pattern], …)` for the timeline. The master limiter is an engine setting, so it isn't in the code; strudel.cc plays the program without it.
:::

::: warning Running in a browser
If you run Phyllo's frontend in a plain browser (`pnpm --filter phyllo dev`), exports download through the browser and audio can only be written as WAV. FLAC and MP3 need the desktop app.
:::
