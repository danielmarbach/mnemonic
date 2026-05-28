import { z } from "zod";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { RELATIONSHIP_TYPES, type Relationship } from "../storage.js";
import {
  RelateResultSchema,
  type RelateResult,
  type MutationRetryContract,
} from "../structured-content.js";
import { projectParam, ensureBranchSynced, resolveProject } from "../helpers/project.js";
import { memoryId, isoDateString } from "../brands.js";
import { attachedVaultErrorMessage, ensureAttachmentsLoaded } from "../helpers/vault.js";
import type { Vault } from "../vault.js";
import {
  formatCommitBody,
  commitVaultWithProtection,
  checkVaultProtectedBranch,
} from "../helpers/git-commit.js";
import {
  buildMutationRetryContract,
  formatRetrySummary,
  pushAfterMutation,
} from "../helpers/persistence.js";
import { invalidateActiveProjectCache } from "../cache.js";

export function registerRelateTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "relate",
    {
      title: "Relate Memories",
      description:
        "Use after you have identified the exact memories to connect.\n\n" +
        "Use this when:\n" +
        "- A newly stored or updated note meaningfully connects to another note\n" +
        "- One note explains, exemplifies, supersedes, or closely relates to another\n\n" +
        "Do not use this when:\n" +
        "- The connection is weak or speculative\n" +
        "- You need to remove a relationship rather than add one\n\n" +
        "Returns: both ids, relationship type.\n\n" +
        "Writable attachments: can relate notes in writable attached vaults.\n\n" +
        "[mutating: modifies both notes, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `get` on both notes to verify the relationship context reads well.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        fromId: z.string().describe("Source memory id"),
        toId: z.string().describe("Target memory id"),
        type: z
          .enum(RELATIONSHIP_TYPES)
          .default("related-to")
          .describe(
            "Relationship type: 'related-to' (same topic), 'explains' (clarifies why), 'example-of' (instance of pattern), 'supersedes' (replaces), 'derives-from' (derived artifact), 'follows' (sequence order)",
          ),
        bidirectional: z
          .boolean()
          .optional()
          .default(true)
          .describe("Add relationship in both directions (default: true)"),
        cwd: projectParam,
      }),
      outputSchema: RelateResultSchema,
    },
    async ({ fromId, toId, type, bidirectional, cwd }) => {
      await ensureBranchSynced(ctx, cwd);
      const project = await resolveProject(ctx, cwd);
      const projectId = project?.id;
      if (projectId) await ensureAttachmentsLoaded(ctx, projectId);

      const [foundFrom, foundTo] = await Promise.all([
        ctx.vaultManager.findNote(fromId, cwd, { mutable: true, projectId }),
        ctx.vaultManager.findNote(toId, cwd, { mutable: true, projectId }),
      ]);
      if (!foundFrom) {
        const foundFromAny = await ctx.vaultManager.findNote(fromId, cwd, {
          mutable: false,
          projectId,
        });
        if (foundFromAny) {
          return {
            content: [
              { type: "text", text: attachedVaultErrorMessage(fromId, foundFromAny.vault) },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `No memory found with id '${fromId}'` }],
          isError: true,
        };
      }
      if (!foundTo) {
        const foundToAny = await ctx.vaultManager.findNote(toId, cwd, {
          mutable: false,
          projectId,
        });
        if (foundToAny) {
          return {
            content: [{ type: "text", text: attachedVaultErrorMessage(toId, foundToAny.vault) }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text", text: `No memory found with id '${toId}'` }],
          isError: true,
        };
      }

      const { note: fromNote, vault: fromVault } = foundFrom;
      const { note: toNote, vault: toVault } = foundTo;
      const now = isoDateString(new Date().toISOString());

      // Pre-check branch protection before mutating any notes
      const mutableVaults = new Set([
        fromVault,
        ...(bidirectional && toVault !== fromVault ? [toVault] : []),
      ]);
      const preChecks = await Promise.all(
        Array.from(mutableVaults).map((vault) =>
          checkVaultProtectedBranch({
            ctx,
            vault,
            allowProtectedBranch: false,
            toolName: "relate",
            noteProjectId:
              vault === fromVault ? (fromNote.project ?? undefined) : (toNote.project ?? undefined),
          }),
        ),
      );
      for (const check of preChecks) {
        if (check.blocked) {
          return {
            content: [
              {
                type: "text",
                text: check.message ?? "Protected branch policy blocked this commit.",
              },
            ],
            isError: true,
          };
        }
      }

      // Group changes by vault so notes in the same vault share one commit
      const vaultChanges = new Map<Vault, string[]>();

      const crossVault = fromVault.storage.vaultPath !== toVault.storage.vaultPath;

      const fromRels = fromNote.relatedTo ?? [];
      const fromRelExists = fromRels.some((r) => r.id === toId);
      if (!fromRelExists) {
        const fromRelationship: Relationship = { id: memoryId(toId), type };
        if (crossVault) {
          fromRelationship.vaultPath = toVault.storage.vaultPath;
        }
        await fromVault.storage.writeNote({
          ...fromNote,
          relatedTo: [...fromRels, fromRelationship],
          updatedAt: now,
        });
        const files = vaultChanges.get(fromVault) ?? [];
        files.push(ctx.vaultManager.noteRelPath(fromVault, fromId));
        vaultChanges.set(fromVault, files);
      }

      const toRels = toNote.relatedTo ?? [];
      const toRelExists = toRels.some((r) => r.id === fromId);
      if (bidirectional && !toRelExists) {
        const toRelationship: Relationship = { id: memoryId(fromId), type };
        if (crossVault) {
          toRelationship.vaultPath = fromVault.storage.vaultPath;
        }
        await toVault.storage.writeNote({
          ...toNote,
          relatedTo: [...toRels, toRelationship],
          updatedAt: now,
        });
        const files = vaultChanges.get(toVault) ?? [];
        files.push(ctx.vaultManager.noteRelPath(toVault, toId));
        vaultChanges.set(toVault, files);
      }

      // Check for uncommitted changes from a previous failed attempt
      if (vaultChanges.size === 0) {
        // If relationships exist in note content, check git status for pending changes
        const allVaults = new Set([
          fromVault,
          ...(bidirectional && toVault !== fromVault ? [toVault] : []),
        ]);

        for (const vault of allVaults) {
          const noteIds =
            vault === fromVault
              ? bidirectional && vault === toVault
                ? [fromId, toId]
                : [fromId]
              : [toId];
          const pendingFiles = await ctx.vaultManager.getPendingNoteFiles(vault, noteIds);

          if (pendingFiles.length > 0) {
            // Commit the pending changes from previous failed attempt
            const commitBody = formatCommitBody({
              noteId: fromId,
              noteTitle: fromNote.title,
              projectName: fromNote.projectName,
              relationship: { fromId, toId, type },
            });
            const commitMessage = `relate: ${fromNote.title} ↔ ${toNote.title}`;
            const commitStatus = await commitVaultWithProtection({
              ctx,
              vault,
              commitMessage,
              files: pendingFiles,
              commitBody,
              allowProtectedBranch: false,
              toolName: "relate",
            });

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
              action: "related",
              fromId,
              toId,
              type,
              bidirectional,
              notesModified: pendingFiles.map((f: string) => path.basename(f, ".md")),
              retry,
            };

            const retrySummary = formatRetrySummary(retry);
            return {
              content: [
                {
                  type: "text",
                  text: `Reconciled pending commit for relationship \`${fromId}\` ${bidirectional ? "↔" : "→"} \`${toId}\` (${type})${retrySummary ? `\n${retrySummary}` : ""}`,
                },
              ],
              structuredContent,
            };
          }
        }

        return {
          content: [
            { type: "text", text: `Relationship already exists between '${fromId}' and '${toId}'` },
          ],
          isError: true,
        };
      }

      const modifiedNoteIds: string[] = [];
      let retry: MutationRetryContract | undefined;
      for (const [vault, files] of vaultChanges) {
        const isFromVault = vault === fromVault;
        const thisNote = isFromVault ? fromNote : toNote;
        const otherNote = isFromVault ? toNote : fromNote;
        const commitBody = formatCommitBody({
          noteId: thisNote.id,
          noteTitle: thisNote.title,
          projectName: thisNote.projectName,
          relationship: {
            fromId: thisNote.id,
            toId: otherNote.id,
            type,
          },
        });
        const commitMessage = `relate: ${fromNote.title} ↔ ${toNote.title}`;
        const commitStatus = await commitVaultWithProtection({
          ctx,
          vault,
          commitMessage,
          files,
          commitBody,
          allowProtectedBranch: false,
          toolName: "relate",
        });
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
        modifiedNoteIds.push(...files.map((f) => path.basename(f, ".md")));
      }

      const dirStr = bidirectional ? "↔" : "→";
      const structuredContent: RelateResult = {
        action: "related",
        fromId,
        toId,
        type,
        bidirectional,
        notesModified: modifiedNoteIds,
        retry,
      };

      const retrySummary = formatRetrySummary(retry);
      invalidateActiveProjectCache();
      return {
        content: [
          {
            type: "text",
            text: `Linked \`${fromId}\` ${dirStr} \`${toId}\` (${type})${retrySummary ? `\n${retrySummary}` : ""}`,
          },
        ],
        structuredContent,
      };
    },
  );
}
