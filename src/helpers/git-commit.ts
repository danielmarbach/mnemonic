import { getCurrentGitBranch } from "../project.js";
import {
  isProtectedBranch,
  resolveProtectedBranchBehavior,
  resolveProtectedBranchPatterns,
  type WriteScope,
  type ProjectMemoryPolicy,
} from "../project-memory-policy.js";
import type { ServerContext } from "../server-context.js";
import type { Vault } from "../vault.js";
import type { CommitResult } from "../git.js";
import path from "node:path";
import { expandHomePath } from "../paths.js";

export function extractSummary(content: string, maxLength = 100): string {
  const normalized = content.replace(/\s+/g, " ").trim();

  const sentenceMatch = normalized.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch) {
    const sentence = sentenceMatch[0].trim();
    if (sentence.length <= maxLength) {
      return sentence;
    }
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return normalized.slice(0, maxLength - 3) + "...";
}

export interface CommitBodyOptions {
  noteId?: string;
  noteTitle?: string;
  noteIds?: string[];
  projectName?: string;
  projectId?: string;
  scope?: "project" | "global";
  tags?: string[];
  relationship?: { fromId: string; toId: string; type: string };
  mode?: string;
  count?: number;
  summary?: string;
  description?: string;
}

export function formatCommitBody(options: CommitBodyOptions): string {
  const lines: string[] = [];

  if (options.summary) {
    lines.push(options.summary);
    lines.push("");
  }

  if (options.noteId && options.noteTitle) {
    lines.push(`- Note: ${options.noteId} (${options.noteTitle})`);
  }

  if (options.noteIds && options.noteIds.length > 0) {
    if (options.noteIds.length === 1 && !options.noteId) {
      lines.push(`- Note: ${options.noteIds[0]}`);
    } else if (options.noteIds.length > 1) {
      lines.push(`- Notes: ${options.noteIds.length} notes affected`);
      options.noteIds.forEach((id) => lines.push(`  - ${id}`));
    }
  }

  if (options.count && !options.noteIds) {
    lines.push(`- Count: ${options.count} items`);
  }

  if (options.projectName) {
    lines.push(`- Project: ${options.projectName}`);
  }

  if (options.scope) {
    lines.push(`- Scope: ${options.scope}`);
  }

  if (options.tags && options.tags.length > 0) {
    lines.push(`- Tags: ${options.tags.join(", ")}`);
  }

  if (options.relationship) {
    lines.push(
      `- Relationship: ${options.relationship.fromId} ${options.relationship.type} ${options.relationship.toId}`,
    );
  }

  if (options.mode) {
    lines.push(`- Mode: ${options.mode}`);
  }

  if (options.description) {
    lines.push("");
    lines.push(options.description);
  }

  return lines.join("\n");
}

export function formatAskForWriteScope(
  project: { id: string; name: string } | null | undefined,
  unadopted: boolean = false,
): string {
  const projectLabel = project ? `${project.name} (${project.id})` : "this context";
  const header = unadopted
    ? `No memory policy set for ${projectLabel} and this project hasn't adopted mnemonic yet.`
    : `Project memory policy for ${projectLabel} is set to always ask.`;
  return [
    header,
    "Choose where to store this memory and call `remember` again with one of:",
    '- `scope: "project"` — create `.mnemonic/` in this repo and store there (adopts mnemonic)',
    '- `scope: "global"` — private main vault with project association',
    "",
    "To avoid being asked again: call `set_project_memory_policy` with your preferred scope.",
  ].join("\n");
}

export function formatAskForProtectedBranch(
  projectLabel: string,
  branch: string,
  patterns: string[],
  toolName: string,
): string {
  return [
    `Protected branch check for ${projectLabel}: current branch \`${branch}\` matches ${patterns.join(", ")}.`,
    "Choose how to proceed:",
    `- One-time override: call \`${toolName}\` again with \`allowProtectedBranch: true\``,
    '- Persist policy: call `set_project_memory_policy` with `protectedBranchBehavior: "block"`',
    '- Persist policy: call `set_project_memory_policy` with `protectedBranchBehavior: "allow"`',
    "",
    "Optional: set `protectedBranchPatterns` to customize which branches are protected.",
  ].join("\n");
}

export function formatProtectedBranchBlocked(
  projectLabel: string,
  branch: string,
  patterns: string[],
  toolName: string,
): string {
  return [
    `Auto-commit blocked for ${projectLabel}: current branch \`${branch}\` matches protected patterns ${patterns.join(", ")}.`,
    'Policy is set to `protectedBranchBehavior: "block"`.',
    `To proceed once, call \`${toolName}\` again with \`allowProtectedBranch: true\`.`,
    'To change the default, call `set_project_memory_policy` with `protectedBranchBehavior: "allow"`.',
  ].join("\n");
}

