import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

// Custom rules replacing ast-grep patterns
import noAwaitInPromiseAll from "./eslint-rules/no-await-in-promise-all.js";
import noBareTryCatch from "./eslint-rules/no-bare-try-catch.js";

const localPlugin = {
  rules: {
    "no-await-in-promise-all": noAwaitInPromiseAll,
    "no-bare-try-catch": noBareTryCatch,
  },
};

export default tseslint.config(
  // Base JS + TypeScript
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TypeScript source files
  {
    files: ["src/**/*.ts"],
    plugins: { local: localPlugin },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Built-in security rules (replace ast-grep no-eval-or-function-constructor)
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // Domain-specific rules that replace ast-grep equivalents
      "no-console": ["error", { allow: ["error"] }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/only-throw-error": "error",

      // Custom rules (replacing ast-grep patterns with no ESLint equivalent)
      "local/no-await-in-promise-all": "error",
      "local/no-bare-try-catch": "error",

      "no-restricted-syntax": [
        "error",
        // no-enum-declaration: prefer const objects + as const
        {
          selector: "TSEnumDeclaration",
          message:
            "Avoid enum declarations — use const object + 'as const' with derived type unions instead.",
        },

        // no-unsafe-typecast-after-parse: as Type after JSON.parse or .json()
        {
          selector:
            "TSAsExpression[left.callee.object.name='JSON'][left.callee.property.name='parse']",
          message:
            "Type assertion on JSON.parse result bypasses validation — use Zod schema instead.",
        },
      ],

      // Relax rules that conflict with Prettier's domain
      "@typescript-eslint/indent": "off",
      "@typescript-eslint/quotes": "off",
      "@typescript-eslint/semi": "off",
      "@typescript-eslint/comma-dangle": "off",
      "@typescript-eslint/member-delimiter-style": "off",
      "@typescript-eslint/brace-style": "off",
      "@typescript-eslint/linebreak-style": "off",

      // TypeScript-specific: keep type-aware checks
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // no-bare-try-catch exemptions — files where raw try/catch is expected
  {
    files: [
      "src/git.ts",
      "src/cli/**/*.ts",
      "src/index.ts",
      "src/startup.ts",
      "src/migration.ts",
      "src/embeddings.ts",
      "src/error-utils.ts",
    ],
    rules: {
      "local/no-bare-try-catch": "off",
    },
  },

  // Test files — relaxed rules
  {
    files: ["tests/**/*.ts", "src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
      "local/no-await-in-promise-all": "off",
      "local/no-bare-try-catch": "off",
      // Test imports are often used only for type side-effects or kept for future tests
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // CLI entry points — allow console for diagnostics
  {
    files: ["src/cli/**/*.ts", "src/startup.ts"],
    rules: {
      "no-console": "off",
    },
  },

  // Scripts and dogfood .mjs tests (not TypeScript, no TS parser)
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.js", "tests/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Prettier integration — MUST be last
  prettierConfig,
  {
    plugins: { prettier: prettierPlugin },
    rules: {
      "prettier/prettier": "error",
    },
  },

  // Global ignores
  {
    ignores: ["build/", "node_modules/", "dist/", ".mnemonic/"],
  },
);
