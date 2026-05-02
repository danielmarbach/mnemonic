import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProjectIdentityForCwd as resolveProjectIdentityForCwdFromModule } from "../helpers/project.js";
import { projectNotFoundResponse, formatProjectPolicyLine as formatProjectPolicyLineFromModule } from "../helpers/vault.js";
import type { ProjectIdentityResolution } from "../project.js";
import { ProjectIdentityResultSchema, type ProjectIdentityResult } from "../structured-content.js";

export function formatProjectIdentityText(identity: ProjectIdentityResolution): string {
  const lines = [
    `Project identity:`,
    `- **id:** \`${identity.project.id}\``,
    `- **name:** ${identity.project.name}`,
    `- **source:** ${identity.project.source}`,
  ];

  if (identity.project.remoteName) {
    lines.push(`- **remote:** ${identity.project.remoteName}`);
  }

  if (identity.identityOverride) {
    const defaultRemote = identity.defaultProject.remoteName ?? "none";
    const status = identity.identityOverrideApplied ? "applied" : "configured, remote unavailable";
    lines.push(`- **identity override:** ${identity.identityOverride.remoteName} (${status}; default remote: ${defaultRemote})`);
    lines.push(`- **default id:** \`${identity.defaultProject.id}\``);
  }

  return lines.join("\n");
}

export function registerDetectProjectTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "detect_project",
    {
      title: "Detect Project",
      description:
        "Detect the effective project identity for a working directory.\n\n" +
        "Use this when:\n" +
        "- You have a repo path and need the project id/name before storing or searching memories\n" +
        "- You want project-aware routing and search boosting\n\n" +
        "Do not use this when:\n" +
        "- You need to inspect identity override details; use `get_project_identity` instead\n\n" +
        "Returns:\n" +
        "- Effective project id, name, source, and any active policy hint\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `recall` or `project_memory_summary` to orient on existing memory.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      outputSchema: ProjectIdentityResultSchema,
      inputSchema: z.object({
        cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
      }),
    },
    async ({ cwd }) => {
      const identity = await resolveProjectIdentityForCwdFromModule(ctx, cwd);
      const project = identity?.project;
      if (!project || !identity) {
        return projectNotFoundResponse(cwd);
      }
      const policyLine = await formatProjectPolicyLineFromModule(ctx, project.id);
      
      const structuredContent: ProjectIdentityResult = {
        action: "project_identity_detected",
        project: {
          id: project.id,
          name: project.name,
          source: project.source,
          remoteName: project.remoteName,
        },
        defaultProject: identity.defaultProject ? {
          id: identity.defaultProject.id,
          name: identity.defaultProject.name,
          remoteName: identity.defaultProject.remoteName,
        } : undefined,
        identityOverride: identity.identityOverride,
      };
      
      return {
        content: [{
          type: "text",
          text:
            `${formatProjectIdentityText(identity)}\n` +
            `- **${policyLine}**`,
        }],
        structuredContent,
      };
    }
  );
}
