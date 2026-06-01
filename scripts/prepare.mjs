import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const gitDirPath = fileURLToPath(new URL('../.git', import.meta.url));
const simpleGitHooksCliPath = fileURLToPath(new URL('../node_modules/simple-git-hooks/cli.js', import.meta.url));

if (!existsSync(gitDirPath) || !existsSync(simpleGitHooksCliPath)) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [simpleGitHooksCliPath], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 0);
