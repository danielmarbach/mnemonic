import type { Note, NoteLifecycle, NoteRole } from "../storage.js";
import type { ServerContext } from "../server-context.js";
import type { Vault } from "../vault.js";
import type { ProjectRef } from "../structured-content.js";
import type { PersistenceStatus, MutationRetryContract } from "../structured-content.js";
import type { CommitResult } from "../git.js";
import { getOrBuildVaultNoteList } from "../cache.js";
import { resolveProject, describeProject } from "./project.js";
import { formatCommitBody } from "./git-commit.js";
import { pushAfterMutation, buildMutationRetryContract, buildPersistenceStatus } from "./persistence.js";
import { filterRelationships } from "../consolidate.js";
import { summarizePreview } from "../project-introspection.js";
import { embedModel } from "../embeddings.js";

export type SearchScope = "project" | "global" | "all";
export type StorageScope = "project-vault" | "main-vault" | "any";

export type NoteEntry = {
  note: Note;
  vault: Vault;
};

export function storageLabel(vault: Vault): string {
  if (!vault.isProject) return "main-vault";
  if (vault.vaultFolderName === ".mnemonic") return "project-vault";
  return `sub-vault:${vault.vaultFolderName}`;
}

export function vaultMatchesStorageScope(vault: Vault, storedIn: StorageScope): boolean {
  if (storedIn === "any") return true;
  if (storedIn === "main-vault") return !vault.isProject;
  return vault.isProject;
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
  const vaults = await ctx.vaultManager.searchOrder(cwd);

  let filterProject: string | null | undefined = undefined;
  if (scope === "project" && project) filterProject = project.id;
  else if (scope === "global") filterProject = null;

  const seen = new Set<string>();
  const entries: NoteEntry[] = [];

  for (const vault of vaults) {
    let rawNotes: Note[];
    if (sessionProjectId) {
      const cached = await getOrBuildVaultNoteList(sessionProjectId, vault);
      if (cached !== undefined) {
        rawNotes = filterProject !== undefined
          ? cached.filter((n) => filterProject === null ? !n.project : n.project === filterProject)
          : cached;
      } else {
        rawNotes = await vault.storage.listNotes(
          filterProject !== undefined ? { project: filterProject } : undefined
        );
      }
    } else {
      rawNotes = await vault.storage.listNotes(
        filterProject !== undefined ? { project: filterProject } : undefined
      );
    }
    for (const note of rawNotes) {
      if (seen.has(note.id)) {
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
      seen.add(note.id);
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

export function projectNotFoundResponse(cwd: string) {
  return { content: [{ type: "text" as const, text: `Could not detect a project for: ${cwd}` }], isError: true as const };
}

export async function moveNoteBetweenVaults(
  ctx: ServerContext,
  found: { note: Note; vault: Vault },
  targetVault: Vault,
  noteToWrite?: Note,
  cwd?: string,
): Promise<{ note: Note; persistence: PersistenceStatus }> {
  const { note, vault: sourceVault } = found;
  const finalNote = noteToWrite ?? note;
  const embedding = await sourceVault.storage.readEmbedding(note.id);

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
  const targetCommit = await targetVault.git.commitWithStatus(targetCommitMessage, targetCommitFiles, targetCommitBody);

  const sourceCommitBody = formatCommitBody({
    summary: `Moved to ${targetVaultLabel}`,
    noteId: finalNote.id,
    noteTitle: finalNote.title,
    projectName: finalNote.projectName,
  });
  await sourceVault.git.commitWithStatus(`move: ${finalNote.title}`, [ctx.vaultManager.noteRelPath(sourceVault, finalNote.id)], sourceCommitBody);
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
    ctx.vaultManager.allKnownVaults().map(async (vault) => {
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