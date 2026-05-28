import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default tseslint.config(
  // Base JS + TypeScript
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // TypeScript source files
  {
    files: ["src/**/*.ts"],
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

        // no-bare-try-catch: use attempt() for fail-soft operations
        {
          selector:
            "TryStatement[handler.body.body.length=0]",
          message:
            "Empty catch block — every error path must be traceable via debugLog or attempt().",
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

  // Test files — relaxed rules
  {
    files: ["tests/**/*.ts", "src/__tests__/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-console": "off",
      // Test imports are often used only for type side-effects or kept for future tests
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // CLI entry points — allow console.error for diagnostics
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
