# Code drawer

Everything you do in Phyllo is written as real [Strudel](https://strudel.cc) code. The code drawer, pinned under the timeline on [Arrange](/screens/arrange), shows that code as it changes. You never have to open it, but it's always there to read, copy or edit.

- <kbd>⌘</kbd> <kbd>/</kbd> or **Show code** / **Hide code** opens and closes it.
- In Guided it starts closed, with a one-line summary ("Phyllo writes Strudel as you work — 4 patterns ready"). In Pro it starts open. Once you open or close it yourself, Phyllo remembers your choice.
- Drag its top edge to make it taller or shorter. Font size and line numbers are set in **Settings › Code editor** ([Settings](/screens/settings)).

![The open code drawer in Pro with the scope switch, Edit code, Copy strudel.cc link and Hide code called out](/screenshots/code-drawer.png)

<div class="callouts">

1. **Scope**: **This section** shows only the code for the section under the playhead (here the Intro). **Whole song · arrange()** shows the full song.
2. **Edit code** (Pro): edit the whole song as text.
3. **Copy strudel.cc link**: copies a link that opens this exact code at strudel.cc. The button reads **Link copied** for a moment.
4. **Hide code**: close the drawer.

</div>

The line for the selected track is highlighted, and the summary next to **Code** says what's shown, when the code last ran and whether there are errors.

## This section vs. the whole song

**This section** is the code to read while you work on one part: just the tracks that play in it, without any arrangement around them, so it's short. It's also the easiest code to paste into strudel.cc and play with.

**Whole song · arrange()** is the complete program. Tracks that don't play from the first bar to the last are wrapped in Strudel's `arrange()`, which says how many bars to stay silent and how many to play:

![The whole-song code: setcpm, then one $: arrange(...) block per track](/screenshots/howcode-song.png)

*The Night Bus groove: four tracks, each block lining up with its clips on the timeline.*

[How Phyllo writes code](/guide/how-code-works) walks through this program line by line.

## Editing a pattern in place

Click any quoted pattern in the drawer, like `"bd*4"`, and it turns into a text field. <kbd>Enter</kbd> saves it, <kbd>Esc</kbd> puts it back. It's the same as editing **Pattern** in the [inspector](/screens/inspector#pattern), so the clips, the inspector and the sound all follow.

## Edit code (Pro)

**Edit code** turns the drawer into a text editor holding the whole song:

![Edit code mode: the whole song in a text editor, with Cancel and Apply below](/screenshots/code-edit.png)

Change anything, then press **Apply** (or <kbd>⌘</kbd> <kbd>↩</kbd>). Phyllo reads the code back into tracks: each `$:` block becomes a track, with its sound, pattern, knobs and modifiers filled in. **Cancel** or <kbd>Esc</kbd> leaves without changing anything, and <kbd>⌘</kbd> <kbd>Z</kbd> undoes an apply.

Editing always uses the whole song, never a section: applying replaces every track, so section code would drop the others. The scope switch is greyed out while you edit.

If the code has a syntax error, Phyllo shows where ("Line 4, column 12: …") and keeps both your draft and the song as they were. Fix it and apply again.

## Code tracks

Phyllo maps code onto tracks when it fits the shape it writes itself: a sound or note call on a quoted pattern (`s("…")`, `note("…")`, `n("…")`, `chord("…").voicing()`), followed by chained calls. Anything else, such as a `stack(…)` of several patterns, a block with comments or a computed pattern, becomes a **Code track**. Phyllo plays it exactly as written and never rewrites it.

![A Code track: its lane marked with a code badge and its inspector showing the code read-only](/screenshots/code-track.png)

<div class="callouts">

1. **Code track**: the `<>` badge marks it. It has clips, Mute and Solo like any other track.
2. **Inspector**: shows the code read-only. To change it, use **Edit code**.

</div>

You can also add an empty Code track yourself: **Add track › Code** on the timeline.

## When code fails

Strudel can still fail when the code runs, for example when a modifier calls a function that doesn't exist. When that happens:

- **the last good version keeps playing**. Phyllo never stops the music for a mistake;
- the track at fault gets a red dot on its header (hover it for the message), and the inspector shows the error under **Pattern**;
- the drawer shows a red banner naming the line or track, such as "Line 9: …", and marks the line in the code.

Fix the pattern, the modifier or the code, and the new version replaces the old one as soon as it runs cleanly.

A typo in the inspector's **Pattern** box never gets this far: Phyllo checks the pattern as you type and doesn't use it until it's valid.

## Bringing Strudel code in

Already have something in Strudel? Bring it into Phyllo and each `$:` pattern becomes its own track.

| From | How |
| --- | --- |
| A strudel.cc link | Paste it into **Or paste a strudel.cc link** on [Guided start](/guide/first-groove) and press **Import**. Plain Strudel code works there too. |
| A `.strudel` file | **File › Open…** (<kbd>⌘</kbd> <kbd>O</kbd>) or **Import…** in the [Groove library](/screens/groove-library). It opens as a new groove. |
| Code you're editing | Paste it into **Edit code** and **Apply**. |

strudel.cc has two kinds of link. Links with the code inside (`https://strudel.cc/#…`, from **Share › Copy link with code**) import fine. Short links (`https://strudel.cc/?…`) only point to strudel.cc's database, so Phyllo can't open them offline and says so.

::: details For Strudel users: what survives a round trip
Phyllo never drops or rewrites code it didn't generate. Top-level statements it doesn't model (`samples(…)`, `const` declarations, comments outside tracks) are kept verbatim at the top of the program, after `setcpm`. `setcpm(…)` / `setcps(…)` become the tempo, `all(x => x.postgain(v))` becomes the master level, and `hush()` mutes the blocks above it. Labelled blocks (`bass: …`) take the label as the track name. The full rules are in [How Phyllo writes code](/guide/how-code-works#reading-code-back).
:::
