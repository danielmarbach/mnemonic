import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import type { Vault } from "../vault.js";
import {
  NoteIdSchema,
  MoveResultSchema,
  type MoveResult,
} from "../structured-content.js";
import {
  projectParam,
  resolveProject,
  ensureBranchSynced,
} from "../helpers/project.js";
import { memoryId, isoDateString } from "../brands.js";
import { shouldBlockProtectedBranchCommit } from "../helpers/git-commit.js";
import {
  formatPersistenceSummary,
} from "../helpers/persistence.js";
import {
  moveNoteBetweenVaults,
  projectNotFoundResponse,
  storageLabel,
} from "../helpers/vault.js";
import { invalidateActiveProjectCache } from "../cache.js";

export function registerMoveMemoryTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "move_memory",
    {
      title: "Move Memory",
      description:
        "Use after `where_is_memory` or `get` confirms a memory is stored in the wrong place.\n\n" +
        "Move a memory between main storage and project storage, optionally targeting a specific sub-vault folder.\n\n" +
        "Use this when:\n" +
        "- A note is stored in the wrong place\n" +
        "- Project-specific knowledge should move between shared project storage and main storage\n" +
        "- A note should live in a specific sub-vault such as `.mnemonic-lib`\n\n" +
        "Do not use this when:\n" +
        "- You only need to edit the note content; use `update`\n" +
        "- You want to delete the note; use `forget`\n\n" +
        "Returns:\n" +
        "- The moved memory id, resulting storage label, project association, and persistence status\n\n" +
        "Side effects: rewrites storage location, may adjust project association, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `where_is_memory` or `get` to verify the final state.\n" +
        "- Use `relate` if the moved memory connects to existing notes in the new vault.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: NoteIdSchema.describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
        target: z.enum(["main-vault", "project-vault"]).describe("Destination: 'main-vault' for private/global storage, 'project-vault' for shared project storage"),
        vaultFolder: z
          .string()
          .optional()
          .describe(
            "Optional target project vault folder name, such as `.mnemonic-lib`. " +
            "Use this only when moving into a specific sub-vault instead of the primary project vault."
          ),
        cwd: projectParam,
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
            "When true, move_memory can commit on a protected branch without changing project policy."
          ),
      }),
      outputSchema: MoveResultSchema,
    },
    async ({ id, target, vaultFolder, cwd, allowProtectedBranch = false }) => {
      await ensureBranchSynced(ctx, cwd);

      const found = await ctx.vaultManager.findNote(id, cwd);
      if (!found) {
        return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
      }

      const currentStorage = storageLabel(found.vault);

      let targetVault: Vault;
      let targetProject: Awaited<ReturnType<typeof resolveProject>> | undefined;
      if (target === "main-vault") {
        targetVault = ctx.vaultManager.main;
      } else {
        if (!cwd) {
          return {
            content: [{
              type: "text",
              text: "Moving into a project vault requires `cwd` so mnemonic can resolve the destination project.",
            }],
            isError: true,
          };
        }

        if (vaultFolder) {
          // Target a specific submodule vault by folder name.
          const subVault = await ctx.vaultManager.getVaultByFolder(cwd, vaultFolder);
          if (!subVault) {
            return {
              content: [{ type: "text", text: `Vault folder '${vaultFolder}' not found under the git root for: ${cwd}` }],
              isError: true,
            };
          }
          targetVault = subVault;
        } else {
          // Default: primary project vault (.mnemonic).
          const projectVault = await ctx.vaultManager.getOrCreateProjectVault(cwd);
          if (!projectVault) {
            return { content: [{ type: "text", text: `Could not resolve a project vault for: ${cwd}` }], isError: true };
          }
          targetVault = projectVault;
        }

        targetProject = await resolveProject(ctx, cwd);
        if (!targetProject) {
          return projectNotFoundResponse(cwd);
        }
      }

      // Check if the note is already in the target vault.
      if (found.vault.storage.vaultPath === targetVault.storage.vaultPath) {
        const targetLabel = storageLabel(targetVault);
        return { content: [{ type: "text", text: `Memory '${id}' is already stored in ${targetLabel}.` }], isError: true };
      }

      if (found.vault.isProject || targetVault.isProject) {
        const resolvedProject = targetProject ?? await resolveProject(ctx, cwd);
        const projectLabel = resolvedProject
          ? `${resolvedProject.name} (${resolvedProject.id})`
          : `${found.note.projectName ?? "project"} (${found.note.project ?? "unknown"})`;
        const projectId = targetProject?.id ?? found.note.project;
        const policy = projectId ? await ctx.configStore.getProjectPolicy(projectId) : undefined;
        const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
          ctx,
          cwd,
          writeScope: "project",
          automaticCommit: true,
          projectLabel,
          policy,
          allowProtectedBranch,
          toolName: "move_memory",
        });
        if (protectedBranchCheck.blocked) {
          return {
            content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }],
            isError: true,
          };
        }
      }

      const targetLabel = storageLabel(targetVault);
      const existing = await targetVault.storage.readNote(memoryId(id));
      if (existing) {
        return { content: [{ type: "text", text: `Cannot move '${id}' because a note with that id already exists in ${targetLabel}.` }], isError: true };
      }

      let noteToWrite = found.note;
      let metadataRewritten = false;
      if (target === "project-vault" && targetProject) {
        const rewrittenProject = targetProject.id;
        const rewrittenProjectName = targetProject.name;
        metadataRewritten = noteToWrite.project !== rewrittenProject || noteToWrite.projectName !== rewrittenProjectName;
        noteToWrite = {
          ...noteToWrite,
          project: rewrittenProject,
          projectName: rewrittenProjectName,
          updatedAt: isoDateString(new Date().toISOString()),
        };
      }

      const moveResult = await moveNoteBetweenVaults(ctx, found, targetVault, noteToWrite, cwd);
      const movedNote = moveResult.note;
      const associationValue = movedNote.projectName && movedNote.project
        ? `${movedNote.projectName} (${movedNote.project})`
        : movedNote.projectName ?? movedNote.project ?? "global";
      
      const structuredContent: MoveResult = {
        action: "moved",
        id,
        fromVault: currentStorage,
        toVault: targetLabel,
        projectAssociation: associationValue,
        title: movedNote.title,
        metadataRewritten,
        persistence: moveResult.persistence,
      };

      const associationText = metadataRewritten
        ? `Project association is now ${associationValue}.`
        : `Project association remains ${associationValue}.`;

      invalidateActiveProjectCache();
      return {
        content: [{
          type: "text",
          text: `Moved '${id}' from ${currentStorage} to ${targetLabel}. ${associationText}\n${formatPersistenceSummary(moveResult.persistence)}`,
        }],
        structuredContent,
      };
    }
  );
}
