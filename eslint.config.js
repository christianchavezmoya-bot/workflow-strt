// Flat ESLint config (ESLint 9 + typescript-eslint).
// Pragmatic starting point for a codebase that had no linter: type-aware rules
// off (too slow / too noisy on ~60 services at first), the highest-signal
// correctness + hooks rules on. Tighten over time as the backlog is burned down.
//
// Error-level findings are at ZERO and `npm run lint` is blocking in CI. Warnings
// are a deliberate backlog and do not fail the build. When promoting a rule from
// warn to error, clear its existing findings in the same PR.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "tempbuild/**",
      "node_modules/**",
      "android/**",
      "ios/**",
      "server/**",
      "docs/**",
      "**/*.config.{js,ts}",
      "scripts/**",
      ".claude/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      // React hooks — this app leans hard on useEffect / useSyncEngine.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Start lenient so the first run isn't a wall of red; ratchet up later.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Empty catch blocks are idiomatic in this offline-first code (errors are
      // deliberately swallowed on the sync/cache paths) — warn, don't error.
      "no-empty": ["warn", { allowEmptyCatch: true }],
      // Keep the genuinely bug-catching rules as ERRORS (these are the ratchet floor):
      // no-constant-binary-expression, no-case-declarations, prefer-const, no-useless-escape.
    },
  },
  // Turn off formatting rules that would fight Prettier.
  prettier,
);
