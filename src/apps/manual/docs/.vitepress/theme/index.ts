import mediumZoom from "medium-zoom";
import type { Zoom } from "medium-zoom";
import { useRoute } from "vitepress";
import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { nextTick, onMounted, watch } from "vue";
import "@fontsource/instrument-sans/latin-400.css";
import "@fontsource/instrument-sans/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "./custom.css";

export default {
  extends: DefaultTheme,
  setup() {
    // Screenshots are full app windows shrunk into the content column; click one to see it at full size.
    const route = useRoute();
    let zoom: Zoom | null = null;
    const attach = () => {
      zoom ??= mediumZoom({ background: "var(--vp-c-bg)", margin: 24 });
      zoom.detach();
      zoom.attach(".vp-doc img");
    };
    onMounted(attach);
    watch(
      () => route.path,
      () => nextTick(attach),
    );
  },
} satisfies Theme;
