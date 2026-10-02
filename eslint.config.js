import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Disabled rather than fixed: shadcn/ui's own generated primitives
      // (src/components/ui/**) violate this by design (re-exporting a
      // cva() variants function alongside the component), and this
      // codebase's own established pattern of colocating a dialog with
      // its small display helpers (UserDetailDialog.tsx, AuditEntryDialog.tsx,
      // ReviewDetailDialog.tsx) does too. It's a dev-experience/HMR-
      // granularity nicety, not a correctness rule — restructuring either
      // category into extra files to satisfy it would be churn with no
      // behavioral benefit.
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
