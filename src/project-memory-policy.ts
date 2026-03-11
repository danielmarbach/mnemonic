export type WriteScope = "project" | "global";
export const WRITE_SCOPES = ["project", "global"] as const satisfies readonly WriteScope[];
export type ProjectPolicyScope = WriteScope | "ask";
export const PROJECT_POLICY_SCOPES = ["project", "global", "ask"] as const satisfies readonly ProjectPolicyScope[];

export type ConsolidationMode = "supersedes" | "delete";
export const CONSOLIDATION_MODES = ["supersedes", "delete"] as const satisfies readonly ConsolidationMode[];

export interface ProjectMemoryPolicy {
  projectId: string;
  projectName?: string;
  defaultScope: ProjectPolicyScope;
  /** Default consolidation mode for this project. "supersedes" preserves history, "delete" removes sources. */
  consolidationMode?: ConsolidationMode;
  updatedAt: string;
}

export function resolveConsolidationMode(policy: ProjectMemoryPolicy | undefined): ConsolidationMode {
  return policy?.consolidationMode ?? "supersedes";
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
