import path from "path";
import os from "os";

type PathEnv = {
  HOME?: string;
  USERPROFILE?: string;
};

function homeDirectory(env: PathEnv = process.env): string | undefined {
  return env.HOME ?? env.USERPROFILE ?? os.homedir();
}

export function expandHomePath(rawPath: string, env: PathEnv = process.env): string {
  const home = homeDirectory(env);
  if (!home) {
    return rawPath;
  }

  if (rawPath === "~") {
    return home;
  }

  if (rawPath.startsWith("~/") || rawPath.startsWith("~\\")) {
    return path.join(home, rawPath.slice(2));
  }

  return rawPath;
}

export function resolveUserPath(rawPath: string, env: PathEnv = process.env): string {
  return path.resolve(expandHomePath(rawPath, env));
}

export function defaultVaultPath(env: PathEnv = process.env): string {
  return path.join(homeDirectory(env) ?? "~", "mnemonic-vault");
}

export function defaultClaudeHome(env: PathEnv = process.env): string {
  return path.join(homeDirectory(env) ?? "~", ".claude");
}
