import { z } from "zod";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server-context.js";
import {
  RELATIONSHIP_TYPES,
  type Note,
  type Relationship,
  type RelationshipType,
} from "../storage.js";
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
import { protectedBranchDecision, readProtectedBranchConsentState } from "../helpers/mrtr.js";
import {
  buildMutationRetryContract,
  formatRetrySummary,
  pushAfterMutation,
} from "../helpers/persistence.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { guardIdsAgainstDocumentSourceMutation } from "../mutation-guard.js";

/**
 * Relationship direction conventions (see vault note
 * `bug-bidirectional-relate-duplicates-directional-relationship-4b9a18fa`).
 *
 * The same frontmatter shape `{ id, type }` on a note X means "X is <type> by
 * <id>" (passive) for `supersedes` and "X <type>s <id>" (active) for all other
 * types. This mirrors the rest of the codebase:
 *
 * - `related-to` is symmetric: `relate(from, to)` writes `{ id: to }` on `from`
 *   and, when `bidirectional`, `{ id: from }` on `to`.
 * - Directional types (`explains`, `example-of`, `derives-from`, `follows`)
 *   are forward-only: the edge is stored once on `from` (`{ id: to }`).
 * - `supersedes` is passive: the edge is stored on the SUPERSEDED note. A call
 *   `relate(fromId, toId, "supersedes")` means "fromId supersedes toId" and
 *   writes `{ id: fromId }` on `toId`. `toId` then becomes a
 *   `prune-superseded` candidate. This matches what `execute-merge` writes and
 *   what `pruneSuperseded` / recall evidence / maintenance warnings read.
 */
const SYMMETRIC_RELATIONSHIP_TYPE: RelationshipType = "related-to";
const PASSIVE_SUPERSEDES_TYPE: RelationshipType = "supersedes";

function hasRelationship(
  rels: Relationship[] | undefined,
  id: string,
  type: RelationshipType,
  vaultPath: string | undefined,
): boolean {
  return (rels ?? []).some(
    (r) => r.id === id && r.type === type && (r.vaultPath ?? undefined) === vaultPath,
  );
}

