// ESLint for the application and Slides packages. A Slides
// package never imports Kasten, so it can become a project of its own.
// scripts/check-boundaries.mjs checks the same thing without ESLint.

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const KASTEN = ["kasten-*", "@kasten/*", "**/app/src/**", "**/crates/kasten-*/**"];

export default defineConfig(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/pkg/**", "**/generated/**"] },
  {
    files: ["packages/**/*.{ts,tsx}", "app/src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // `const { key: _old, ...rest } = object` is how a key is left out.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true, argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: KASTEN, message: "Slides packages never import Kasten. Ask the host interface instead." }] },
      ],
    },
  },
  {
    files: ["packages/slides-react/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ClassDeclaration[superClass.name=/Component$/], ClassDeclaration[superClass.property.name=/Component$/]",
          message: "React function components only.",
        },
      ],
    },
  },
);
