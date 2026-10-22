# Arrange

Arrange is where a song comes together. Every track is one row, and the coloured blocks on it (**clips**) mark the bars where that track plays. Read it left to right, like any DAW: bar 1 is on the left, and the song ends at the last bar on the ruler.

Open it with <kbd>⌘</kbd> <kbd>1</kbd>, or click **Arrange** in the view tabs.

![Arrange view with the view tabs, a section, the loop region, a track header, a clip, the Add track row, Snap and Zoom called out](/screenshots/arrange-overview.png)

<div class="callouts">

1. **View tabs**: switch between Arrange, Pattern and Mixer.
2. **Sections**: named stretches of the song (Intro, Groove, Break, Drop).
3. **Loop region**: the green band on the ruler. With loop on, playback repeats these bars.
4. **Track header**: the track's name, its sound in code, a level meter, and **M**ute / **S**olo.
5. **Clip**: one stretch of bars where the track plays. Its label is the track's pattern.
6. **Add track**: click for a menu of track kinds, or drop a sound from the library here.
7. **Snap**: the grid that clip edits, seeking and the loop snap to.
8. **Zoom**: fit more or fewer bars on screen.

</div>

The summary at the top left of the timeline counts the tracks and bars ("4 tracks · 32 bars").

## Tracks

![Close-up of a track header with the name, remove button, Mute and Solo called out](/screenshots/arrange-track-header.png)

<div class="callouts">

1. **Name**: click to select the track (the inspector on the right follows). Double-click, or press <kbd>F2</kbd>, to rename it; <kbd>Enter</kbd> keeps the new name, <kbd>Esc</kbd> cancels.
2. **Remove** (×): shows on the selected or hovered track. <kbd>Delete</kbd> or <kbd>Backspace</kbd> on a focused name does the same. <kbd>⌘</kbd> <kbd>Z</kbd> brings it back.
3. **Mute** (<kbd>M</kbd>): take the selected track out of the mix. <kbd>⌘</kbd>-click **M** to mute every other track instead, leaving this one playing (⌘-click it again to unmute them all).
4. **Solo** (<kbd>S</kbd>): hear only soloed tracks. Several tracks can be soloed at once; <kbd>⌥</kbd>-click **S** to solo just this one (⌥-click it again to clear).

</div>

