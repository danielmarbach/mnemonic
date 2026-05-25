import { z } from "zod";
import path from "path";
import { simpleGit } from "simple-git";
import { detectProject, resolveProjectIdentity, type ProjectIdentityResolution } from "../project.js";
import type { ServerContext } from "../server-context.js";
import type { ProjectRef } from "../structured-content.js";
import type { Vault } from "../vault.js";
import type { WriteScope } from "../project-memory-policy.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { checkBranchChange } from "../branch-tracker.js";
import { backfillEmbeddingsAfterSync, removeStaleEmbeddings } from "./embed.js";
import { expandHomePath } from "../paths.js";
import { attempt as attemptFn, getErrorMessage } from "../error-utils.js";

export const projectParam = z
  .string()
  .optional()
  .describe(
    "Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting."
  );

export async function resolveProject(ctx: ServerContext, cwd?: string) {
  if (!cwd) return undefined;
  return detectProject(cwd, {
    getProjectIdentityOverride: async (projectId) => ctx.configStore.getProjectIdentityOverride(projectId),
  });
}

export function toProjectRef(project?: { id: string; name: string } | null): ProjectRef | undefined {
  return project ? { id: project.id, name: project.name } : undefined;
}

export function noteProjectRef(note: { project?: string; projectName?: string }): ProjectRef | undefined {
  if (!note.project || !note.projectName) {
    return undefined;
  }

  return {
    id: note.project,
    name: note.projectName,
  };
}

export async function resolveProjectIdentityForCwd(ctx: ServerContext, cwd?: string): Promise<ProjectIdentityResolution | undefined> {
  if (!cwd) return undefined;
  const identity = await resolveProjectIdentity(cwd, {
    getProjectIdentityOverride: async (projectId) => ctx.configStore.getProjectIdentityOverride(projectId),
  });
  return identity ?? undefined;
}

export async function resolveWriteVault(ctx: ServerContext, cwd: string | undefined, scope: WriteScope): Promise<Vault> {
  if (scope === "project") {
    return cwd
      ? (await ctx.vaultManager.getOrCreateProjectVault(cwd)) ?? ctx.vaultManager.main
      : ctx.vaultManager.main;
  }

  return ctx.vaultManager.main;
}

export function describeProject(project: Awaited<ReturnType<typeof resolveProject>>): string {
  return project ? `project '${project.name}' (${project.id})` : "global";
}

export async function ensureBranchSynced(ctx: ServerContext, cwd?: string): Promise<boolean> {
  if (!cwd) return false;

  const previousBranch = await checkBranchChange(cwd);
  if (!previousBranch) return false;

  console.error(`[branch] Detected branch change from '${previousBranch}' — auto-syncing`);

  const projectVault = await ctx.vaultManager.getProjectVaultIfExists(cwd);

  await Promise.all([
    ctx.vaultManager.main.git.sync().then(async (result) => {
      console.error(`[branch] Main vault sync: ${JSON.stringify(result)}`);
      const backfill = await backfillEmbeddingsAfterSync(ctx, ctx.vaultManager.main.storage, "main vault", [], true);
      console.error(`[branch] Main vault embedded ${backfill.embedded} notes${backfill.failed.length > 0 ? `, ${backfill.failed.length} failed (e.g. "${backfill.failed[0]!.error}")` : ""}`);
      return result;
    }),
    projectVault
      ? projectVault.git.sync().then(async (result) => {
          console.error(`[branch] Project vault sync: ${JSON.stringify(result)}`);
          const backfill = await backfillEmbeddingsAfterSync(ctx, projectVault.storage, "project vault", [], true);
          console.error(`[branch] Project vault embedded ${backfill.embedded} notes${backfill.failed.length > 0 ? `, ${backfill.failed.length} failed (e.g. "${backfill.failed[0]!.error}")` : ""}`);
          return result;
        })
      : Promise.resolve(undefined),
  ]);

  const project = await resolveProject(ctx, cwd);
  if (project) {
    await syncAttachedVaultsOnBranchChange(ctx, project.id);
  }

  invalidateActiveProjectCache();

  return true;
}

async function syncAttachedVaultsOnBranchChange(ctx: ServerContext, projectId: string): Promise<void> {
  const attachmentConfigs = await ctx.configStore.getProjectAttachments(projectId);
  const enabledAttachments = attachmentConfigs.filter(a => a.enabled && a.branch);
  if (enabledAttachments.length === 0) return;

  for (const attConfig of enabledAttachments) {
    const label = `attached:${attConfig.projectSlug}`;
    const resolvedLocalPath = path.resolve(expandHomePath(attConfig.localPath));
    const fetchResult = await attemptFn("branch-sync:attachment-fetch", async () => {
      const git = simpleGit(resolvedLocalPath);
      await git.fetch("origin");
      const newTipResult = await git.raw(["rev-parse", attConfig.branch]).catch(() => null);
      return newTipResult?.trim() ?? "";
    });

    if (!fetchResult.ok) {
      console.error(`[branch] ${label}: fetch failed — ${getErrorMessage(fetchResult.error)}`);
      continue;
    }

    const newTip = fetchResult.value;
    if (newTip && newTip !== attConfig.branchTipHash) {
      const updatedConfigs = attachmentConfigs.map(a =>
        a.projectSlug === attConfig.projectSlug
          ? { ...a, branchTipHash: newTip, updatedAt: new Date().toISOString() }
          : a
      );
      await ctx.configStore.setProjectAttachments(projectId, updatedConfigs);
      ctx.vaultManager.clearAttachmentCaches();
      ctx.vaultManager.setAttachmentConfigs(projectId, updatedConfigs);
      const loadedVaults = await ctx.vaultManager.loadAttachmentsForProject(projectId);
      const staleVault = loadedVaults.find(v => v.attachmentRef?.projectSlug === attConfig.projectSlug);
      if (staleVault) {
        const currentIds = new Set((await staleVault.storage.listNoteIds()).map(id => id as string));
        const allEmbeddings = await staleVault.storage.listEmbeddings();
        const staleIds = allEmbeddings
          .filter(e => !currentIds.has(e.id as string))
          .map(e => e.id as string);
        if (staleIds.length > 0) {
          await removeStaleEmbeddings(staleVault.storage, staleIds);
          console.error(`[branch] ${label}: removed ${staleIds.length} stale embedding(s).`);
        }
      }
      console.error(`[branch] ${label}: branch tip changed (${attConfig.branchTipHash.substring(0, 8)} → ${newTip.substring(0, 8)}), cache invalidated.`);
    }
  }
}