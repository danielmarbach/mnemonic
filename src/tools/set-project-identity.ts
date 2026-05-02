import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProjectIdentity } from "../project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import { pushAfterMutation as pushAfterMutationFromModule, buildMutationRetryContract, formatRetrySummary } from "../helpers/persistence.js";
import { RemoteNameSchema, ProjectIdentityResultSchema, type ProjectIdentityResult } from "../structured-content.js";

export function registerSetProjectIdentityTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "set_project_identity",
    {
      title: "Set Project Identity",
      description:
        "Override which git remote defines project identity for a repo.\n\n" +
        "Use this when:\n" +
        "- A fork should associate memory with the upstream project rather than the fork remote\n" +
        "- Project detection is resolving to the wrong canonical repo\n\n" +
        "Do not use this when:\n" +
        "- The default remote already identifies the correct project\n\n" +
        "Returns:\n" +
        "- The new effective project identity after applying the override\n\n" +
        "Side effects: writes config, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Re-run `detect_project` or `get_project_identity` to verify the result.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
        remoteName: RemoteNameSchema.describe("Git remote name to use as the canonical project identity, such as `upstream`")
      }),
      outputSchema: ProjectIdentityResultSchema,
    },
    async ({ cwd, remoteName }) => {
      const defaultIdentity = await resolveProjectIdentity(cwd);
      if (!defaultIdentity) {
        return projectNotFoundResponse(cwd);
      }

      const defaultProject = defaultIdentity.project;
      if (defaultProject.source !== "git-remote") {
        return {
          content: [{
            type: "text",
            text: `Project identity override requires a git remote. Current source: ${defaultProject.source}`,
          }],
        };
      }

      const now = new Date().toISOString();
      const candidateIdentity = await resolveProjectIdentity(cwd, {
        getProjectIdentityOverride: async () => ({ remoteName, updatedAt: now }),
      });

      if (!candidateIdentity || !candidateIdentity.identityOverrideApplied) {
        return {
          content: [{
            type: "text",
            text: `Could not resolve git remote '${remoteName}' for ${defaultProject.name}.`,
          }],
        };
      }

      await ctx.configStore.setProjectIdentityOverride(defaultProject.id, { remoteName, updatedAt: now });

      const commitBody = formatCommitBody({
        summary: `Use ${remoteName} as canonical project identity`,
        projectName: defaultProject.name,
        description:
          `Default identity: ${defaultProject.id}\n` +
          `Resolved identity: ${candidateIdentity.project.id}\n` +
          `Remote: ${remoteName}`,
      });
      const commitMessage = `identity: ${defaultProject.name} use remote ${remoteName}`;
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

      const structuredContent: ProjectIdentityResult = {
        action: "project_identity_set",
        project: {
          id: candidateIdentity.project.id,
          name: candidateIdentity.project.name,
          source: candidateIdentity.project.source,
          remoteName: candidateIdentity.project.remoteName,
        },
        defaultProject: {
          id: defaultProject.id,
          name: defaultProject.name,
          remoteName: defaultProject.remoteName,
        },
        identityOverride: {
          remoteName,
          updatedAt: now,
        },
        retry,
      };

      return {
        content: [{
          type: "text",
          text:
            `Project identity override set for ${defaultProject.name}: ` +
            `default=\`${defaultProject.id}\`, effective=\`${candidateIdentity.project.id}\`, remote=${remoteName}` +
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
