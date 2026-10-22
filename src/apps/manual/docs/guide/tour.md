# A tour of the window

This is **Arrange**, where you spend most of your time in Phyllo. Every other screen (Pattern, Mixer, the Groove library, Settings) opens from here. The screenshot is in Guided mode. Pro moves a few things around, which [Guided and Pro](/guide/guided-and-pro) covers.

![The Arrange window with fourteen numbered areas](/screenshots/tour-window.png)

## The header

<div class="callouts">

1. **Project menu**: the groove's name. Click it to **Rename**, **Save**, **Save As…**, **Show in Finder** or open **Version History…**. Recent projects are listed in the same menu.
2. **Transport**: back to start, **Play** / pause (<kbd>Space</kbd>), stop, and **Loop** (<kbd>L</kbd>). When focus is on the transport, <kbd>⏎</kbd> stops and returns to the start.
3. **Readout**: the playhead position as bar · beat · sixteenth, the tempo (click to type a new one, or click **BPM · TAP** to tap it in), the key and time signature, and the running Strudel cycle count.
4. **Metronome**: a click on every beat while the song plays, higher on the first beat of each bar. It follows the time signature, and it's only for your ears: it never ends up in the code, an export or the meters.
5. **Guided / Pro**: how much of the machinery you see. It changes labels and controls, never your project. Shortcut <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>G</kbd>.
6. **Theme**: switch between the light and dark themes. Settings has a third option, matching your system.
7. **Settings** (<kbd>⌘</kbd> <kbd>,</kbd>): appearance, audio, MIDI and OSC, sample folders, shortcuts, code editor and system options. See [Settings](/screens/settings).
8. **Export** (<kbd>⌘</kbd> <kbd>E</kbd>): render audio, stems, MIDI or code. See [Export](/screens/export).

</div>

## The workspace

<div class="callouts">

9. **Sound library**: every sound you can use. **Sounds** holds drum machines, synths and instruments, **Samples** your own sound files, and **Starters** whole grooves (in Pro this tab is **Snippets**, reusable bits of code). Press ▶ to hear a sound, then drag it onto the timeline. Drag the panel's edge to resize it, or hide it with <kbd>⌘</kbd> <kbd>J</kbd>. See [Sound library panel](/screens/sound-library).
10. **View tabs**: **Arrange** (<kbd>⌘</kbd> <kbd>1</kbd>), **Pattern** (<kbd>⌘</kbd> <kbd>2</kbd>) and **Mixer** (<kbd>⌘</kbd> <kbd>3</kbd>) are three views of the same project. The **Snap** menu and zoom <kbd>−</kbd> / <kbd>+</kbd> on the right of this bar control the timeline.
11. **Timeline**: one row per track. On the left, each track has its name, the start of its code, and **M** (mute) and **S** (solo). On the right are its clips laid out over bars. Above the rows are the **sections** (Intro, Groove, Break, Drop) and the bar ruler, where a green line marks the loop region. Below them, **Add track** makes a new track. See [Arrange](/screens/arrange).
12. **Inspector**: everything about the selected track: its sound, its pattern, the knobs that shape it, and **Try one** suggestions (or, in Pro, the modifier chain). Resize it by its edge, or hide it with <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>J</kbd>. See [Track inspector](/screens/inspector).
13. **Code**: the Strudel program Phyllo is writing for you. In Guided it starts folded down to this one line. Press **Show code** or <kbd>⌘</kbd> <kbd>/</kbd> to open it. See [Code drawer](/screens/code).
14. **Status bar**: whether the audio engine is running (or why not), the audio output, the MIDI input, and when the project was last saved. Click the output or MIDI item to jump to its settings, or the file path to reveal the file on disk.

</div>

## Tips

In Guided mode, a **tip card** sits above the code bar. It walks you through five short steps: starters, mute and solo, shaping a sound, editing a pattern, and exporting.

<div class="crop">

![The tip card, with Show me and Hide tips buttons](/screenshots/tour-tips.png)

</div>

<div class="callouts">

1. **Show me** highlights the control the tip is talking about.
2. **Hide tips** puts the card away. To bring it back, or start the steps over, use **Settings › General › Show tips in Guided mode** and **Restart tips**.

</div>

## Keys worth learning first

| Key | Does |
| --- | --- |
| <kbd>Space</kbd> | Play / pause |
| <kbd>M</kbd> / <kbd>S</kbd> | Mute / solo the selected track |
| <kbd>⌘</kbd> <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | Arrange / Pattern / Mixer |
| <kbd>⌘</kbd> <kbd>/</kbd> | Show or hide the code |
| <kbd>⌘</kbd> <kbd>Z</kbd> / <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>Z</kbd> | Undo / redo |

Single-letter shortcuts never fire while you're typing in a field or in the code editor. The full list is in [Keyboard shortcuts](/reference/shortcuts). On Windows and Linux, use <kbd>Ctrl</kbd> wherever this manual shows <kbd>⌘</kbd>.
