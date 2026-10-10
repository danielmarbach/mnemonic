import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { ProjectId } from "./brands.js";
import { projectId } from "./brands.js";
import { attempt } from "./error-utils.js";

const execFileAsync = promisify(execFile);

export type ProjectSource = "git-remote" | "git-remote-override" | "git-folder" | "folder";

export interface ProjectInfo {
  /** Stable identifier: normalized git remote URL or folder name */
  id: ProjectId;
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
export async function detectProject(
  cwd: string,
  options: ProjectDetectionOptions = {},
): Promise<ProjectInfo | null> {
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
      id: projectId(normalizeRemoteUrl(overrideRemote)),
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
  const result = await attempt("project:branch", () =>
    execFileAsync("git", ["branch", "--show-current"], { cwd }),
  );
  if (!result.ok) return undefined;
  const branch = result.value.stdout.trim();
  return branch.length > 0 ? branch : undefined;
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
    const id = projectId(normalizeRemoteUrl(remote));
    const name = extractRepoName(remote);
    return { id, name, source: "git-remote", remoteName: "origin" };
  }

  // Try git root folder name (repo without remote)
  if (topLevelRoot) {
    const name = path.basename(topLevelRoot);
    return { id: projectId(slugify(name)), name, source: "git-folder" };
  }

  // Fallback: just use the directory name
  const name = path.basename(path.resolve(cwd));
  if (name) {
    return { id: projectId(slugify(name)), name, source: "folder" };
  }

  return null;
}

/**
 * Resolve the top-level git root for a working directory, walking up through
 * any git submodule boundaries. Returns null when the directory is not inside
 * a git repository at all.
 */
async function findTopLevelGitRoot(
  cwd: string,
  visited: Set<string> = new Set(),
): Promise<string | null> {
  const rootResult = await attempt("project:git-root", () =>
    execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd }),
  );
  if (!rootResult.ok) return null;
  const root = rootResult.value.stdout.trim();
  if (!root) return null;

  if (visited.has(root)) return root;
  visited.add(root);

  const superResult = await attempt("project:superproject", () =>
    execFileAsync("git", ["rev-parse", "--show-superproject-working-tree"], { cwd }),
  );
  if (superResult.ok) {
    const superproject = superResult.value.stdout.trim();
    if (superproject) {
      return findTopLevelGitRoot(superproject, visited);
    }
  }

  return root;
}

async function getGitRemoteUrl(cwd: string, remoteName: string): Promise<string | null> {
  const result = await attempt("project:remote-url", () =>
    execFileAsync("git", ["remote", "get-url", remoteName], { cwd }),
  );
  if (!result.ok) return null;
  const remote = result.value.stdout.trim();
  return remote || null;
}

/**
 * Normalize a git remote URL to a stable lowercase identifier.
 * Strips scheme, auth, port, .git suffix, and converts separators to dashes,
 * so every remote form of one repository yields the same id.
 *
 * Examples:
 *   git@github.com:acme/myapp.git  → github-com-acme-myapp
 *   https://github.com/acme/myapp  → github-com-acme-myapp
 */
export function normalizeRemoteUrl(remote: string): string {
  let s = remote.trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^@/]*@/, "");
  // host:port/path drops the port; otherwise the first colon is scp-like syntax (host:path)
  s = /^[^/:]+:\d+\//.test(s) ? s.replace(/^([^/:]+):\d+\//, "$1/") : s.replace(/:/, "/");
  s = s.replace(/\.git$/, "");
  return slugify(s);
}

const LEGACY_PROJECT_ID_PREFIXES = ["https-", "http-", "ssh-", "git-ssh-"] as const;

/**
 * Map project ids derived from the pre-1.0 normalizer (which kept the scheme
 * as a prefix) to the canonical id. Other ids are returned unchanged. A bare
 * `git-` prefix is deliberately not stripped: it is a legitimate host prefix
 * (`git.example.com`), and only rare `git://` remotes ever produced it.
 */
export function canonicalProjectId(id: string): string {
  for (const prefix of LEGACY_PROJECT_ID_PREFIXES) {
    if (id.startsWith(prefix) && id.length > prefix.length) {
      return id.slice(prefix.length);
    }
  }
  return id;
}

/**
 * Pick the surviving entry when a legacy key and its canonical key collide:
 * the newer `updatedAt` wins when both have one, otherwise the entry that was
 * already stored under the canonical key.
 */
export function pickCollidingEntry<T extends { updatedAt?: unknown }>(
  first: { value: T; wasLegacyKey: boolean },
  second: { value: T; wasLegacyKey: boolean },
): { value: T; wasLegacyKey: boolean } {
  const firstTime =
    typeof first.value.updatedAt === "string" ? Date.parse(first.value.updatedAt) : NaN;
  const secondTime =
    typeof second.value.updatedAt === "string" ? Date.parse(second.value.updatedAt) : NaN;
  if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime) && firstTime !== secondTime) {
    return secondTime > firstTime ? second : first;
  }
  return first.wasLegacyKey && !second.wasLegacyKey ? second : first;
}

function extractRepoName(remote: string): string {
  // Get the last path segment before .git
  const match = remote.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? path.basename(remote);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
