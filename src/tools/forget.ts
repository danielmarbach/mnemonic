import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import {
  NoteIdSchema,
  ForgetResultSchema,
  type ForgetResult,
  type MutationRetryContract,
} from "../structured-content.js";
import {
  projectParam,
  resolveProject,
  noteProjectRef,
  ensureBranchSynced,
} from "../helpers/project.js";
import { memoryId } from "../brands.js";
import {
  formatCommitBody,
  shouldBlockProtectedBranchCommit,
  wouldRelationshipCleanupTouchProjectVault,
} from "../helpers/git-commit.js";
import {
  buildMutationRetryContract,
  formatRetrySummary,
  pushAfterMutation,
} from "../helpers/persistence.js";
import {
  removeRelationshipsToNoteIds,
  addVaultChange,
  storageLabel,
} from "../helpers/vault.js";
import { invalidateActiveProjectCache } from "../cache.js";

export function registerForgetTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "forget",
    {
      title: "Forget",
      description:
        "Delete an existing memory by id and clean up dangling relationships.\n\n" +
        "Use this when:\n" +
        "- A memory should be removed entirely\n" +
        "- A note is obsolete and should not remain searchable\n\n" +
        "Do not use this when:\n" +
        "- The note should stay but move to another vault; use `move_memory`\n" +
        "- The note should be replaced or merged; use `consolidate`\n\n" +
        "Returns:\n" +
        "- Deleted memory id/title and relationship cleanup details\n\n" +
        "Side effects: deletes note files, cleans relationship references, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `recall` or `list` to confirm the remaining memory set is clean.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: NoteIdSchema.describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
        cwd: projectParam,
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
            "When true, forget can commit on a protected branch without changing project policy."
          ),
      }),
      outputSchema: ForgetResultSchema,
    },
    async ({ id, cwd, allowProtectedBranch = false }) => {
      await ensureBranchSynced(ctx, cwd);

      const found = await ctx.vaultManager.findNote(id, cwd);
      if (!found) {
        return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
      }

      const { note, vault: noteVault } = found;
      const touchesProjectVault = noteVault.isProject || await wouldRelationshipCleanupTouchProjectVault(ctx, [id]);
      if (touchesProjectVault) {
        const resolvedProject = await resolveProject(ctx, cwd);
        const projectLabel = resolvedProject
          ? `${resolvedProject.name} (${resolvedProject.id})`
          : `${note.projectName ?? "project"} (${note.project ?? "unknown"})`;
        const policy = note.project ? await ctx.configStore.getProjectPolicy(note.project) : undefined;
        const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
          ctx,
          cwd,
          writeScope: "project",
          automaticCommit: true,
          projectLabel,
          policy,
          allowProtectedBranch,
          toolName: "forget",
        });
        if (protectedBranchCheck.blocked) {
          return {
            content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }],
            isError: true,
          };
        }
      }

      await noteVault.storage.deleteNote(memoryId(id));

      // Clean up dangling references grouped by vault so we make one commit per vault
      const vaultChanges = await removeRelationshipsToNoteIds(ctx, [id]);

      // Always include the deleted note's path (git add on a deleted file stages the removal)
      addVaultChange(vaultChanges, noteVault, ctx.vaultManager.noteRelPath(noteVault, id));

      let retry: MutationRetryContract | undefined;
      for (const [v, files] of vaultChanges) {
        const isPrimaryVault = v === noteVault;
        const summary = isPrimaryVault ? `Deleted note and cleaned up ${files.length - 1} reference(s)` : "Cleaned up dangling reference";
        const commitBody = formatCommitBody({
          summary,
          noteId: id,
          noteTitle: note.title,
          projectName: note.projectName,
        });
        const commitMessage = `forget: ${note.title}`;
        const commitStatus = await v.git.commitWithStatus(commitMessage, files, commitBody);
        if (!retry) {
          retry = buildMutationRetryContract({
            commit: commitStatus,
            commitMessage,
            commitBody,
            files,
            cwd,
            vault: v,
            mutationApplied: true,
          });
        }
        if (commitStatus.status === "committed") {
          await pushAfterMutation(ctx, v);
        }
      }

      const structuredContent: ForgetResult = {
        action: "forgotten",
        id,
        title: note.title,
        project: noteProjectRef(note),
        relationshipsCleaned: vaultChanges.size > 0 ? Array.from(vaultChanges.values()).reduce((sum, files) => sum + files.length - 1, 0) : 0,
        vaultsModified: Array.from(vaultChanges.keys()).map(v => storageLabel(v)),
        retry,
      };

      const retrySummary = formatRetrySummary(retry);
      invalidateActiveProjectCache();
      return {
        content: [{
          type: "text",
          text: `Forgotten '${id}' (${note.title})${retrySummary ? `\n${retrySummary}` : ""}`,
        }],
        structuredContent,
      };
    }
  );
}
