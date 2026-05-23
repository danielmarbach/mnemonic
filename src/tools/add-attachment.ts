import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { simpleGit } from "simple-git";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import type { ProjectAttachmentConfig } from "../vault.js";
import { detectDefaultBranch } from "../attached-storage.js";
import { projectId } from "../brands.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import { pushAfterMutation as pushAfterMutationFromModule, buildMutationRetryContract, formatRetrySummary } from "../helpers/persistence.js";
import { AddAttachmentResultSchema, type AddAttachmentResult } from "../structured-content.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { attempt } from "../error-utils.js";

function normalizeRemote(remote: string): string {
  let s = remote.trim().toLowerCase();
  s = s.replace(/^git@/, "").replace(/:/, "/");
  s = s.replace(/^https?:\/\//, "").replace(/^ssh:\/\//, "");
  s = s.replace(/^[^@]*@/, "");
  s = s.replace(/\.git$/, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s;
}

function extractRepoName(remote: string): string {
  const match = remote.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? path.basename(remote);
}

export function registerAddAttachmentTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "add_attachment",
    {
      title: "Add Attachment",
      description:
        "Use this when:\n" +
        "- You want to attach an external repository's mnemonic vault to the current project\n" +
        "- You need read-only access to another project's memories\n\n" +
        "Do not use this when:\n" +
        "- You want to modify memories in another project (attachments are read-only)\n" +
        "- You want to move memories between vaults (use `move_memory`)\n\n" +
        "Returns: the new attachment config and activation status.\n\n" +
        "[mutating: writes config, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `list_attachments` to verify the attachment was added.\n" +
        "- Use `recall` with the project context to search across attached vaults.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: z.string().describe("Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting."),
        localPath: z.string().describe("Absolute path to the external repository to attach."),
        vaultFolder: z.string().optional().describe("Vault folder name within the attached repo (default: .mnemonic)"),
        branch: z.string().optional().describe("Git branch to read notes from in the attached repo (default: auto-detected)"),
      }),
      outputSchema: AddAttachmentResultSchema,
    },
    async ({ cwd, localPath, vaultFolder, branch }) => {
      const resolvedPath = path.resolve(localPath);
      if (!resolvedPath.startsWith("/")) {
        return { content: [{ type: "text", text: `Invalid path: ${localPath}. Must be an absolute path.` }], isError: true };
      }
      const folder = vaultFolder?.trim() || ".mnemonic";
      if (folder.includes("..") || !folder.startsWith(".mnemonic")) {
        return { content: [{ type: "text", text: `Invalid vault folder: ${folder}. Must start with .mnemonic and not contain ..` }], isError: true };
      }
      const pathCheck = await attempt("add-attachment:check-path", async () => {
        const stat = await fs.stat(resolvedPath);
        if (!stat.isDirectory()) {
          return { valid: false, reason: `Invalid path: ${resolvedPath}. Must be a directory.` };
        }
        return { valid: true, reason: "" };
      });
      if (!pathCheck.ok || !pathCheck.value.valid) {
        return { content: [{ type: "text", text: pathCheck.ok ? pathCheck.value.reason : `Invalid path: ${resolvedPath}. Path does not exist.` }], isError: true };
      }

      const notesDir = path.join(resolvedPath, folder, "notes");
      const accessCheck = await attempt("add-attachment:check-notes-dir", () => fs.access(notesDir));
      if (!accessCheck.ok) {
        return {
          content: [{ type: "text", text: `Cannot attach: no notes directory found at ${notesDir}. Ensure the repository has a ${folder}/notes/ directory.` }],
          isError: true,
        };
      }

      const project = await resolveProjectFromModule(ctx, cwd);
      if (!project) {
        return projectNotFoundResponse(cwd);
      }

      const git = simpleGit(resolvedPath);
      const remoteResult = await git.raw(["remote", "get-url", "origin"]).catch(() => null);
      if (!remoteResult?.trim()) {
        return {
          content: [{ type: "text", text: `Cannot attach: no 'origin' remote found at ${resolvedPath}. The repository must have an 'origin' remote.` }],
          isError: true,
        };
      }

      const remoteUrl = remoteResult.trim();
      const slug = normalizeRemote(remoteUrl);
      const name = extractRepoName(remoteUrl);

      const maxAttachments = await ctx.configStore.getMaxAttachmentsPerProject();
      const currentAttachments = await ctx.configStore.getProjectAttachments(project.id);
      const existingIndex = currentAttachments.findIndex(a => a.projectSlug === slug);
      if (existingIndex === -1 && currentAttachments.length >= maxAttachments) {
        return {
          content: [{ type: "text", text: `Cannot attach: project already has ${currentAttachments.length} attachment(s), maximum is ${maxAttachments}. Remove an existing attachment first.` }],
          isError: true,
        };
      }

      let effectiveBranch: string;
      if (branch !== undefined && branch.trim() !== "") {
        effectiveBranch = branch.trim();
      } else {
        effectiveBranch = await detectDefaultBranch(resolvedPath);
      }

      let branchTipHash = "";
      if (effectiveBranch) {
        const hashResult = await git.raw(["rev-parse", effectiveBranch]).catch(() => null);
        branchTipHash = hashResult?.trim() ?? "";
      }

      const now = new Date().toISOString();
      const config: ProjectAttachmentConfig = {
        projectSlug: slug,
        projectName: name,
        localPath: resolvedPath,
        vaultFolder: folder,
        enabled: true,
        branch: effectiveBranch,
        addedAt: existingIndex !== -1 ? currentAttachments[existingIndex]!.addedAt : now,
        updatedAt: now,
        branchTipHash,
      };

      let updatedAttachments: ProjectAttachmentConfig[];
      if (existingIndex !== -1) {
        updatedAttachments = [...currentAttachments];
        updatedAttachments[existingIndex] = config;
      } else {
        updatedAttachments = [...currentAttachments, config];
      }

      await ctx.configStore.setProjectAttachments(project.id, updatedAttachments);
      ctx.vaultManager.setAttachmentConfigs(project.id, updatedAttachments);
      ctx.vaultManager.clearAttachmentCaches();
      await ctx.vaultManager.loadAttachmentsForProject(project.id);
      invalidateActiveProjectCache();

      const commitBody = formatCommitBody({
        projectName: project.name,
        description: `Attached repository: ${name} (${slug})\nPath: ${resolvedPath}\nBranch: ${effectiveBranch || "(working-tree)"}`,
      });
      const commitMessage = `attachment: add ${name} to ${project.name}`;
      const commitFiles = ["config.json"];
      const commitStatus = await ctx.vaultManager.main.git.commitWithStatus(commitMessage, commitFiles, commitBody);
      const pushStatus = commitStatus.status === "committed"
        ? await pushAfterMutationFromModule(ctx, ctx.vaultManager.main)
        : { status: "skipped" as const, reason: "commit-failed" as const };
      const retry = buildMutationRetryContract({
        commit: commitStatus,
        commitMessage,
        commitBody,
        files: commitFiles,
        cwd,
        vault: ctx.vaultManager.main,
        mutationApplied: true,
      });

      let warnings: string[] = [];
      if (!effectiveBranch) {
        warnings.push("Branch is empty — attached vault will read from working tree (not recommended for production).");
      }

      const structuredContent: AddAttachmentResult = {
        action: "attachment_added",
        project: { id: project.id, name: project.name },
        attachment: {
          projectSlug: slug,
          projectName: name,
          localPath: resolvedPath,
          vaultFolder: folder,
          enabled: true,
          branch: effectiveBranch,
          branchTipHash,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        retry,
      };

      const branchDisplay = effectiveBranch || "(working-tree)";
      return {
        content: [{
          type: "text",
          text:
            `Attachment added to ${project.name}: ${name} (${slug}) at ${resolvedPath}, branch=${branchDisplay}` +
            (warnings.length > 0 ? `\nWarnings: ${warnings.join("; ")}` : "") +
            (commitStatus.status === "failed"
              ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
              : ""),
        }],
        structuredContent,
      };
    }
  );
}