import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { simpleGit } from "simple-git";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ServerContext } from "../server-context.js";
import type {
  ProjectAttachmentConfig,
  MnemonicVaultAttachmentConfig,
  DocumentSourceAttachmentConfig,
} from "../vault.js";
import { detectDefaultBranch } from "../attached-storage.js";
import { attachmentSlug, type AttachmentSlug } from "../brands.js";
import { resolveProject as resolveProjectFromModule } from "../helpers/project.js";
import { projectNotFoundResponse } from "../helpers/vault.js";
import { formatCommitBody } from "../helpers/git-commit.js";
import {
  pushAfterMutation as pushAfterMutationFromModule,
  buildMutationRetryContract,
  formatRetrySummary,
} from "../helpers/persistence.js";
import { AddAttachmentResultSchema, type AddAttachmentResult } from "../structured-content.js";
import { invalidateActiveProjectCache } from "../cache.js";
import { attempt } from "../error-utils.js";
import { expandHomePath, collapseHomePath } from "../paths.js";

function generateAttachmentId(): string {
  return crypto.randomUUID();
}

function normalizeRemote(remote: string): AttachmentSlug {
  let s = remote.trim().toLowerCase();
  s = s.replace(/^git@/, "").replace(/:/, "/");
  s = s.replace(/^https?:\/\//, "").replace(/^ssh:\/\//, "");
  s = s.replace(/^[^@]*@/, "");
  s = s.replace(/\.git$/, "");
  s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return attachmentSlug(s);
}

function extractRepoName(remote: string): string {
  const match = remote.match(/\/([^/]+?)(\.git)?$/);
  return match?.[1] ?? path.basename(remote);
}

const VALID_MEDIA_TYPE_PATTERN = /^[a-z][a-z0-9.!#$&'*+\-.^_|~]+\/[a-z][a-z0-9.!#$&'*+\-.^_|~]+$/;

const DEFAULT_DOCUMENT_EXCLUDE = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage",
];

export function registerAddAttachmentTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "add_attachment",
    {
      title: "Add Attachment",
      description:
        "Use this when:\n" +
        "- You want to attach an external repository's mnemonic vault to the current project\n" +
        "- You need read-only or write-through access to another project's memories\n" +
        "- You want to attach a document source (e.g., markdown files) for read-only retrieval\n\n" +
        "Do not use this when:\n" +
        "- You want to modify memories in another project without enabling write-through (set writable=false)\n" +
        "- You want to move memories between vaults (use `move_memory`)\n\n" +
        "Returns: the new attachment config and activation status. Includes kind (mnemonic-vault or document-source), attachmentId (persistent opaque identifier), and for document-source attachments: root, include/exclude globs, and acceptedMediaTypes.\n\n" +
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
        cwd: z
          .string()
          .describe(
            "Absolute path of the project working directory. Required for project-scoped routing, vault selection, and search boosting.",
          ),
        localPath: z.string().describe("Absolute path to the external repository to attach."),
        kind: z
          .enum(["mnemonic-vault", "document-source"])
          .optional()
          .default("mnemonic-vault")
          .describe(
            "Attachment kind: 'mnemonic-vault' for managed Mnemonic notes, 'document-source' for immutable repository documents.",
          ),
        // mnemonic-vault fields
        vaultFolder: z
          .string()
          .optional()
          .describe(
            "Vault folder name within the attached repo (default: .mnemonic). Only for mnemonic-vault attachments.",
          ),
        branch: z
          .string()
          .optional()
          .describe(
            "Git branch to read notes from in the attached repo (default: auto-detected). Only for mnemonic-vault attachments.",
          ),
        writable: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Whether this attachment supports write operations (default: false). Only for mnemonic-vault attachments.",
          ),
        pushBranch: z
          .string()
          .optional()
          .describe(
            "Git branch to push mutations to when writable. Only for mnemonic-vault attachments.",
          ),
        // document-source fields
        root: z
          .string()
          .optional()
          .describe(
            "Repository-relative POSIX path for document root (default: '.'). Only for document-source attachments.",
          ),
        include: z
          .array(z.string())
          .optional()
          .describe(
            "Glob patterns relative to root for files to include (default: ['**/*.md']). Only for document-source attachments.",
          ),
        exclude: z
          .array(z.string())
          .optional()
          .describe(
            "Glob patterns relative to root for files to exclude. Only for document-source attachments.",
          ),
        acceptedMediaTypes: z
          .array(z.string())
          .optional()
          .describe(
            "Canonical lower-case IANA base media types (default: ['text/markdown']). Only for document-source attachments.",
          ),
      }),
      outputSchema: AddAttachmentResultSchema,
    },
    async ({
      cwd,
      localPath,
      kind,
      vaultFolder,
      branch,
      writable,
      pushBranch,
      root,
      include,
      exclude,
      acceptedMediaTypes,
    }) => {
      const effectiveKind = kind ?? "mnemonic-vault";
      const expandedPath = expandHomePath(localPath);
      const resolvedPath = path.resolve(expandedPath);
      if (!path.isAbsolute(resolvedPath)) {
        return {
          content: [
            { type: "text", text: `Invalid path: ${localPath}. Must resolve to an absolute path.` },
          ],
          isError: true,
        };
      }

      const pathCheck = await attempt("add-attachment:check-path", async () => {
        const stat = await fs.stat(resolvedPath);
        if (!stat.isDirectory()) {
          return { valid: false, reason: `Invalid path: ${localPath}. Must be a directory.` };
        }
        return { valid: true, reason: "" };
      });
      if (!pathCheck.ok || !pathCheck.value.valid) {
        return {
          content: [
            {
              type: "text",
              text: pathCheck.ok
                ? pathCheck.value.reason
                : `Invalid path: ${localPath}. Path does not exist.`,
            },
          ],
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
          content: [
            {
              type: "text",
              text: `Cannot attach: no 'origin' remote found at ${resolvedPath}. The repository must have an 'origin' remote.`,
            },
          ],
          isError: true,
        };
      }

      const remoteUrl = remoteResult.trim();
      const slug = normalizeRemote(remoteUrl);
      const name = extractRepoName(remoteUrl);

      const maxAttachments = await ctx.configStore.getMaxAttachmentsPerProject();
      const currentAttachments = await ctx.configStore.getProjectAttachments(project.id);
      const existingIndex = currentAttachments.findIndex((a) => a.projectSlug === slug);
      if (existingIndex === -1 && currentAttachments.length >= maxAttachments) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot attach: project already has ${currentAttachments.length} attachment(s), maximum is ${maxAttachments}. Remove an existing attachment first.`,
            },
          ],
          isError: true,
        };
      }

      const now = new Date().toISOString();
      const attachmentId = generateAttachmentId();

      let config: ProjectAttachmentConfig;

      if (effectiveKind === "document-source") {
        // Validate document-source fields
        const effectiveRoot = root?.trim() || ".";
        if (
          effectiveRoot.startsWith("/") ||
          effectiveRoot.startsWith("..") ||
          effectiveRoot.includes("..")
        ) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid root: ${effectiveRoot}. Must be a repository-relative POSIX path.`,
              },
            ],
            isError: true,
          };
        }

        const effectiveInclude =
          include && include.length > 0
            ? include.filter((p) => p.trim().length > 0).map((p) => p.trim())
            : ["**/*.md"];

        const effectiveExclude = exclude ?? DEFAULT_DOCUMENT_EXCLUDE;

        const effectiveMediaTypes =
          acceptedMediaTypes && acceptedMediaTypes.length > 0
            ? acceptedMediaTypes
                .filter((mt) => VALID_MEDIA_TYPE_PATTERN.test(mt.trim().toLowerCase()))
                .map((mt) => mt.trim().toLowerCase())
            : ["text/markdown"];

        if (effectiveMediaTypes.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No valid accepted media types provided. At least one valid IANA media type is required.",
              },
            ],
            isError: true,
          };
        }

        const docConfig: DocumentSourceAttachmentConfig = {
          kind: "document-source",
          attachmentId,
          projectSlug: slug,
          projectName: name,
          localPath: collapseHomePath(resolvedPath),
          enabled: true,
          addedAt: existingIndex !== -1 ? (currentAttachments[existingIndex]?.addedAt ?? now) : now,
          updatedAt: now,
          root: effectiveRoot,
          include: effectiveInclude,
          exclude: effectiveExclude,
          acceptedMediaTypes: effectiveMediaTypes,
        };
        config = docConfig;
      } else {
        // mnemonic-vault validation
        const folder = vaultFolder?.trim() || ".mnemonic";
        if (folder.includes("..") || !folder.startsWith(".mnemonic")) {
          return {
            content: [
              {
                type: "text",
                text: `Invalid vault folder: ${folder}. Must start with .mnemonic and not contain ..`,
              },
            ],
            isError: true,
          };
        }

        const notesDir = path.join(resolvedPath, folder, "notes");
        const accessCheck = await attempt("add-attachment:check-notes-dir", () =>
          fs.access(notesDir),
        );
        if (!accessCheck.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Cannot attach: no notes directory found at ${notesDir}. Ensure the repository has a ${folder}/notes/ directory.`,
              },
            ],
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

        const vaultConfig: MnemonicVaultAttachmentConfig = {
          kind: "mnemonic-vault",
          attachmentId,
          projectSlug: slug,
          projectName: name,
          localPath: collapseHomePath(resolvedPath),
          vaultFolder: folder,
          enabled: true,
          branch: effectiveBranch,
          addedAt: existingIndex !== -1 ? (currentAttachments[existingIndex]?.addedAt ?? now) : now,
          updatedAt: now,
          branchTipHash,
          writable: writable ?? false,
          pushBranch: pushBranch ?? undefined,
        };
        config = vaultConfig;
      }

      let updatedAttachments: ProjectAttachmentConfig[];
      if (existingIndex !== -1) {
        updatedAttachments = [...currentAttachments];
        updatedAttachments[existingIndex] = config;
      } else {
        updatedAttachments = [...currentAttachments, config];
      }

      await ctx.configStore.setProjectAttachments(project.id, updatedAttachments);
      ctx.vaultManager.clearAttachmentCaches();
      ctx.vaultManager.setAttachmentConfigs(project.id, updatedAttachments);
      await ctx.vaultManager.loadAttachmentsForProject(project.id);
      invalidateActiveProjectCache();

      const commitBody = formatCommitBody({
        projectName: project.name,
        description: `Attached repository: ${name} (${slug})\nPath: ${resolvedPath}\nKind: ${effectiveKind}`,
      });
      const commitMessage = `attachment: add ${name} to ${project.name}`;
      const commitFiles = ["config.json"];
      const commitStatus = await ctx.vaultManager.main.git.commitWithStatus(
        commitMessage,
        commitFiles,
        commitBody,
      );
      const pushStatus =
        commitStatus.status === "committed"
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

      const warnings: string[] = [];

      const structuredContent: AddAttachmentResult = {
        action: "attachment_added",
        project: { id: project.id, name: project.name },
        attachment: {
          kind: effectiveKind,
          attachmentId,
          projectSlug: slug,
          projectName: name,
          localPath: resolvedPath,
          enabled: true,
          ...(effectiveKind === "mnemonic-vault"
            ? {
                vaultFolder: (config as MnemonicVaultAttachmentConfig).vaultFolder,
                branch: (config as MnemonicVaultAttachmentConfig).branch,
                branchTipHash: (config as MnemonicVaultAttachmentConfig).branchTipHash,
                writable: (config as MnemonicVaultAttachmentConfig).writable,
                pushBranch: (config as MnemonicVaultAttachmentConfig).pushBranch,
              }
            : {
                root: (config as DocumentSourceAttachmentConfig).root,
                include: (config as DocumentSourceAttachmentConfig).include,
                exclude: (config as DocumentSourceAttachmentConfig).exclude,
                acceptedMediaTypes: (config as DocumentSourceAttachmentConfig).acceptedMediaTypes,
              }),
        },
        warnings: warnings.length > 0 ? warnings : undefined,
        retry,
      };

      const kindDisplay = effectiveKind === "mnemonic-vault" ? "vault" : "document-source";
      return {
        content: [
          {
            type: "text",
            text:
              `${kindDisplay} attachment added to ${project.name}: ${name} (${slug}) at ${resolvedPath}` +
              (warnings.length > 0 ? `\nWarnings: ${warnings.join("; ")}` : "") +
              (commitStatus.status === "failed"
                ? `\n${formatRetrySummary(retry) ?? `Commit failed. Push status: ${pushStatus.status}.`}`
                : ""),
          },
        ],
        structuredContent,
      };
    },
  );
}
