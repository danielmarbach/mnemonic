#!/usr/bin/env node
/**
 * Pre-commit hook: enforces the same gates as CI locally.
 *
 * CI (see .github/workflows/ci.yml) runs, in order:
 *   1. npm run typecheck
 *   2. npm run lint
 *   3. npm run format:check
 *
 * This hook runs those same three checks on the working tree, preceded by
 * lint-staged so files you are committing are auto-fixed before the full
 * checks run. If any step fails, the commit is blocked.
 *
 * Commits that only touch files the gates never read are skipped entirely —
 * none of the checks can fail because of them, so running them is pure waste.
 * This covers markdown/docs (including the .mnemonic memory vault mnemonic
 * commits continuously), CI workflows, Dockerfile, Formula, ... The gates
 * only run when a staged file can change their outcome: a source file
 * (TS/JS) or a toolchain config (package.json, tsconfig.json, eslint or
 * prettier config, lockfiles).
 *
 * Escape hatches:
 *   - `git commit --no-verify`  – skip hooks for this commit
 *   - `SKIP_SIMPLE_GIT_HOOKS=1` – skip hooks for this environment
 */
import { spawnSync } from "node:child_process";
import { basename, extname } from "node:path";

// File types the gates can fail on: anything tsc compiles, eslint or prettier
// checks, or a config they read.
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const TOOLCHAIN_CONFIGS = [
  "package.json",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "yarn.lock",
  "tsconfig", // tsconfig.json, tsconfig.build.json, ...
  "eslint.config", // eslint.config.js/.mjs/.cjs
  ".prettierrc", // .prettierrc, .prettierrc.json, ...
  ".prettierignore",
];

function affectsGates(stagedPath) {
  if (SOURCE_EXTENSIONS.has(extname(stagedPath).toLowerCase())) return true;
  const name = basename(stagedPath);
  return TOOLCHAIN_CONFIGS.some((config) => name === config || name.startsWith(config));
}

// Staged paths relative to the repo root (git runs hooks from the top level).
function stagedPaths() {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "-z"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.split("\0").filter(Boolean);
}

const staged = stagedPaths();
if (staged !== null && staged.length > 0 && staged.every((path) => !affectsGates(path))) {
  process.stdout.write(
    "ℹ Staged changes only touch files outside the CI gates (markdown, docs, workflows) — " +
      "skipping typecheck, lint, and format:check.\n",
  );
  process.exit(0);
}

const steps = [
  { name: "lint-staged (auto-fix staged files)", command: "npx lint-staged" },
  { name: "typecheck", command: "npm run typecheck" },
  { name: "lint", command: "npm run lint" },
  { name: "format:check", command: "npm run format:check" },
];

for (const { name, command } of steps) {
  process.stdout.write(`\n▶ ${name}\n`);
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    const code = result.status ?? 1;
    process.stderr.write(
      `\n✖ "${name}" failed with exit code ${code}. Commit blocked.\n` +
        'Fix the issue and try again, or bypass with "git commit --no-verify" (not recommended).\n',
    );
    process.exit(code);
  }
}

process.stdout.write("\n✔ All pre-commit checks passed.\n");
