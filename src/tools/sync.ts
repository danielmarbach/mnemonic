import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import {
  SyncResultSchema,
  type SyncResult as StructuredSyncResult,
} from "../structured-content.js";
import type { SyncResult } from "../git.js";
import { projectParam } from "../helpers/project.js";
import { invalidateActiveProjectCache } from "../cache.js";
import {
  backfillEmbeddingsAfterSync,
  removeStaleEmbeddings,
} from "../helpers/embed.js";

function formatSyncResult(result: SyncResult, label: string, vaultPath?: string): string[] {
  if (!result.hasRemote) return [`${label}: no remote configured — git sync skipped.`];
  const lines: string[] = [];

  if (result.gitError) {
    const { phase, message, isConflict } = result.gitError;
    if (isConflict) {
      lines.push(`${label}: ✗ merge conflict during ${phase}.`);
      if (result.gitError.conflictFiles.length > 0) {
        lines.push(`${label}: conflicted files: ${result.gitError.conflictFiles.join(", ")}`);
      }
      const where = vaultPath ?? label;
      lines.push(`${label}: resolve conflicts in ${where}, then run sync again.`);
    } else {
      lines.push(`${label}: ✗ git ${phase} failed: ${message}`);
    }
    // Still report any partial pull results that came through before the failure
    if (result.pulledNoteIds.length > 0)
      lines.push(`${label}: ↓ ${result.pulledNoteIds.length} note(s) pulled before failure.`);
    return lines;
  }

  lines.push(result.pushedCommits > 0
    ? `${label}: ↑ pushed ${result.pushedCommits} commit(s).`
    : `${label}: ↑ nothing to push.`);
  if (result.deletedNoteIds.length > 0)
    lines.push(`${label}: ✕ ${result.deletedNoteIds.length} note(s) deleted on remote.`);
  lines.push(result.pulledNoteIds.length > 0
    ? `${label}: ↓ ${result.pulledNoteIds.length} note(s) pulled.`
    : `${label}: ↓ no new notes from remote.`);
  return lines;
}

export function registerSyncTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "sync",
    {
      title: "Sync",
      description:
        "Sync mnemonic vaults with their git remotes and repair local embedding coverage as needed.\n\n" +
        "Use this when:\n" +
        "- You want the local vault state aligned with remote changes\n" +
        "- You suspect another machine or collaborator updated the vaults\n\n" +
        "Do not use this when:\n" +
        "- You only need to inspect or edit a single memory\n\n" +
        "Returns:\n" +
        "- Per-vault pull/push results, deletions, additions, and embedding rebuild info\n\n" +
        "Side effects: performs git sync and may rebuild local embeddings.\n\n" +
        "Typical next step:\n" +
        "- Use `recent_memories`, `list`, or `recall` to inspect newly synced changes.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({
        cwd: projectParam,
        force: z.boolean().optional().default(false).describe("Rebuild all embeddings even if the current model already generated them"),
      }),
      outputSchema: SyncResultSchema,
    },
    async ({ cwd, force }) => {
      const lines: string[] = [];
      const vaultResults: Array<StructuredSyncResult["vaults"][number]> = [];

      // Always sync main vault
      const mainVaultPath = ctx.vaultManager.main.storage.vaultPath;
      const mainResult = await ctx.vaultManager.main.git.sync();
      lines.push(...formatSyncResult(mainResult, "main vault", mainVaultPath));
      let mainEmbedded = 0;
      let mainFailed: string[] = [];
      const mainBackfill = await backfillEmbeddingsAfterSync(ctx, ctx.vaultManager.main.storage, "main vault", lines, force);
      mainEmbedded = mainBackfill.embedded;
      mainFailed = mainBackfill.failed;
      if (mainResult.deletedNoteIds.length > 0) {
        await removeStaleEmbeddings(ctx.vaultManager.main.storage, mainResult.deletedNoteIds);
      }
      vaultResults.push({
        vault: "main",
        hasRemote: mainResult.hasRemote,
        pulled: mainResult.pulledNoteIds.length,
        deleted: mainResult.deletedNoteIds.length,
        pushed: mainResult.pushedCommits,
        embedded: mainEmbedded,
        failed: mainFailed,
        gitError: mainResult.gitError,
      });

      // Optionally sync project vault
      if (cwd) {
        const projectVault = await ctx.vaultManager.getProjectVaultIfExists(cwd);
        if (projectVault) {
          const projectVaultPath = projectVault.storage.vaultPath;
          const projectResult = await projectVault.git.sync();
          lines.push(...formatSyncResult(projectResult, "project vault", projectVaultPath));
          let projEmbedded = 0;
          let projFailed: string[] = [];
          const projectBackfill = await backfillEmbeddingsAfterSync(ctx, projectVault.storage, "project vault", lines, force);
          projEmbedded = projectBackfill.embedded;
          projFailed = projectBackfill.failed;
          if (projectResult.deletedNoteIds.length > 0) {
            await removeStaleEmbeddings(projectVault.storage, projectResult.deletedNoteIds);
          }
          vaultResults.push({
            vault: "project",
            hasRemote: projectResult.hasRemote,
            pulled: projectResult.pulledNoteIds.length,
            deleted: projectResult.deletedNoteIds.length,
            pushed: projectResult.pushedCommits,
            embedded: projEmbedded,
            failed: projFailed,
            gitError: projectResult.gitError,
          });
        } else {
          lines.push("project vault: no .mnemonic/ found — skipped.");
        }
      }

      const structuredContent: StructuredSyncResult = {
        action: "synced",
        vaults: vaultResults,
      };

      // Vault contents may have changed via pull — discard session cache
      invalidateActiveProjectCache();
      return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
    }
  );
}
