import process from "node:process";
import { defineConfig } from "vitepress";

// PHYLLO_MANUAL_BASE is the path the site is served from: "/" locally, "/<repo>/" on GitHub Pages (set by the
// manual workflow).
const base = process.env["PHYLLO_MANUAL_BASE"] ?? "/";

export default defineConfig({
  base,
  title: "Phyllo Manual",
  description: "How to make music in Phyllo, the desktop DAW for Strudel: for first-timers and seasoned live coders.",
  lang: "en-GB",
  cleanUrls: true,
  lastUpdated: false,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: `${base}logo.svg` }]],
  markdown: {
    config(md) {
      // Callout legends draw their numbers with a CSS counter, which ignores `<ol start>`. A legend that continues
      // an earlier one (`9. …`) carries its offset as a custom property instead.
      const render = md.renderer.rules.ordered_list_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
      md.renderer.rules.ordered_list_open = (tokens, idx, options, env, self) => {
        const start = Number(tokens[idx]?.attrGet("start") ?? 1);
        if (start > 1) tokens[idx]?.attrSet("style", `--callout-start: ${start - 1}`);
        return render(tokens, idx, options, env, self);
      };
    },
  },
  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "Phyllo Manual",
    search: { provider: "local" },
    outline: { level: [2, 3] },
    nav: [
      { text: "Start here", link: "/guide/first-groove" },
      { text: "Screens", link: "/screens/arrange" },
      { text: "Reference", link: "/reference/shortcuts" },
      { text: "Strudel", link: "https://strudel.cc/learn/" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Install and launch", link: "/guide/install" },
          { text: "Your first groove", link: "/guide/first-groove" },
          { text: "A tour of the window", link: "/guide/tour" },
        ],
      },
      {
        text: "Concepts",
        items: [
          { text: "Strudel in ten minutes", link: "/guide/strudel-basics" },
          { text: "Guided and Pro", link: "/guide/guided-and-pro" },
          { text: "How Phyllo writes code", link: "/guide/how-code-works" },
        ],
      },
      {
        text: "Working in Phyllo",
        items: [
          { text: "Arrange", link: "/screens/arrange" },
          { text: "Sound library panel", link: "/screens/sound-library" },
          { text: "Track inspector", link: "/screens/inspector" },
          { text: "Code drawer", link: "/screens/code" },
          { text: "Pattern editor", link: "/screens/pattern-editor" },
          { text: "Mixer", link: "/screens/mixer" },
          { text: "Groove library", link: "/screens/groove-library" },
          { text: "Export", link: "/screens/export" },
          { text: "Settings", link: "/screens/settings" },
          { text: "MIDI, OSC and sample folders", link: "/screens/devices" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Keyboard shortcuts", link: "/reference/shortcuts" },
          { text: "Mini-notation cheat sheet", link: "/reference/mini-notation" },
          { text: "Files and storage", link: "/reference/files" },
          { text: "Troubleshooting", link: "/reference/troubleshooting" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/pat-eason/phyllo" }],
    footer: {
      message: "Phyllo makes its sound with Strudel (AGPL-3.0-or-later).",
    },
  },
});
