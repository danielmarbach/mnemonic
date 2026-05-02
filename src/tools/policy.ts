import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { CONSOLIDATION_MODES, PROTECTED_BRANCH_BEHAVIORS, PROJECT_POLICY_SCOPES, type ProjectMemoryPolicy } from "../project-memory-policy.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import { pushAfterMutation as pushAfterMutationFromModule, buildMutationRetryContract, formatRetrySummary } from "../helpers/persistence.js";
import { PolicyResultSchema, type PolicyResult } from "../structured-content.js";

export function registerSetProjectMemoryPolicyTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "set_project_memory_policy",
    {
      title: "Set Project Memory Policy",
      description:
        "Set the default write scope and memory behavior for a project.\n\n" +
        "Use this when:\n" +
        "- A project should default to project or global storage\n" +
        "- Protected-branch handling or consolidation behavior should be standardized\n\n" +
        "Do not use this when:\n" +
        "- You only need a one-off write location for a single `remember` call\n\n" +
        "Returns:\n" +
        "- The saved project policy and effective values\n\n" +
        "Side effects: writes config, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `get_project_memory_policy` to verify the saved policy.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
        defaultScope: z.enum(PROJECT_POLICY_SCOPES).optional().describe(
          "Default storage: 'project' = shared project vault, 'global' = private main vault, 'ask' = prompt each time"
        ),
        consolidationMode: z.enum(CONSOLIDATION_MODES).optional().describe(
          "Default consolidation mode: 'supersedes' preserves history (default), 'delete' removes sources immediately"
        ),
        protectedBranchBehavior: z.enum(PROTECTED_BRANCH_BEHAVIORS).optional().describe(
          "Behavior for protected-branch matches during project-vault commits by mutating tools: 'ask', 'block', or 'allow'"
        ),
        protectedBranchPatterns: z.array(z.string()).optional().describe(
          "Protected branch glob patterns. Defaults to [\"main\", \"master\", \"release*\"] when not set"
        ),
      }),
      outputSchema: PolicyResultSchema,
    },
    async ({ cwd, defaultScope, consolidationMode, protectedBranchBehavior, protectedBranchPatterns }) => {
      const project = await resolveProjectFromModule(ctx, cwd);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      if (
        defaultScope === undefined
        && consolidationMode === undefined
        && protectedBranchBehavior === undefined
        && protectedBranchPatterns === undefined
      ) {
        return {
          content: [{
            type: "text",
            text: "No policy fields provided. Set at least one of: defaultScope, consolidationMode, protectedBranchBehavior, protectedBranchPatterns.",
          }],
          isError: true,
        };
      }

      const existing = await ctx.configStore.getProjectPolicy(project.id);
      const effectiveDefaultScope = defaultScope ?? existing?.defaultScope ?? "project";
      const effectiveConsolidationMode = consolidationMode ?? existing?.consolidationMode;
      const effectiveProtectedBranchBehavior = protectedBranchBehavior ?? existing?.protectedBranchBehavior;
      const effectiveProtectedBranchPatterns = protectedBranchPatterns
        ? protectedBranchPatterns.map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0)
        : existing?.protectedBranchPatterns;

      const now = new Date().toISOString();
      const policy: ProjectMemoryPolicy = {
        projectId: project.id,
        projectName: project.name,
        defaultScope: effectiveDefaultScope,
        consolidationMode: effectiveConsolidationMode,
        protectedBranchBehavior: effectiveProtectedBranchBehavior,
        protectedBranchPatterns: effectiveProtectedBranchPatterns,
        updatedAt: now,
      };
      await ctx.configStore.setProjectPolicy(policy);

      const modeStr = effectiveConsolidationMode ? `, consolidationMode=${effectiveConsolidationMode}` : "";
      const branchBehaviorStr = effectiveProtectedBranchBehavior
        ? `, protectedBranchBehavior=${effectiveProtectedBranchBehavior}`
        : "";
      const branchPatternsStr = effectiveProtectedBranchPatterns && effectiveProtectedBranchPatterns.length > 0
        ? `, protectedBranchPatterns=${effectiveProtectedBranchPatterns.join("|")}`
        : "";
      const commitBody = formatCommitBody({
        projectName: project.name,
        description:
          `Default scope: ${effectiveDefaultScope}` +
          `${effectiveConsolidationMode ? `\nConsolidation mode: ${effectiveConsolidationMode}` : ""}` +
          `${effectiveProtectedBranchBehavior ? `\nProtected branch behavior: ${effectiveProtectedBranchBehavior}` : ""}` +
          `${effectiveProtectedBranchPatterns && effectiveProtectedBranchPatterns.length > 0
            ? `\nProtected branch patterns: ${effectiveProtectedBranchPatterns.join(", ")}`
            : ""
          }`,
      });
      const commitMessage = `policy: ${project.name} default scope ${effectiveDefaultScope}`;
      const commitFiles = ["config.json"];
      const commitStatus = await ctx.vaultManager.main.git.commitWithStatus(commitMessage, commitFiles, commitBody);
      const pushStatus = commitStatus.status === "committed"
        ? await pushAfterMutationFromModule(ctx, ctx.vaultManager.main)
        : { status: "skipped" as const, reason: "commit-failed" as const };
      const retry = buildMutationRetryContract({
        commit: commitStatus,
        commitMessage,
        commitBody,
        files: commitFiles,
        cwd,
        vault: ctx.vaultManager.main,
        mutationApplied: true,
      });

      const structuredContent: PolicyResult = {
        action: "policy_set",
        project: { id: project.id, name: project.name },
        defaultScope: effectiveDefaultScope,
        consolidationMode: effectiveConsolidationMode,
        protectedBranchBehavior: effectiveProtectedBranchBehavior,
        protectedBranchPatterns: effectiveProtectedBranchPatterns,
        updatedAt: now,
        retry,
      };

      return {
        content: [{
          type: "text",
          text:
            `Project memory policy set for ${project.name}: defaultScope=${effectiveDefaultScope}` +
            `${modeStr}${branchBehaviorStr}${branchPatternsStr}` +
            `${commitStatus.status === "failed"
              ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
              : ""
            }`,
        }],
        structuredContent,
      };
    }
  );
}

export function registerGetProjectMemoryPolicyTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_project_memory_policy",
    {
      title: "Get Project Memory Policy",
      description:
        "Show the saved memory policy for a project.\n\n" +
        "Use this when:\n" +
        "- You want to confirm the default write scope before storing memory\n" +
        "- You are debugging why notes land in an unexpected vault\n" +
        "- You need to inspect protected-branch or consolidation defaults\n\n" +
        "Do not use this when:\n" +
        "- You want to change the policy; use `set_project_memory_policy`\n\n" +
        "Returns:\n" +
        "- Saved policy values or an explanation of the fallback behavior\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Call `remember` with explicit `scope` for a one-off override, or `set_project_memory_policy` to change defaults.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
      }),
      outputSchema: PolicyResultSchema,
    },
    async ({ cwd }) => {
      const project = await resolveProjectFromModule(ctx, cwd);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      const policy = await ctx.configStore.getProjectPolicy(project.id);
      if (!policy) {
        const structuredContent: PolicyResult = {
          action: "policy_shown",
          project: { id: project.id, name: project.name },
        };
        return {
          content: [{
            type: "text",
            text: `No project memory policy set for ${project.name}. Default write behavior remains scope=project when cwd is present.`,
          }],
          structuredContent,
        };
      }

      const structuredContent: PolicyResult = {
        action: "policy_shown",
        project: { id: project.id, name: project.name },
        defaultScope: policy.defaultScope,
        consolidationMode: policy.consolidationMode,
        protectedBranchBehavior: policy.protectedBranchBehavior,
        protectedBranchPatterns: policy.protectedBranchPatterns,
        updatedAt: policy.updatedAt,
      };

      const details = [
        `defaultScope=${policy.defaultScope}`,
        policy.consolidationMode ? `consolidationMode=${policy.consolidationMode}` : undefined,
        policy.protectedBranchBehavior ? `protectedBranchBehavior=${policy.protectedBranchBehavior}` : undefined,
        policy.protectedBranchPatterns && policy.protectedBranchPatterns.length > 0
          ? `protectedBranchPatterns=${policy.protectedBranchPatterns.join("|")}`
          : undefined,
      ].filter(Boolean).join(", ");

      return {
        content: [{
          type: "text",
          text: `Project memory policy for ${project.name}: ${details} (updated ${policy.updatedAt})`,
        }],
        structuredContent,
      };
    }
  );
}
