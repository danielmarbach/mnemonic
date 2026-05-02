import { z } from "zod";
import { detectProject, resolveProjectIdentity, type ProjectIdentityResolution } from "../project.js";
import type { ServerContext } from "../server-context.js";
import type { ProjectRef } from "../structured-content.js";
import type { Vault } from "../vault.js";
import type { WriteScope } from "../project-memory-policy.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { checkBranchChange } from "../branch-tracker.js";
import { backfillEmbeddingsAfterSync } from "./embed.js";

export const projectParam = z
  .string()
  .optional()
  .describe(
    "Absolute project working directory. Pass this whenever the task is project-related so routing, search boosting, policy, and vault selection work correctly."
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
      console.error(`[branch] Main vault embedded ${backfill.embedded} notes`);
      return result;
    }),
    projectVault
      ? projectVault.git.sync().then(async (result) => {
          console.error(`[branch] Project vault sync: ${JSON.stringify(result)}`);
          const backfill = await backfillEmbeddingsAfterSync(ctx, projectVault.storage, "project vault", [], true);
          console.error(`[branch] Project vault embedded ${backfill.embedded} notes`);
          return result;
        })
      : Promise.resolve(undefined),
  ]);

  invalidateActiveProjectCache();

  return true;
}