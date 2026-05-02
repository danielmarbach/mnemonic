import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { resolveProjectIdentityForCwd as resolveProjectIdentityForCwdFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatProjectIdentityText } from "./detect-project.js";
import { ProjectIdentityResultSchema, type ProjectIdentityResult } from "../structured-content.js";

export function registerGetProjectIdentityTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "get_project_identity",
    {
      title: "Get Project Identity",
      description:
        "Show the effective project identity for a working directory, including any configured remote override.\n\n" +
        "Use this when:\n" +
        "- You need to verify whether project identity comes from `origin`, `upstream`, or an override\n" +
        "- You are debugging project scoping issues\n\n" +
        "Do not use this when:\n" +
        "- You only need the project id/name to continue; use `detect_project` instead\n\n" +
        "Returns:\n" +
        "- Effective project identity, default identity, and any configured override\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `set_project_identity` only if the wrong remote is defining identity.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."),
      }),
      outputSchema: ProjectIdentityResultSchema,
    },
    async ({ cwd }) => {
      const identity = await resolveProjectIdentityForCwdFromModule(ctx, cwd);
      if (!identity) {
        return projectNotFoundResponse(cwd);
      }

      const structuredContent: ProjectIdentityResult = {
        action: "project_identity_shown",
        project: {
          id: identity.project.id,
          name: identity.project.name,
          source: identity.project.source,
          remoteName: identity.project.remoteName,
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
          text: formatProjectIdentityText(identity),
        }],
        structuredContent,
      };
    }
  );
}
