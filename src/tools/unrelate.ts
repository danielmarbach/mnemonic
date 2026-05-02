import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { projectParam, ensureBranchSynced } from "../helpers/project.js";
import { isoDateString } from "../brands.js";
import type { Vault } from "../vault.js";
import {
  RelateResultSchema,
  type RelateResult,
  type MutationRetryContract,
} from "../structured-content.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import {
  buildMutationRetryContract,
  formatRetrySummary,
  pushAfterMutation,
} from "../helpers/persistence.js";
import { invalidateActiveProjectCache } from "../cache.js";
import path from "path";

export function registerUnrelateTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "unrelate",
    {
      title: "Remove Relationship",
      description:
        "Remove a relationship between two memories.\n\n" +
        "Use this when:\n" +
        "- A previously created relationship is no longer accurate\n" +
        "- Two notes should remain independent\n\n" +
        "Do not use this when:\n" +
        "- You are adding a new connection; use `relate`\n\n" +
        "Returns:\n" +
        "- Both memory ids and the removed relationship details\n\n" +
        "Side effects: modifies both notes, git commits per affected vault, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `get` to verify both notes now stand on their own.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        fromId: z.string().describe("Source memory id"),
        toId: z.string().describe("Target memory id"),
        bidirectional: z.boolean().optional().default(true).describe("Remove relationship in both directions (default: true)"),
        cwd: projectParam,
      }),
      outputSchema: RelateResultSchema,
    },
    async ({ fromId, toId, bidirectional, cwd }) => {
      await ensureBranchSynced(ctx, cwd);

      const [foundFrom, foundTo] = await Promise.all([
        ctx.vaultManager.findNote(fromId, cwd),
        ctx.vaultManager.findNote(toId, cwd),
      ]);

      const now = isoDateString(new Date().toISOString());
      const vaultChanges = new Map<Vault, string[]>();

      if (foundFrom) {
        const { note: fromNote, vault: fromVault } = foundFrom;
        const filtered = (fromNote.relatedTo ?? []).filter((r) => r.id !== toId);
        const fromRelExisted = (fromNote.relatedTo?.length ?? 0) > filtered.length;
        if (fromRelExisted) {
          await fromVault.storage.writeNote({ ...fromNote, relatedTo: filtered, updatedAt: now });
          const files = vaultChanges.get(fromVault) ?? [];
          files.push(ctx.vaultManager.noteRelPath(fromVault, fromId));
          vaultChanges.set(fromVault, files);
        }
      }

      if (bidirectional && foundTo) {
        const { note: toNote, vault: toVault } = foundTo;
        const filtered = (toNote.relatedTo ?? []).filter((r) => r.id !== fromId);
        const toRelExisted = (toNote.relatedTo?.length ?? 0) > filtered.length;
        if (toRelExisted) {
          await toVault.storage.writeNote({ ...toNote, relatedTo: filtered, updatedAt: now });
          const files = vaultChanges.get(toVault) ?? [];
          files.push(ctx.vaultManager.noteRelPath(toVault, toId));
          vaultChanges.set(toVault, files);
        }
      }

      // Check for uncommitted changes from a previous failed attempt
      if (vaultChanges.size === 0) {
        // If no relationships were found in note content, check git status for pending changes
        const allVaults = new Set<Vault>();
        if (foundFrom) allVaults.add(foundFrom.vault);
        if (bidirectional && foundTo) allVaults.add(foundTo.vault);
        
        for (const vault of allVaults) {
          const noteIds: string[] = [];
          if (foundFrom && foundFrom.vault === vault) noteIds.push(fromId);
          if (bidirectional && foundTo && foundTo.vault === vault) noteIds.push(toId);
          
          const pendingFiles = await ctx.vaultManager.getPendingNoteFiles(vault, noteIds);
          
          if (pendingFiles.length > 0) {
            // Commit the pending changes from previous failed attempt
            const found = foundFrom?.vault === vault ? foundFrom : foundTo;
            const commitBody = found
              ? formatCommitBody({
                  noteId: found.note.id,
                  noteTitle: found.note.title,
                  projectName: found.note.projectName,
                })
              : undefined;
            const commitMessage = `unrelate: ${fromId} ↔ ${toId}`;
            const commitStatus = await vault.git.commitWithStatus(commitMessage, pendingFiles, commitBody);
            
            if (commitStatus.status === "committed") {
              await pushAfterMutation(ctx, vault);
            }
            
            const retry = buildMutationRetryContract({
              commit: commitStatus,
              commitMessage,
              commitBody,
              files: pendingFiles,
              cwd,
              vault,
              mutationApplied: true,
              preferredRecovery: "rerun-tool-call-serial",
            });
            
            const structuredContent: RelateResult = {
              action: "unrelated",
              fromId,
              toId,
              type: "related-to",
              bidirectional,
              notesModified: pendingFiles.map((f: string) => path.basename(f, '.md')),
              retry,
            };
            
            const retrySummary = formatRetrySummary(retry);
            return {
              content: [{
                type: "text",
                text: `Reconciled pending commit for relationship removal between \`${fromId}\` and \`${toId}\`${retrySummary ? `\n${retrySummary}` : ""}`,
              }],
              structuredContent,
            };
          }
        }
        
        return { content: [{ type: "text", text: `No relationship found between '${fromId}' and '${toId}'` }], isError: true };
      }

      let retry: MutationRetryContract | undefined;
      for (const [vault, files] of vaultChanges) {
        const found = foundFrom?.vault === vault ? foundFrom : foundTo;
        const commitBody = found
          ? formatCommitBody({
              noteId: found.note.id,
              noteTitle: found.note.title,
              projectName: found.note.projectName,
            })
          : undefined;
        const commitMessage = `unrelate: ${fromId} ↔ ${toId}`;
        const commitStatus = await vault.git.commitWithStatus(commitMessage, files, commitBody);
        if (!retry) {
          retry = buildMutationRetryContract({
            commit: commitStatus,
            commitMessage,
            commitBody,
            files,
            cwd,
            vault,
            mutationApplied: true,
            preferredRecovery: "rerun-tool-call-serial",
          });
        }
        if (commitStatus.status === "committed") {
          await pushAfterMutation(ctx, vault);
        }
      }

      const modifiedNoteIds: string[] = [];
      for (const [, files] of vaultChanges) {
        modifiedNoteIds.push(...files.map(f => path.basename(f, '.md')));
      }
      
      const structuredContent: RelateResult = {
        action: "unrelated",
        fromId,
        toId,
        type: "related-to", // not tracked for unrelate
        bidirectional,
        notesModified: modifiedNoteIds,
        retry,
      };
      
      const retrySummary = formatRetrySummary(retry);
      invalidateActiveProjectCache();
      return {
        content: [{
          type: "text",
          text: `Removed relationship between \`${fromId}\` and \`${toId}\`${retrySummary ? `\n${retrySummary}` : ""}`,
        }],
        structuredContent,
      };
    }
  );
}
