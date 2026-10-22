# Guided and Pro

Phyllo has two levels of detail, and you can switch between them at any time with the **Guided / Pro** switch in the header or <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>G</kbd>.

- **Guided** uses plain words (*Brightness*, *Space*, *Echo*), shows fewer controls, offers suggestions, and keeps the code folded away until you ask for it.
- **Pro** uses Strudel's own names (`lpf`, `room`, `delay`), shows every parameter, builds effects as an ordered chain of modifiers, and keeps the code open.

**Switching never changes your project.** It only changes what you see. You can sketch in Guided, switch to Pro to fine-tune one track, then switch back. Your default is set under **Settings › General**, and **I know Strudel — skip to Pro** on Guided start opens a blank project in Pro.

## The inspector, side by side

Here is the same bass track in both modes:

<div class="side-by-side">

![Guided inspector: Shape the sound with six knobs, and Try one suggestions](/screenshots/modes-guided-inspector.png)

![Pro inspector: Parameters with eight knobs, and the modifier list](/screenshots/modes-pro-inspector.png)

</div>

| | Guided | Pro |
| --- | --- | --- |
| Knob panel | **Shape the sound**: 6 knobs | **Parameters**: 8 knobs |
| Knob labels | Plain names, with the function underneath (**Brightness** `.lpf()`) | Strudel names, with the current value underneath (**LPF** `900 Hz`) |
| Knobs shown | Volume, Brightness, Space, Echo, Pan, Grit | gain, lpf, lpq, shape, room, roomsize, delay, pan |
| Below the knobs | **Try one**: suggestions you click on and off | **Modifiers · applied in order**: a chain you add to with **+** or by dropping a snippet from the library |

Both modes edit the same values. Turning **Brightness** in Guided and **LPF** in Pro writes the same `.lpf()`. Pro's extra knobs, **LPQ** (filter resonance) and **ROOMSIZE**, are still in your project after you switch back to Guided. Guided just doesn't show them.

::: details For Strudel users
A **Try one** suggestion is a modifier with a friendly name: clicking **Bouncier** adds `.swingBy(1/6, 4)` to the track's modifier chain, and you'll find it in Pro's modifier list. Each track's line is written as sound, then modifiers (in the order shown), then the knob parameters: `$: s("sawtooth").swingBy(1/6, 4).lpf(900)`.
:::

## The rest of the window in Pro

![Arrange in Pro mode with the mode switch, library tabs, edit tools and the code drawer called out](/screenshots/modes-pro-arrange.png)

<div class="callouts">

1. **Pro** is selected. The readout now shows the actual tempo call (`setcpm(31)`) in place of **BPM · TAP**.
2. **Sounds · Samples · Snippets**: the library's third tab holds **Snippets**, reusable bits of code, in place of Guided's **Starters**. Sounds are listed by their code (`bd`, `sd`, `hh`) first. The search box hints at <kbd>⌘</kbd> <kbd>K</kbd> for quick add, and <kbd>⏎</kbd> inserts the highlighted sound onto the selected track.
3. **Edit tools**: **Select** (<kbd>V</kbd>), **Draw** (<kbd>B</kbd>) and **Split** (<kbd>S</kbd>) for working on clips directly on the timeline. Only in Pro, only on Arrange. (Everywhere else, <kbd>S</kbd> is solo.)
4. **Code drawer**: open by default and scoped to **This section**, the part of the song under the playhead. Pro adds **Edit code**, which lets you edit the whole song as text. See [Code drawer](/screens/code).

</div>

## Everything that differs

| | Guided | Pro |
| --- | --- | --- |
| Code drawer | Folded to one line until you press **Show code** | Open, starting on **This section** |
| Editing the whole song as code | — | **Edit code** in the code drawer |
| Clip tools on Arrange | — | Select / Draw / Split (<kbd>V</kbd> <kbd>B</kbd> <kbd>S</kbd>) |
| Library's third tab | **Starters** | **Snippets** |
| Sound names in the library | Friendly name first (**Bass drum** `bd`) | Code first (**bd** Bass drum) |
| Tempo readout | **BPM · TAP** | `setcpm(…)` |
| Tip card | Shown until you hide it | Never shown |

The code drawer can be opened and closed in either mode with <kbd>⌘</kbd> <kbd>/</kbd>. Phyllo remembers your choice. Holding <kbd>⇧</kbd> while dropping a sound onto the Add track row layers it onto the selected track, in both modes, though only Pro spells the hint out.

## Which should I use?

- **New to Strudel, or to making music?** Start in Guided. Everything you do still writes real code, so you can open the drawer whenever you're curious.
- **Coming from strudel.cc or TidalCycles?** Pro gives you the names you already know and the full parameter set, and **Edit code** lets you type whenever that's quicker than clicking.
- **Teaching someone?** Guided's **Try one** buttons are a quick way to show what a modifier does. Click it on, click it off, and watch the line of code change.
