# Sound library panel

The panel on the left of [Arrange](/screens/arrange) holds every sound you can add: drum machines, synths, instruments and your own samples. Audition anything with a click, then drag it into the song.

Fold it away with <kbd>⌘</kbd> <kbd>J</kbd>, or drag its edge to make it wider.

![The sound library panel with the tabs, search, drum machine chips, a preview button, a drum sound row and the synths called out](/screenshots/library-panel-sounds.png)

<div class="callouts">

1. **Tabs**: **Sounds**, **Samples**, and **Starters** in Guided or **Snippets** in Pro.
2. **Search**: filters the tab you're on.
3. **Drum machines**: pick a kit (TR-909, TR-808, LinnDrum, MPC60). The rows below play from that kit.
4. **Preview**: click ▶ to hear the sound. Nothing is added to the song.
5. **Sound row**: drag it by the row (the ⠿ grip on the right shows it's draggable) onto the timeline.
6. **Synths**: built-in waveforms: `sawtooth`, `square`, `triangle`, `sine`, `supersaw`. Click a chip to hear it.

</div>

Guided names drum sounds in plain words first ("Bass drum `bd`"); Pro puts the Strudel name first ("`bd` Bass drum").

![The rest of the Sounds tab: the instruments list and the Link a folder button called out](/screenshots/library-panel-instruments.png)

<div class="callouts">

1. **Instruments**: sampled instruments, from Piano and Electric piano to Strings, Choir and Trumpet. Click to hear one.
2. **Link a folder…**: add a folder of your own audio files (WAV, AIFF, FLAC, MP3, OGG or M4A). Its sounds show up under **Your folders** and in the **Samples** tab. See [MIDI, OSC and sample folders](/screens/devices).

</div>

::: tip Built-in sounds need the internet once
Drum machines and instruments load from Strudel's online sound library the first time you use them, then stay cached on disk. Synths work offline. To fetch everything ahead of time, use **Settings › Audio › Download built-in sounds for offline use** ([Settings](/screens/settings)).
:::

## Adding a sound to the song

Drag a sound out of the panel and drop it:

| Drop it on | What happens |
| --- | --- |
| An existing track | That track's sound is swapped. A drum track keeps its rhythm (`bd*4` becomes `sd*4`). If the kinds don't fit, such as a synth on a drum track, it goes onto a new track just below. |
| The **Add track** row, or the empty space under the tracks | A new track with that sound, already playing a starter pattern. |
| Anywhere, holding <kbd>⇧</kbd> (Pro) | The sound is **layered** onto the track instead of replacing it (see below). |

Prefer the keyboard? Focus a sound (Tab to it) and press <kbd>Enter</kbd>. If the selected track can take it (a drum sound on a drum track, a synth or instrument on a melodic or chord track, a sample on a sample track) its sound is swapped; otherwise Phyllo adds a new track and selects it. <kbd>Space</kbd> on a focused sound previews it.

### Layering (Pro)

Hold <kbd>⇧</kbd> as you drop to add a sound on top of what a track already plays:

- a drum sound onto a drum track joins its pattern as a stack: `bd*4` becomes `bd*4, hh*8`;
- anything else is added to the track as a `.stack(…)` modifier, which you'll see in the inspector's modifier list.

## Search and quick add

Type in the search box to narrow the tab. In Guided you can search in plain words: "warm", "bass", "snare". Matching drum sounds, synths, instruments and your own samples are grouped, as here for "warm":

<div class="crop">

![Search for "warm" showing the sawtooth synth and instruments such as Warm pad and Electric piano](/screenshots/library-panel-search.png)

</div>

In Pro the search matches Strudel names too (`bd`, `gm_epiano1`, `supersaw`).

**Quick add:** press <kbd>⌘</kbd> <kbd>K</kbd> from anywhere in a project. Phyllo jumps to Arrange, opens the panel if it was folded, and puts the cursor in the search box. Type a few letters and press <kbd>Enter</kbd>: the top result goes onto the selected track (or onto a new track, by the same rules as above).

## Samples

The **Samples** tab lists the audio files in the folders you've linked, folder by folder. Each folder shows whether Phyllo is still scanning it or watching it for new files, and has an × to unlink it. Drag a sample onto the timeline like any other sound. Until you link a folder, the tab says so and offers to link one.

## Starters (Guided)

The **Starters** tab holds the same starter grooves as [Guided start](/guide/first-groove): House groove, Lo-fi keys, Breakbeat and more. Clicking one starts a **new** groove from it. If the open groove has unsaved changes, Phyllo asks first.

## Snippets (Pro)

In Pro the third tab becomes **Snippets**: Strudel functions you can add to a track, grouped by what they do (Time, and more as you scroll). Each row shows the code and a one-line description.

![The Snippets tab in Pro with the tab, one snippet and the footer hint called out](/screenshots/library-panel-snippets.png)

<div class="callouts">

1. **Snippets** tab (Pro only).
2. **A snippet**: `.fast(2)`, "Play the pattern twice as fast". Click **+** to add it to the selected track, or drag the row onto the **Modifiers** list in the [inspector](/screens/inspector#modifiers-pro).
3. **Hint**: how to drag and insert from this tab.

</div>

Searching snippets works like quick add: type `lpf`, `echo` or `jux` and press <kbd>Enter</kbd> to add the top match to the selected track.

::: details For Strudel users
A snippet is a chained call appended to the track's pattern, after its sound and before its knob values: `s("bd*4").bank("RolandTR909").fast(2).gain(.8)`. The order in the Modifiers list is the order in the code. See [How Phyllo writes code](/guide/how-code-works#one-track-one-line).
:::
