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
 * Escape hatches:
 *   - `git commit --no-verify`  – skip hooks for this commit
 *   - `SKIP_SIMPLE_GIT_HOOKS=1` – skip hooks for this environment
 */
import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'lint-staged (auto-fix staged files)', command: 'npx lint-staged' },
  { name: 'typecheck', command: 'npm run typecheck' },
  { name: 'lint', command: 'npm run lint' },
  { name: 'format:check', command: 'npm run format:check' },
];

for (const { name, command } of steps) {
  process.stdout.write(`\n▶ ${name}\n`);
  const result = spawnSync(command, {
    stdio: 'inherit',
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

process.stdout.write('\n✔ All pre-commit checks passed.\n');
