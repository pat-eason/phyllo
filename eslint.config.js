import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/target/**",
      "**/gen/**",
      "**/storybook-static/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/node_modules/**",
      "__inspiration/**",
      "__prompts/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "separate-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // React code: ui + app sources and stories.
  {
    files: ["src/apps/*/src/**/*.{ts,tsx}", "src/packages/ui/src/**/*.{ts,tsx}", "src/packages/ui/.storybook/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended, jsxA11y.flatConfigs.recommended],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Tooling files run in Node.
  {
    files: ["**/*.config.{js,ts,mjs}", "**/e2e/**/*.ts", "**/.storybook/main.ts"],
    languageOptions: { globals: globals.node },
  },

  // Hooks + context live next to the provider on purpose (design-system README §4).
  {
    files: ["src/packages/ui/src/theme/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // @phyllo/engine: the triple-slash reference to strudel-web.d.ts is intentional (see CLAUDE.md).
  {
    files: ["src/packages/engine/src/index.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },
);
