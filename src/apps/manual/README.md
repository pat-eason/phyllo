# Phyllo Manual

The user manual for Phyllo, built with [VitePress](https://vitepress.dev) into a static site. It's written for two readers at once: people who have never touched Strudel, and live coders who already know it.

```bash
pnpm --filter phyllo-manual dev          # http://localhost:5180, hot reload
pnpm --filter phyllo-manual build        # static site in docs/.vitepress/dist
pnpm --filter phyllo-manual preview      # serve the build locally
pnpm --filter phyllo-manual screenshots  # regenerate every screenshot from the live app
```

## Screenshots

Screenshots are generated, never hand-edited. `capture/*.spec.ts` drive the Phyllo frontend in Chromium (the in-browser `NativeApi`, started from `src/apps/phyllo` on port 1450 or `PHYLLO_MANUAL_PORT`), seed a small groove library, draw numbered callouts and write `docs/public/screenshots/<name>.png` at 2×. First run: `pnpm --filter phyllo-manual exec playwright install chromium`.

Run one area with `pnpm --filter phyllo-manual screenshots capture/mixer.spec.ts`. Re-run the specs whenever the UI changes and commit the new PNGs with the change.

Helpers live in `capture/harness.ts`:

- `launch(page, options)` seeds settings and the library (`LIBRARY`) and opens "Night Bus" on Arrange. Options pick theme, accent, Guided/Pro, tips and the code drawer; `open: null` lands on the Library (or Guided start with `library: false`).
- `annotate(page, callouts)` outlines each locator with a numbered magenta badge and dims the rest. `badge` moves the number (`tl`, `tr`, `left`, `bottom`…); `label` overrides it.
- `shot(page, name, { clip })` saves the window, or a crop around one element.

## Writing pages

- Number callouts in the order a reader's eye or hands should move, then put a matching legend right under the image:

  ```md
  ![Arrange view with the transport, timeline and inspector called out](/screenshots/tour-window.png)

  <div class="callouts">

  1. **Transport** — play, stop, loop.
  2. …

  </div>
  ```

  The legend's numbers render as the same magenta badges as the screenshot.
- Put two images to compare inside `<div class="side-by-side">`.
- An italic line right after an image renders as its caption. Wrap narrow crops in `<div class="crop">` (blank lines inside, like the callouts) so they keep their natural size.
- Explain each feature twice when it matters: what it does in plain words first, then the Strudel it writes (in a `::: details For Strudel users` block or a code sample) for readers who know the language.
- Name controls exactly as the app labels them, and use `<kbd>` for keys (`<kbd>⌘</kbd> <kbd>K</kbd>`). macOS keys first; Ctrl replaces ⌘ elsewhere.
- `capture/screenshots.test.ts` (part of `pnpm test`) fails on a missing or unused screenshot, so add the image and the page that shows it together.

## Deploying

`.github/workflows/manual.yml` builds the site and publishes it to GitHub Pages on every push to `main` that touches `src/apps/manual`. It sets `PHYLLO_MANUAL_BASE` to `/<repo>/`; locally the site is served from `/`. Turn Pages on once under the repository's **Settings › Pages › Source: GitHub Actions**.
