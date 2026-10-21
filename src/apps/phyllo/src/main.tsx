import "@phyllo/ui/tokens.css";
import "@phyllo/ui/base.css";
import "@phyllo/ui/fonts";
import { ThemeProvider } from "@phyllo/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider mode="system" accent="green">
      <App />
    </ThemeProvider>
  </StrictMode>,
);
