import type { Note, NoteLifecycle, NoteRole } from "../storage.js";
import type { ServerContext } from "../server-context.js";
import type { Vault } from "../vault.js";
import type { PersistenceStatus } from "../structured-content.js";
import { getOrBuildVaultNoteList } from "../cache.js";
import { resolveProject } from "./project.js";
import { formatCommitBody, commitVaultWithProtection, checkVaultProtectedBranch } from "./git-commit.js";
import { pushAfterMutation, buildMutationRetryContract, buildPersistenceStatus } from "./persistence.js";
import { ProtectedBranchError } from "../domain-errors.js";
import { filterRelationships } from "../consolidate.js";
import { summarizePreview } from "../project-introspection.js";


export type SearchScope = "project" | "global" | "all";
export type StorageScope = "project-vault" | "main-vault" | "any" | "attached";

export type NoteEntry = {
  note: Note;
  vault: Vault;
};

export function storageLabel(vault: Vault): string {
  if (vault.provenance === "main") return "main-vault";
  if (vault.provenance === "project-local") {
    if (vault.vaultFolderName === ".mnemonic") return "project-vault";
    return `sub-vault:${vault.vaultFolderName}`;
  }
  const ref = vault.attachmentRef;
  if (!ref) return `attached:unknown/${vault.vaultFolderName}`;
  return `attached:${ref.projectSlug}/${vault.vaultFolderName}`;
}

export function vaultMatchesStorageScope(vault: Vault, storedIn: StorageScope): boolean {
  if (storedIn === "any") return true;
  if (storedIn === "main-vault") return vault.provenance === "main";
  if (storedIn === "attached") return vault.provenance === "project-attached";
  // "project-vault" matches only project-local vaults (not attached)
  return vault.provenance === "project-local";
}

export function attachedVaultErrorMessage(id: string, vault: Vault): string {
  const label = storageLabel(vault);
  if (vault.writable) {
    return `Memory '${id}' is in an attached vault (${label}) that is not currently mutable. This may be due to a protected branch or access restriction.`;
  }
  return `Memory '${id}' is in an attached vault (${label}) and cannot be modified. Attached vaults are read-only.`;
}

export async function collectVisibleNotes(
  ctx: ServerContext,
  cwd?: string,
  scope: SearchScope = "all",
  tags?: string[],
  storedIn: StorageScope = "any",
  sessionProjectId?: string,
): Promise<{ project: Awaited<ReturnType<typeof resolveProject>>; entries: NoteEntry[] }> {
  const project = await resolveProject(ctx, cwd);
  const projectId = project?.id;
  const vaults = await ctx.vaultManager.searchOrder(cwd, projectId);

  let filterProject: string | null | undefined = undefined;
  if (scope === "project" && project) filterProject = project.id;
  else if (scope === "global") filterProject = null;

  const seen = new Set<string>();
  const entries: NoteEntry[] = [];

  for (const vault of vaults) {
    // Attached vaults are project-scoped; exclude them from global scope
    if (scope === "global" && vault.provenance === "project-attached") continue;

    const includeAllForScope = vault.provenance === "project-attached" && filterProject !== null && filterProject !== undefined;
    const effectiveFilter = includeAllForScope ? undefined : filterProject;

    let rawNotes: Note[];
    if (sessionProjectId) {
      const cached = await getOrBuildVaultNoteList(sessionProjectId, vault);
      if (cached !== undefined) {
        rawNotes = effectiveFilter !== undefined
          ? cached.filter((n) => effectiveFilter === null ? !n.project : n.project === effectiveFilter)
          : cached;
      } else {
        rawNotes = await vault.storage.listNotes(
          effectiveFilter !== undefined ? { project: effectiveFilter } : undefined
        );
      }
    } else {
      rawNotes = await vault.storage.listNotes(
        effectiveFilter !== undefined ? { project: effectiveFilter } : undefined
      );
    }
    for (const note of rawNotes) {
      const key = `${note.id}::${vault.storage.vaultPath}`;
      if (seen.has(key)) {
        continue;
      }
      if (tags && tags.length > 0) {
        const noteTags = new Set(note.tags);
        if (!tags.every((tag) => noteTags.has(tag))) {
          continue;
        }
      }
      if (storedIn !== "any" && !vaultMatchesStorageScope(vault, storedIn)) {
        continue;
      }
      seen.add(key);
      entries.push({ note, vault });
    }
  }

  entries.sort((a, b) => {
    const aRank = project && a.note.project === project.id ? 0 : a.note.project ? 1 : 2;
    const bRank = project && b.note.project === project.id ? 0 : b.note.project ? 1 : 2;
    return aRank - bRank || a.note.title.localeCompare(b.note.title);
  });

  return { project, entries };
}