interface RelationWrite {
  note: Note;
  vault: Vault;
  noteId: string;
  other: { id: string; title: string; projectName?: string };
  relationship: Relationship;
}

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
        "Direction conventions:\n" +
        "- 'related-to' is symmetric: both notes get an edge (or only `fromId` with bidirectional: false).\n" +
        "- 'explains', 'example-of', 'derives-from', 'follows' are stored once on `fromId`.\n" +
        "- 'supersedes' is stored on the SUPERSEDED note: `relate(fromId, toId, 'supersedes')` marks `toId` as superseded by `fromId`; `toId` becomes a `prune-superseded` candidate. This matches `execute-merge` and `prune-superseded` semantics.\n\n" +
        "Returns: both ids, relationship type.\n\n" +
        "Writable attachments: can relate notes in writable attached vaults.\n\n" +
        "[mutating: modifies notes, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `get` on both notes to verify the relationship context reads well.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        fromId: z.string().describe("Source memory id (the superseder for 'supersedes')"),
        toId: z.string().describe("Target memory id (the superseded note for 'supersedes')"),
        type: z
          .enum(RELATIONSHIP_TYPES)
          .default("related-to")
          .describe(
            "Relationship type: 'related-to' (same topic; symmetric), 'explains' (clarifies why), 'example-of' (instance of pattern), 'supersedes' (fromId replaces toId; stored on toId), 'derives-from' (derived artifact), 'follows' (sequence order)",
          ),
        bidirectional: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Add relationship in both directions (default: true). Only meaningful for the symmetric 'related-to' type; directional types are always stored one-way.",
          ),
        cwd: projectParam,
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
              "When true, relate can commit on a protected branch without changing project policy.",
          ),
      }),
      outputSchema: RelateResultSchema,
    },
    async (
      {
        fromId,
        toId,
        type,
        bidirectional,
        cwd,
        allowProtectedBranch: allowProtectedBranchArg = false,
      },
      requestCtx,
    ) => {
      const branchConsent = readProtectedBranchConsentState(requestCtx);
      const allowProtectedBranch = allowProtectedBranchArg || branchConsent === "granted";
      await ensureBranchSynced(ctx, cwd);
      guardIdsAgainstDocumentSourceMutation([fromId, toId], "relate");
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

      if (fromId === toId) {
        return {
          content: [{ type: "text", text: "Cannot relate a memory to itself." }],
          isError: true,
        };
      }

      const now = isoDateString(new Date().toISOString());
      const crossVault = fromVault.storage.vaultPath !== toVault.storage.vaultPath;
      const toVaultPath = crossVault ? toVault.storage.vaultPath : undefined;
      const fromVaultPath = crossVault ? fromVault.storage.vaultPath : undefined;

      const symmetric = type === SYMMETRIC_RELATIONSHIP_TYPE;
      const passiveSupersedes = type === PASSIVE_SUPERSEDES_TYPE;
      const effectiveBidirectional = symmetric && bidirectional === true;

      // ── Build the mutation plan ───────────────────────────────────────────
      // Every downstream step (branch pre-checks, writes, retry reconciliation,
      // commit metadata, result) is derived from this plan so the tool never
      // assumes a specific note carries the edge.
      const writes: RelationWrite[] = [];

      if (symmetric) {
        if (!hasRelationship(fromNote.relatedTo, toId, type, toVaultPath)) {
          writes.push({
            note: fromNote,
            vault: fromVault,
            noteId: fromId,
            other: { id: toId, title: toNote.title, projectName: toNote.projectName },
            relationship: {
              id: memoryId(toId),
              type,
              ...(toVaultPath ? { vaultPath: toVaultPath } : {}),
            },
          });
        }
        if (
          effectiveBidirectional &&
          !hasRelationship(toNote.relatedTo, fromId, type, fromVaultPath)
        ) {
          writes.push({
            note: toNote,
            vault: toVault,
            noteId: toId,
            other: { id: fromId, title: fromNote.title, projectName: fromNote.projectName },
            relationship: {
              id: memoryId(fromId),
              type,
              ...(fromVaultPath ? { vaultPath: fromVaultPath } : {}),
            },
          });
        }
      } else if (passiveSupersedes) {
        // The edge is stored on the superseded (`toId`) note. Refuse writes
        // that would create an ambiguous or self-contradictory supersession:
        if (hasRelationship(fromNote.relatedTo, toId, type, toVaultPath)) {
          return {
            content: [
              {
                type: "text",
                text: `\`${fromId}\` already carries a '${type}' edge to \`${toId}\` (mutual pair). Use 'unrelate' to remove the existing edge first.`,
              },
            ],
            isError: true,
          };
        }
        const existingSuperseder = (toNote.relatedTo ?? []).find(
          (r) => r.type === PASSIVE_SUPERSEDES_TYPE && r.id !== fromId,
        );
        if (existingSuperseder) {
          return {
            content: [
              {
                type: "text",
                text: `\`${toId}\` is already superseded by \`${existingSuperseder.id}\`; a note can have at most one superseder. Unrelate that edge first if this supersession should be replaced.`,
              },
            ],
            isError: true,
          };
        }
        if (!hasRelationship(toNote.relatedTo, fromId, type, fromVaultPath)) {
          writes.push({
            note: toNote,
            vault: toVault,
            noteId: toId,
            other: { id: fromId, title: fromNote.title, projectName: fromNote.projectName },
            relationship: {
              id: memoryId(fromId),
              type,
              ...(fromVaultPath ? { vaultPath: fromVaultPath } : {}),
            },
          });
        }
      } else {
        // Forward-only directional types: edge stored on `from` (`{ id: to }`).
        // Refuse if the reverse same-type edge already exists on `to` (would
        // complete a mutual pair from legacy buggy data).
        if (hasRelationship(toNote.relatedTo, fromId, type, fromVaultPath)) {
          return {
            content: [
              {
                type: "text",
                text: `\`${toId}\` already carries a '${type}' edge back to \`${fromId}\` (mutual pair). Use 'unrelate' to remove the existing edge first.`,
              },
            ],
            isError: true,
          };
        }
        if (!hasRelationship(fromNote.relatedTo, toId, type, toVaultPath)) {
          writes.push({
            note: fromNote,
            vault: fromVault,
            noteId: fromId,
            other: { id: toId, title: toNote.title, projectName: toNote.projectName },
            relationship: {
              id: memoryId(toId),
              type,
              ...(toVaultPath ? { vaultPath: toVaultPath } : {}),
            },
          });
        }
      }

      // Pre-check branch protection for every vault the plan will mutate
      const mutableVaults = new Set(writes.map((write) => write.vault));
      const preChecks = await Promise.all(
        Array.from(mutableVaults).map((vault) =>
          checkVaultProtectedBranch({
            ctx,
            vault,
            allowProtectedBranch,
            toolName: "relate",
            noteProjectId:
              vault === fromVault ? (fromNote.project ?? undefined) : (toNote.project ?? undefined),
          }),
        ),
      );
      for (const check of preChecks) {
        if (check.blocked) {
          if (branchConsent === "denied") {
            return {
              content: [{ type: "text", text: check.message }],
              isError: true,
            };
          }
          return protectedBranchDecision(requestCtx, check);
        }
      }

      // No writes: either the relationship already exists, or a previous
      // attempt left uncommitted changes to reconcile.
      if (writes.length === 0) {
        const allVaults = new Set<{ vault: Vault; noteId: string }>([
          { vault: fromVault, noteId: fromId },
          ...(effectiveBidirectional || passiveSupersedes
            ? [{ vault: toVault, noteId: toId }]
            : []),
        ]);

        for (const { vault, noteId } of allVaults) {
          const pendingFiles = await ctx.vaultManager.getPendingNoteFiles(vault, [noteId]);

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
              allowProtectedBranch,
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
              bidirectional: effectiveBidirectional,
              notesModified: pendingFiles.map((f: string) => path.basename(f, ".md")),
              retry,
            };

            const retrySummary = formatRetrySummary(retry);
            return {
              content: [
                {
                  type: "text",
                  text: `Reconciled pending commit for relationship \`${fromId}\` ${effectiveBidirectional ? "↔" : "→"} \`${toId}\` (${type})${retrySummary ? `\n${retrySummary}` : ""}`,
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

      // Apply writes (grouped by vault so same-vault notes share one commit)
      const vaultChanges = new Map<Vault, string[]>();
      for (const write of writes) {
        await write.vault.storage.writeNote({
          ...write.note,
          relatedTo: [...(write.note.relatedTo ?? []), write.relationship],
          updatedAt: now,
        });
        const files = vaultChanges.get(write.vault) ?? [];
        files.push(ctx.vaultManager.noteRelPath(write.vault, write.noteId));
        vaultChanges.set(write.vault, files);
      }

      const modifiedNoteIds: string[] = [];
      let retry: MutationRetryContract | undefined;
      for (const [vault, files] of vaultChanges) {
        const write = writes.find((w) => w.vault === vault);
        const commitBody = write
          ? formatCommitBody({
              noteId: write.noteId,
              noteTitle: write.note.title,
              projectName: write.note.projectName,
              relationship: { fromId, toId, type },
            })
          : undefined;
        const commitMessage = `relate: ${fromNote.title} ↔ ${toNote.title}`;
        const commitStatus = await commitVaultWithProtection({
          ctx,
          vault,
          commitMessage,
          files,
          commitBody,
          allowProtectedBranch,
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

      const dirStr = effectiveBidirectional ? "↔" : "→";
      const structuredContent: RelateResult = {
        action: "related",
        fromId,
        toId,
        type,
        bidirectional: effectiveBidirectional,
        notesModified: modifiedNoteIds,
        retry,
      };

      const retrySummary = formatRetrySummary(retry);
      invalidateActiveProjectCache();
      const supersededHint =
        passiveSupersedes && modifiedNoteIds.length > 0
          ? ` (\`${toId}\` is now marked as superseded by \`${fromId}\` and is a prune-superseded candidate)`
          : "";
      return {
        content: [
          {
            type: "text",
            text: `Linked \`${fromId}\` ${dirStr} \`${toId}\` (${type})${supersededHint}${retrySummary ? `\n${retrySummary}` : ""}`,
          },
        ],
        structuredContent,
      };
    },
  );
}