<kbd>↑</kbd> and <kbd>↓</kbd> on a focused track name move the selection to the track above or below. A small red dot next to a name means its code failed to run; hover it for the message (see [Code drawer › When code fails](/screens/code#when-code-fails)). A `<>` badge marks a [Code track](/screens/code#code-tracks).

::: details For Strudel users
Mute writes `_$:` instead of `$:` for that track. Solo doesn't use Strudel's `S$:`: every track that isn't soloed is written as `_$:`, so the code plays the same when pasted into strudel.cc. See [How Phyllo writes code](/guide/how-code-works#mute-and-solo).
:::

### Adding a track

Click **Add track** for a menu of track kinds:

<div class="crop">

![The Add track menu listing Drums, Melodic, Chords, Sample and Code](/screenshots/arrange-add-track-menu.png)

</div>

| Kind | What it starts with |
| --- | --- |
| **Drums** | A drum machine pattern |
| **Melodic** | Synth notes |
| **Chords** | A chord progression |
| **Sample** | Your own sound file |
| **Code** | Free Strudel code, played exactly as written |

The quicker way is to drag a sound from the [sound library](/screens/sound-library) and drop it:

- **onto an existing track** to swap that track's sound. If the kinds don't fit (a synth dropped on a drum track) Phyllo adds the sound as a new track right below instead;
- **onto the Add track row or the empty space below the tracks** to start a new track with that sound.

In Pro, hold <kbd>⇧</kbd> while you drop to **layer** the sound onto a track instead of replacing it: a drum sound dropped on a drum track joins its pattern (`bd*4, hh*8`); anything else is added with a `.stack(…)` modifier. Dropped on empty space, a ⇧-drop layers onto the selected track.

## Clips

Clips say *when* a track plays; the track's pattern says *what* it plays. Every clip of a track plays the same pattern.

| To | Do this |
| --- | --- |
| Select the track | Click a clip |
| Move a clip | Drag it sideways |
| Change where it starts or ends | Drag its left or right edge |
| Duplicate it | <kbd>⌥</kbd>-drag it to a new spot |
| Open its pattern | Double-click it, or press <kbd>Enter</kbd> on it. This opens the [Pattern editor](/screens/pattern-editor) |
| Delete it | Focus it and press <kbd>Delete</kbd> or <kbd>Backspace</kbd> |
| Nudge it from the keyboard | <kbd>←</kbd> / <kbd>→</kbd> move it, <kbd>⇧</kbd> <kbd>←</kbd> / <kbd>⇧</kbd> <kbd>→</kbd> change its length |

Clips always start and end on whole bars. All edits snap to the **Snap** grid (one bar by default), and a sub-bar or **Off** snap still moves clips one bar at a time. Every edit is one undo step (<kbd>⌘</kbd> <kbd>Z</kbd>, redo <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>Z</kbd>).

### Edit tools (Pro)

In Pro, the toolbar adds three pointer tools for drawing and cutting clips. Guided always uses Select.

![Pro toolbar with the Select, Draw and Split tools, Snap and Zoom called out](/screenshots/arrange-pro-toolbar.png)

<div class="callouts">

1. **Select** (<kbd>V</kbd>): click, drag and resize clips as above.
2. **Draw** (<kbd>B</kbd>): drag across empty bars of a lane to draw a new clip.
3. **Split** (<kbd>S</kbd>): click a clip to cut it in two at the nearest grid line.
4. **Snap**: ¼ bar, ½ bar, 1 bar, 2 bars, 4 bars or Off.
5. **Zoom**: − and +. <kbd>⌘</kbd>-scroll over the timeline zooms around the pointer.

</div>

In Pro on Arrange, <kbd>S</kbd> is the Split tool, so it no longer solos the selected track. Click **S** on the track header instead.

## The ruler: sections, loop and seeking

![The ruler with a section chip, the loop band and a bar number called out](/screenshots/arrange-ruler.png)

<div class="callouts">

1. **Section chip**: click to jump to the start of the section. <kbd>⌥</kbd>-click to loop it. Double-click to rename it. While playing, the chip under the playhead is highlighted.
2. **Loop band**: drag its top edge to move the loop, drag a side to resize it. Focused, <kbd>←</kbd> / <kbd>→</kbd> move it and <kbd>⇧</kbd> <kbd>←</kbd> / <kbd>⇧</kbd> <kbd>→</kbd> resize it.
3. **Bar numbers**: click anywhere on the ruler to move the playhead there (snapped to the grid), or drag along it to scrub.

</div>

<kbd>⇧</kbd>-drag across the ruler to draw a new loop region. <kbd>L</kbd> turns looping on and off, the same as the loop button in the header.

::: details For Strudel users
The loop and the playhead position are playback state, not song content: Phyllo applies them around the program while it plays (`ribbon` and `early` on the evaluated pattern) and never writes them into the code you see or export.
:::

## Side panels

The [sound library](/screens/sound-library) on the left and the [track inspector](/screens/inspector) on the right can be resized or folded away to give the timeline more room.

- Drag the thin grip between a panel and the timeline to resize it. The width is remembered.
- Click the small **‹** / **›** tab on the grip to fold a panel. <kbd>⌘</kbd> <kbd>J</kbd> folds or unfolds the sound library, <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>J</kbd> the inspector.

![Arrange with both side panels folded, the expand tabs at each edge called out](/screenshots/arrange-panels-collapsed.png)

<div class="callouts">

1. **Expand sound library** (<kbd>⌘</kbd> <kbd>J</kbd>).
2. **Expand inspector** (<kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>J</kbd>).

</div>

<kbd>⌘</kbd> <kbd>K</kbd> unfolds the sound library on its own when you use it to search.

## Keys on Arrange

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Play / pause |
| <kbd>L</kbd> | Loop on / off |
| <kbd>M</kbd> / <kbd>S</kbd> | Mute / solo the selected track (in Pro, <kbd>S</kbd> is the Split tool) |
| <kbd>V</kbd> / <kbd>B</kbd> / <kbd>S</kbd> | Select / Draw / Split tool (Pro) |
| <kbd>⌘</kbd> <kbd>J</kbd> / <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>J</kbd> | Fold the sound library / the inspector |
| <kbd>⌘</kbd> <kbd>K</kbd> | Search sounds (quick add) |
| <kbd>⌘</kbd> <kbd>/</kbd> | Show or hide the code |

Every shortcut is listed in [Keyboard shortcuts](/reference/shortcuts).