export function formatListEntry(
  entry: NoteEntry,
  options: { includeRelations?: boolean; includePreview?: boolean; includeStorage?: boolean; includeUpdated?: boolean } = {}
): string {
  const { note, vault } = entry;
  const proj = note.project ? `[${note.projectName ?? note.project}]` : "[global]";
  const extras: string[] = [];
  if (note.tags.length > 0) extras.push(note.tags.join(", "));
  extras.push(`lifecycle: ${note.lifecycle}`);
  if (note.role) extras.push(`role: ${note.role}`);
  if (options.includeStorage) extras.push(`stored: ${storageLabel(vault)}`);
  if (options.includeUpdated) extras.push(`updated: ${note.updatedAt}`);
  const lines = [`- **${note.title}** \`${note.id}\` ${proj}${extras.length > 0 ? ` — ${extras.join(" | ")}` : ""}`];
  if (options.includeRelations && note.relatedTo && note.relatedTo.length > 0) {
    lines.push(`  related: ${note.relatedTo.map((rel) => `${rel.id} (${rel.type})`).join(", ")}`);
  }
  if (options.includePreview) {
    lines.push(`  preview: ${summarizePreview(note.content)}`);
  }
  return lines.join("\n");
}

export async function formatProjectPolicyLine(ctx: ServerContext, projectId?: string): Promise<string> {
  if (!projectId) {
    return "Policy: none";
  }
  const policy = await ctx.configStore.getProjectPolicy(projectId);
  if (!policy) {
    return "Policy: none (fallback write scope with cwd is project)";
  }
  return `Policy: default write scope ${policy.defaultScope} (updated ${policy.updatedAt})`;
}

export const ROLE_LIFECYCLE_DEFAULTS = {
  research: "temporary",
  plan: "temporary",
  review: "temporary",
  context: "temporary",
  decision: "permanent",
  summary: "permanent",
  reference: "permanent",
} as const satisfies Record<NoteRole, NoteLifecycle>;

export async function ensureAttachmentsLoaded(ctx: ServerContext, projectId: string): Promise<void> {
  const existing = ctx.vaultManager.getAttachmentsForProject(projectId);
  if (existing.length > 0) return;

  const configs = await ctx.configStore.getProjectAttachments(projectId);
  if (configs.length === 0) return;

  ctx.vaultManager.setAttachmentConfigs(projectId, configs);
  await ctx.vaultManager.loadAttachmentsForProject(projectId);
}

export function projectNotFoundResponse(cwd: string) {
  return { content: [{ type: "text" as const, text: `Could not detect a project for: ${cwd}` }], isError: true as const };
}

