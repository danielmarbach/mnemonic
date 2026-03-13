import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const execFileAsync = promisify(execFile);

export type ProjectSource = "git-remote" | "git-remote-override" | "git-folder" | "folder";

export interface ProjectInfo {
  /** Stable identifier: normalized git remote URL or folder name */
  id: string;
  /** Human-readable name (last path segment of remote, or folder name) */
  name: string;
  /** How the project was detected */
  source: ProjectSource;
  /** Which remote produced this identity when remote-based detection is used. */
  remoteName?: string;
}

export interface ProjectIdentityOverride {
  remoteName: string;
  updatedAt: string;
}

export interface ProjectDetectionOptions {
  getProjectIdentityOverride?: (projectId: string) => Promise<ProjectIdentityOverride | undefined>;
}

export interface ProjectIdentityResolution {
  project: ProjectInfo;
  defaultProject: ProjectInfo;
  identityOverride?: ProjectIdentityOverride;
  identityOverrideApplied: boolean;
}

/**
 * Resolve a working directory path to a stable project identifier.
 * Uses the git remote URL when available so the same project is recognized
 * across machines regardless of local clone path.
 */
export async function detectProject(cwd: string, options: ProjectDetectionOptions = {}): Promise<ProjectInfo | null> {
  const resolved = await resolveProjectIdentity(cwd, options);
  return resolved?.project ?? null;
}

export async function resolveProjectIdentity(
  cwd: string,
  options: ProjectDetectionOptions = {},
): Promise<ProjectIdentityResolution | null> {
  if (!cwd) return null;

  const defaultProject = await detectDefaultProject(cwd);
  if (!defaultProject) return null;

  if (defaultProject.source !== "git-remote") {
    return {
      project: defaultProject,
      defaultProject,
      identityOverrideApplied: false,
    };
  }

  const identityOverride = await options.getProjectIdentityOverride?.(defaultProject.id);
  if (!identityOverride) {
    return {
      project: defaultProject,
      defaultProject,
      identityOverrideApplied: false,
    };
  }

  const overrideRemote = await getGitRemoteUrl(cwd, identityOverride.remoteName);
  if (!overrideRemote) {
    return {
      project: defaultProject,
      defaultProject,
      identityOverride,
      identityOverrideApplied: false,
    };
  }

  return {
    project: {
      id: normalizeRemote(overrideRemote),
      name: extractRepoName(overrideRemote),
      source: "git-remote-override",
      remoteName: identityOverride.remoteName,
    },
    defaultProject,
    identityOverride,
    identityOverrideApplied: true,
  };
}

export async function getCurrentGitBranch(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd });
    const branch = stdout.trim();
    return branch.length > 0 ? branch : undefined;
  } catch {
    return undefined;
  }
}

async function detectDefaultProject(cwd: string): Promise<ProjectInfo | null> {
  if (!cwd) return null;

  // Resolve the effective git root, walking up through any submodule boundaries
  // so that project identity is always based on the top-level superproject.
  const topLevelRoot = await findTopLevelGitRoot(cwd);

  // Try git remote first (using the top-level root when available)
  const remoteCwd = topLevelRoot ?? cwd;
  const remote = await getGitRemoteUrl(remoteCwd, "origin");
  if (remote) {
    const id = normalizeRemote(remote);
    const name = extractRepoName(remote);
    return { id, name, source: "git-remote", remoteName: "origin" };
  }

  // Try git root folder name (repo without remote)
  if (topLevelRoot) {
    const name = path.basename(topLevelRoot);
    return { id: slugify(name), name, source: "git-folder" };
  }

  // Fallback: just use the directory name
  const name = path.basename(path.resolve(cwd));
  if (name) {
    return { id: slugify(name), name, source: "folder" };
  }

  return null;
}

/**
 * Resolve the top-level git root for a working directory, walking up through
 * any git submodule boundaries. Returns null when the directory is not inside
 * a git repository at all.
 */
async function findTopLevelGitRoot(cwd: string, visited: Set<string> = new Set()): Promise<string | null> {
  try {
    const { stdout: rootOut } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd });
    const root = rootOut.trim();
    if (!root) return null;

    // Guard against infinite recursion in pathological submodule configurations.
    if (visited.has(root)) return root;
    visited.add(root);

    // Check if we are inside a git submodule and walk up to the superproject root.
    try {
      const { stdout: superOut } = await execFileAsync(
        "git",
        ["rev-parse", "--show-superproject-working-tree"],
        { cwd },
      );
      const superproject = superOut.trim();
      if (superproject) {
        return findTopLevelGitRoot(superproject, visited);
      }
    } catch {
      // Not inside a submodule or git version does not support the flag; use current root.
    }

    return root;
  } catch {
    return null;
  }
}

async function getGitRemoteUrl(cwd: string, remoteName: string): Promise<string | null> {
  try {
    const { stdout: remoteOut } = await execFileAsync(
      "git",
      ["remote", "get-url", remoteName],
      { cwd }
    );
    const remote = remoteOut.trim();
    return remote || null;
  } catch {
    return null;
  }
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
