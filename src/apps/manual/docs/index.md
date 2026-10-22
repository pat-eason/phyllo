---
layout: home

hero:
  name: Phyllo
  text: Make music with Strudel, the way a DAW does it.
  tagline: Arrange tracks, turn knobs, program steps and mix, while Phyllo writes real Strudel code for every move. This manual covers it all, whether you've never written a line of code or you live-code every weekend.
  image:
    src: /logo.svg
    alt: The Phyllo mark, forty dots in a sunflower spiral
  actions:
    - theme: brand
      text: Make your first groove
      link: /guide/first-groove
    - theme: alt
      text: I already know Strudel
      link: /guide/how-code-works
    - theme: alt
      text: Install
      link: /guide/install

features:
  - title: New to all of this?
    details: Start with Your first groove. It walks you from an empty window to a saved, playing song in about fifteen minutes, then Strudel in ten minutes explains what the code means.
    link: /guide/first-groove
    linkText: Start the tutorial
  - title: Already live-coding?
    details: Every track is a $ line and every clip is an arrange() entry. How Phyllo writes code covers the exact mapping, what parses back, and what Phyllo leaves alone.
    link: /guide/how-code-works
    linkText: See the mapping
  - title: Looking something up?
    details: Each screen has its own page with numbered screenshots. Keyboard shortcuts, the mini-notation cheat sheet and file locations are in the Reference section.
    link: /reference/shortcuts
    linkText: Open the reference
---

## One window, two depths

Phyllo has two interface depths. **Guided** uses plain-language labels such as *Brightness* and *Space*, keeps the code tucked away and coaches you with tips. **Pro** shows Strudel's own names (`lpf`, `room`), adds a modifier chain, edit tools and the code drawer. Both show the same project, and you can switch at any time with <kbd>⇧</kbd> <kbd>⌘</kbd> <kbd>G</kbd>.

![Phyllo's Arrange view in Guided mode with the light theme: sound library on the left, four coloured tracks on the timeline, and the track inspector with six labelled knobs on the right](/screenshots/home-guided.png)

*Guided, light theme: plain-language knobs and the code tucked into a bar at the bottom.*

![The same groove in Pro mode with the dark theme: edit tools above the timeline, eight knobs named after Strudel functions, and the code drawer open under the timeline](/screenshots/home-pro.png)

*Pro, dark theme: Strudel parameter names, a modifier chain and the generated code in the drawer.*

## How this manual is organised

- **Getting started** gets Phyllo running and gets sound out of it.
- **Concepts** explains Strudel itself, the two interface depths, and how Phyllo turns tracks into code.
- **Working in Phyllo** has one page per screen or panel, each with numbered screenshots and a matching legend.
- **Reference** collects shortcuts, mini-notation, file locations and fixes for common problems.

::: tip Reading the screenshots
Magenta numbers on a screenshot match the numbered list right under it. The rest of the window is dimmed so you can see where to look.
:::