export async function moveNoteBetweenVaults(
  ctx: ServerContext,
  found: { note: Note; vault: Vault },
  targetVault: Vault,
  noteToWrite?: Note,
  cwd?: string,
  allowProtectedBranch: boolean = false,
  targetProjectId?: string,
): Promise<{ note: Note; persistence: PersistenceStatus }> {
  const { note, vault: sourceVault } = found;
  const finalNote = noteToWrite ?? note;
  const embedding = await sourceVault.storage.readEmbedding(note.id);

  const preChecks = await Promise.all([
    checkVaultProtectedBranch({ ctx, vault: sourceVault, allowProtectedBranch, toolName: "move_memory", noteProjectId: note.project ?? undefined }),
    checkVaultProtectedBranch({ ctx, vault: targetVault, allowProtectedBranch, toolName: "move_memory", noteProjectId: (targetVault.provenance === "project-local" ? (targetProjectId ?? note.project) : undefined) }),
  ]);

  for (const check of preChecks) {
    if (check.blocked) {
      throw new ProtectedBranchError(check.message ?? undefined);
    }
  }

  await targetVault.storage.writeNote(finalNote);
  if (embedding) {
    await targetVault.storage.writeEmbedding(embedding);
  }

  await sourceVault.storage.deleteNote(note.id);

  const sourceVaultLabel = storageLabel(sourceVault);
  const targetVaultLabel = storageLabel(targetVault);

  const targetCommitBody = formatCommitBody({
    summary: `Moved from ${sourceVaultLabel} to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  const targetCommitMessage = `move: ${finalNote.title}`;
  const targetCommitFiles = [ctx.vaultManager.noteRelPath(targetVault, finalNote.id)];
  const targetCommit = await commitVaultWithProtection({
    ctx,
    vault: targetVault,
    commitMessage: targetCommitMessage,
    files: targetCommitFiles,
    commitBody: targetCommitBody,
    allowProtectedBranch,
    toolName: "move_memory",
  });

  const sourceCommitBody = formatCommitBody({
    summary: `Moved to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  await commitVaultWithProtection({
    ctx,
    vault: sourceVault,
    commitMessage: `move: ${finalNote.title}`,
    files: [ctx.vaultManager.noteRelPath(sourceVault, finalNote.id)],
    commitBody: sourceCommitBody,
    allowProtectedBranch,
    toolName: "move_memory",
  });
  const targetPush = targetCommit.status === "committed"
    ? await pushAfterMutation(ctx, targetVault)
    : { status: "skipped" as const, reason: "commit-failed" as const };
  const retry = buildMutationRetryContract({
    commit: targetCommit,
    commitMessage: targetCommitMessage,
    commitBody: targetCommitBody,
    files: targetCommitFiles,
    cwd,
    vault: targetVault,
    mutationApplied: true,
  });
  if (sourceVault !== targetVault) {
    await pushAfterMutation(ctx, sourceVault);
  }

  return {
    note: finalNote,
    persistence: buildPersistenceStatus({
      storage: targetVault.storage,
      id: finalNote.id,
      embedding: embedding ? { status: "written" } : { status: "skipped", reason: "no-source-embedding" },
      commit: targetCommit,
      push: targetPush,
      commitMessage: targetCommitMessage,
      commitBody: targetCommitBody,
      retry,
    }),
  };
}

export async function removeRelationshipsToNoteIds(ctx: ServerContext, noteIds: string[]): Promise<Map<Vault, string[]>> {
  const vaultChanges = new Map<Vault, string[]>();

  await Promise.all(
    ctx.vaultManager.allKnownVaultsMutable().map(async (vault) => {
      const notes = await vault.storage.listNotes();
      await Promise.all(
        notes.map(async (note) => {
          const filtered = filterRelationships(note.relatedTo, noteIds);
          if (filtered === note.relatedTo) {
            return;
          }

          await vault.storage.writeNote({
            ...note,
            relatedTo: filtered,
          });
          addVaultChange(vaultChanges, vault, ctx.vaultManager.noteRelPath(vault, note.id));
        }),
      );
    }),
  );

  return vaultChanges;
}

export function addVaultChange(vaultChanges: Map<Vault, string[]>, vault: Vault, file: string): void {
  const files = vaultChanges.get(vault) ?? [];
  if (!files.includes(file)) {
    files.push(file);
    vaultChanges.set(vault, files);
  }
}