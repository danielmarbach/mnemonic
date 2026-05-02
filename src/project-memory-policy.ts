export type WriteScope = "project" | "global";
export const WRITE_SCOPES = ["project", "global"] as const satisfies readonly WriteScope[];
export type ProjectPolicyScope = WriteScope | "ask";
export const PROJECT_POLICY_SCOPES = ["project", "global", "ask"] as const satisfies readonly ProjectPolicyScope[];

export type ConsolidationMode = "supersedes" | "delete";
export const CONSOLIDATION_MODES = ["supersedes", "delete"] as const satisfies readonly ConsolidationMode[];

export type ProtectedBranchBehavior = "ask" | "block" | "allow";
export const PROTECTED_BRANCH_BEHAVIORS = ["ask", "block", "allow"] as const satisfies readonly ProtectedBranchBehavior[];
export const DEFAULT_PROTECTED_BRANCH_PATTERNS = ["main", "master", "release*"] as const;

export interface ProjectMemoryPolicy {
  projectId: string;
  projectName?: string;
  defaultScope: ProjectPolicyScope;
  /** Default consolidation mode for this project. "supersedes" preserves history, "delete" removes sources. */
  consolidationMode?: ConsolidationMode;
  /** Globbing patterns used to identify protected branches in local workflows. */
  protectedBranchPatterns?: string[];
  /** Behavior when current branch matches a protected branch pattern. */
  protectedBranchBehavior?: ProtectedBranchBehavior;
  updatedAt: string;
}

export function resolveConsolidationMode(policy: ProjectMemoryPolicy | undefined): ConsolidationMode {
  return policy?.consolidationMode ?? "supersedes";
}

export function resolveProtectedBranchBehavior(policy: ProjectMemoryPolicy | undefined): ProtectedBranchBehavior {
  if (!policy) {
    return "ask";
  }

  return policy.protectedBranchBehavior ?? "allow";
}

export function resolveProtectedBranchPatterns(policy: ProjectMemoryPolicy | undefined): string[] {
  const patterns = policy?.protectedBranchPatterns
    ?.map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
  if (!patterns || patterns.length === 0) {
    return [...DEFAULT_PROTECTED_BRANCH_PATTERNS];
  }

  return patterns;
}

export function branchMatchesProtectedPattern(branch: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return branch === pattern;
  }
  const parts = pattern.split("*");
  if (parts.length === 0) return false;
  if (parts.length > 11) return false;
  let remaining = branch;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? "";
    if (i === 0) {
      if (pattern.startsWith("*")) {
        if (part !== "" && !remaining.includes(part)) return false;
        if (part !== "") remaining = remaining.slice(remaining.indexOf(part) + part.length);
      } else {
        if (!remaining.startsWith(part)) return false;
        remaining = remaining.slice(part.length);
      }
    } else if (i === parts.length - 1 && !pattern.endsWith("*")) {
      if (part !== "" && !remaining.endsWith(part)) return false;
    } else {
      if (part === "") continue;
      const idx = remaining.indexOf(part);
      if (idx === -1) return false;
      remaining = remaining.slice(idx + part.length);
    }
  }
  return true;
}

export function isProtectedBranch(branch: string, patterns: string[]): boolean {
  return patterns.some((pattern) => branchMatchesProtectedPattern(branch, pattern));
}

export function resolveWriteScope(
  explicitScope: WriteScope | undefined,
  projectPolicyScope: ProjectPolicyScope | undefined,
  hasProjectContext: boolean,
  projectVaultExists: boolean = true,
): WriteScope | "ask" {
  if (explicitScope) {
    return explicitScope;
  }

  if (projectPolicyScope) {
    return projectPolicyScope;
  }

  // No policy and no existing project vault: project hasn't adopted mnemonic yet.
  // Ask rather than silently creating .mnemonic/.
  if (hasProjectContext && !projectVaultExists) {
    return "ask";
  }

  return hasProjectContext ? "project" : "global";
}
