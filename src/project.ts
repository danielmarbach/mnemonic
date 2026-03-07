import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export interface ProjectInfo {
  /** Stable identifier: normalized git remote URL or folder name */
  id: string;
  /** Human-readable name (last path segment of remote, or folder name) */
  name: string;
  /** How the project was detected */
  source: "git-remote" | "git-folder" | "folder";
}

/**
 * Resolve a working directory path to a stable project identifier.
 * Uses the git remote URL when available so the same project is recognized
 * across machines regardless of local clone path.
 */
export async function detectProject(cwd: string): Promise<ProjectInfo | null> {
  if (!cwd) return null;

  // Try git remote first
  try {
    const { stdout: remoteOut } = await execFileAsync(
      "git",
      ["remote", "get-url", "origin"],
      { cwd }
    );
    const remote = remoteOut.trim();
    if (remote) {
      const id = normalizeRemote(remote);
      const name = extractRepoName(remote);
      return { id, name, source: "git-remote" };
    }
  } catch {
    // not a git repo with a remote — fall through
  }

  // Try git root folder name (repo without remote)
  try {
    const { stdout: rootOut } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd }
    );
    const root = rootOut.trim();
    if (root) {
      const name = path.basename(root);
      return { id: slugify(name), name, source: "git-folder" };
    }
  } catch {
    // not a git repo at all — fall through
  }

  // Fallback: just use the directory name
  const name = path.basename(path.resolve(cwd));
  if (name) {
    return { id: slugify(name), name, source: "folder" };
  }

  return null;
}

/**
 * Normalize a git remote URL to a stable lowercase identifier.
 * Strips protocol, auth, .git suffix, and converts separators to dashes.
 *
 * Examples:
 *   git@github.com:acme/myapp.git  → github-com-acme-myapp
 *   https://github.com/acme/myapp  → github-com-acme-myapp
 */
function normalizeRemote(remote: string): string {
  let s = remote.trim().toLowerCase();
  // SSH: git@github.com:user/repo.git
  s = s.replace(/^git@/, "").replace(/:/, "/");
  // Strip protocol
  s = s.replace(/^https?:\/\//, "").replace(/^ssh:\/\//, "");
  // Strip auth (user:pass@)
  s = s.replace(/^[^@]*@/, "");
  // Strip .git
  s = s.replace(/\.git$/, "");
  // Normalise separators
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s;
}

function extractRepoName(remote: string): string {
  // Get the last path segment before .git
  const match = remote.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? path.basename(remote);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