export async function shouldBlockProtectedBranchCommit(options: {
  ctx: ServerContext;
  cwd?: string;
  writeScope: WriteScope;
  automaticCommit: boolean;
  projectLabel: string;
  policy: ProjectMemoryPolicy | undefined;
  allowProtectedBranch: boolean;
  toolName: string;
}): Promise<{ blocked: boolean; message?: string }> {
  const { cwd, writeScope, automaticCommit, projectLabel, policy, allowProtectedBranch, toolName } =
    options;
  if (!cwd || writeScope !== "project" || !automaticCommit) {
    return { blocked: false };
  }

  const branch = await getCurrentGitBranch(cwd);
  if (!branch) {
    return { blocked: false };
  }

  const patterns = resolveProtectedBranchPatterns(policy);
  if (!isProtectedBranch(branch, patterns) || allowProtectedBranch) {
    return { blocked: false };
  }

  const behavior = resolveProtectedBranchBehavior(policy);
  if (behavior === "allow") {
    return { blocked: false };
  }

  const message =
    behavior === "block"
      ? formatProtectedBranchBlocked(projectLabel, branch, patterns, toolName)
      : formatAskForProtectedBranch(projectLabel, branch, patterns, toolName);
  return { blocked: true, message };
}

export async function wouldRelationshipCleanupTouchProjectVault(
  ctx: ServerContext,
  noteIds: string[],
): Promise<boolean> {
  const noteIdSet = new Set(noteIds);
  for (const vault of ctx.vaultManager.allKnownVaultsMutable()) {
    if (vault.provenance !== "project-local") {
      continue;
    }

    const notes = await vault.storage.listNotes();
    for (const note of notes) {
      if ((note.relatedTo ?? []).some((rel) => noteIdSet.has(rel.id))) {
        return true;
      }
    }
  }

  return false;
}

export async function commitVaultWithProtection(options: {
  ctx: ServerContext;
  vault: Vault;
  commitMessage: string;
  files: string[];
  commitBody?: string;
  allowProtectedBranch: boolean;
  toolName: string;
  noteProjectId?: string;
}): Promise<CommitResult> {
  const {
    ctx,
    vault,
    commitMessage,
    files,
    commitBody,
    allowProtectedBranch,
    toolName,
    noteProjectId,
  } = options;

  if (!vault.writable) {
    return { status: "failed", reason: "error", error: "Vault is read-only." };
  }

  if (vault.provenance === "main") {
    return vault.git.commitWithStatus(commitMessage, files, commitBody);
  }

  const vaultPath = vault.storage.vaultPath;

  const vaultCwd =
    vault.provenance === "project-local"
      ? path.resolve(vaultPath, "..")
      : vault.attachmentRef
        ? expandHomePath(vault.attachmentRef.localPath)
        : vaultPath;

  const projectId =
    vault.provenance === "project-local" ? noteProjectId : vault.attachmentRef?.projectSlug;

  const policy = projectId ? await ctx.configStore.getProjectPolicy(projectId) : undefined;

  const projectLabel =
    vault.provenance === "project-attached" && vault.attachmentRef
      ? `${vault.attachmentRef.projectName} (${vault.attachmentRef.projectSlug})`
      : "this context";

  const skipCheck = !policy && vault.provenance === "project-attached";
  if (!skipCheck) {
    const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
      ctx,
      cwd: vaultCwd,
      writeScope: "project",
      automaticCommit: true,
      projectLabel,
      policy,
      allowProtectedBranch,
      toolName,
    });

    if (protectedBranchCheck.blocked) {
      return {
        status: "failed",
        reason: "error",
        error: protectedBranchCheck.message ?? "Protected branch policy blocked this commit.",
      };
    }
  }

  return vault.git.commitWithStatus(commitMessage, files, commitBody);
}

export async function checkVaultProtectedBranch(options: {
  ctx: ServerContext;
  vault: Vault;
  allowProtectedBranch: boolean;
  toolName: string;
  noteProjectId?: string;
}): Promise<{ blocked: boolean; message?: string }> {
  const { ctx, vault, allowProtectedBranch, toolName, noteProjectId } = options;

  if (!vault.writable || vault.provenance === "main") {
    return { blocked: false };
  }

  const vaultPath = vault.storage.vaultPath;

  const vaultCwd =
    vault.provenance === "project-local"
      ? path.resolve(vaultPath, "..")
      : vault.attachmentRef
        ? expandHomePath(vault.attachmentRef.localPath)
        : undefined;

  if (!vaultCwd) {
    return { blocked: false };
  }

  const projectId =
    vault.provenance === "project-local" ? noteProjectId : vault.attachmentRef?.projectSlug;

  const policy = projectId ? await ctx.configStore.getProjectPolicy(projectId) : undefined;

  const projectLabel =
    vault.provenance === "project-attached" && vault.attachmentRef
      ? `${vault.attachmentRef.projectName} (${vault.attachmentRef.projectSlug})`
      : "this context";

  const skipCheck = !policy && vault.provenance === "project-attached";
  if (skipCheck) {
    return { blocked: false };
  }

  return shouldBlockProtectedBranchCommit({
    ctx,
    cwd: vaultCwd,
    writeScope: "project",
    automaticCommit: true,
    projectLabel,
    policy,
    allowProtectedBranch,
    toolName,
  });
}
