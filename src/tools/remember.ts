import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { NOTE_LIFECYCLES, NOTE_ROLES, type Note } from "../storage.js";
import { isoDateString } from "../brands.js";
import { getErrorMessage } from "../error-utils.js";
import { embed, embedModel } from "../embeddings.js";
import {
  invalidateActiveProjectCache,
  getRecentSessionNoteAccesses,
  getSessionCachedNote,
  getRecentSessionAccessNote,
} from "../cache.js";
import { suggestAutoRelationships } from "../auto-relate.js";
import { MarkdownLintError, cleanMarkdown } from "../markdown.js";
import { resolveWriteScope, WRITE_SCOPES } from "../project-memory-policy.js";
import {
  resolveProject,
  resolveWriteVault,
  ensureBranchSynced,
  describeProject,
} from "../helpers/project.js";
import {
  extractSummary,
  formatCommitBody,
  formatAskForWriteScope,
  shouldBlockProtectedBranchCommit,
} from "../helpers/git-commit.js";
import { embedTextForNote } from "../helpers/embed.js";
import {
  buildPersistenceStatus,
  formatPersistenceSummary,
  buildMutationRetryContract,
  pushAfterMutation,
} from "../helpers/persistence.js";
import { storageLabel, ROLE_LIFECYCLE_DEFAULTS } from "../helpers/vault.js";
import { makeId } from "../helpers/index.js";
import { type RememberResult, RememberResultSchema, type LintErrorResult } from "../structured-content.js";

export function registerRememberTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "remember",
    {
      title: "Remember",
      description:
        "REQUIRES: Call `recall` or `list` first to check whether this memory already exists.\n\n" +
        "Create a new memory as a markdown note with embeddings for future recall.\n\n" +
        "Use this when:\n" +
        "- A decision, preference, bug fix, or durable context should survive beyond this session\n" +
        "- No existing note already covers the topic\n\n" +
        "Do not use this when:\n" +
        "- A memory may already exist; use `recall` first to check\n" +
        "- You need to change an existing memory; use `update`\n" +
        "- Several overlapping notes should be merged; use `consolidate`\n\n" +
        "Returns:\n" +
        "- The created memory id, scope, vault label, lifecycle, and persistence status\n\n" +
        "Side effects: writes a note, writes embeddings, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `relate` if this new memory connects to something recalled earlier.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        title: z.string().max(500, "Title must be at most 500 characters").describe("Specific, retrieval-friendly title. Prefer the concrete topic or decision, not a vague label."),
        content: z.string().max(100000, "Content must be at most 100,000 characters").describe(
          "Markdown note body. Put the key fact, decision, or outcome in the opening lines, then supporting detail. Embeddings weight early content more heavily. " +
          "Content must pass markdown lint. Auto-fixable issues are fixed automatically. Common unfixable issues: fenced code blocks need a language tag (e.g. use ```text not bare ```), and broken links are rejected. " +
          "If lint fails, fix the specific issues listed in the error and retry the same call."
        ),
        tags: z.array(z.string()).optional().default([]).describe("Optional tags for later filtering. Use a small number of stable, meaningful tags."),
        lifecycle: z
          .enum(NOTE_LIFECYCLES)
          .optional()
          .describe(
            "Memory lifetime. Use `temporary` for short-lived working context such as active investigations or transient status. " +
            "Use `permanent` for durable knowledge such as decisions, fixes, patterns, and preferences. " +
            "When omitted, defaults based on role: research/plan/review → temporary, decision/summary/reference → permanent."
          ),
        role: z
          .enum(NOTE_ROLES)
          .optional()
          .describe(
            "Optional prioritization hint for the note. Inferred automatically when omitted. " +
            "Set explicitly for workflow artifacts like research or review notes."
          ),
        summary: z.string().optional().describe(
          "Git commit summary only. Imperative mood, concise, and focused on why the change matters."
        ),
        alwaysLoad: z
          .boolean()
          .optional()
          .describe(
            "When true, this note loads automatically at session start and receives priority in recall and relationship expansion. " +
            "Use for session anchors and critical context that should always be available."
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Absolute project working directory. Pass this whenever the task is related to a repository so routing, search boosting, policy lookup, and vault selection work correctly."
          ),
        scope: z
          .enum(WRITE_SCOPES)
          .optional()
          .describe(
            "Where to store: 'project' writes to the shared project vault visible to all contributors; " +
            "'global' writes to the private main vault visible only on this machine. " +
            "When omitted, uses the project's saved policy or defaults to 'project'."
          ),
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
            "When true, remember can commit on a protected branch without changing project policy."
          ),
        checkedForExisting: z
          .boolean()
          .optional()
          .describe(
            "Optional agent hint indicating that `recall` or `list` was already used to check for an existing memory on this topic."
          ),
      }),
      outputSchema: RememberResultSchema,
    },
    async ({ title, content, tags, lifecycle, role, summary, alwaysLoad, cwd, scope, allowProtectedBranch = false }) => {
      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);
      let cleanedContent: string;
      try {
        cleanedContent = await cleanMarkdown(content);
      } catch (err) {
        if (err instanceof MarkdownLintError) {
          const message = `Markdown lint issues prevented this note from being stored. Fix the specific lint errors listed below in your content and retry the remember call — the note was NOT stored.\n\n${err.message}`;
          return {
            content: [{ type: "text" as const, text: message }],
            structuredContent: { action: "lint_error", tool: "remember", issues: err.issues } as LintErrorResult,
            isError: true,
          };
        }
        throw err;
      }
      const policy = project ? await ctx.configStore.getProjectPolicy(project.id) : undefined;
      const policyScope = policy?.defaultScope;
      const projectVaultExists = cwd ? Boolean(await ctx.vaultManager.getProjectVaultIfExists(cwd)) : true;
      const writeScope = resolveWriteScope(scope, policyScope, Boolean(project), projectVaultExists);
      if (writeScope === "ask") {
        const unadopted = !projectVaultExists && !policyScope;
        return { content: [{ type: "text", text: formatAskForWriteScope(project, unadopted) }], isError: true };
      }

      const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
        cwd,
        writeScope,
        automaticCommit: true,
        projectLabel: project ? `${project.name} (${project.id})` : "this context",
        policy,
        allowProtectedBranch,
        toolName: "remember",
        ctx,
      });
      if (protectedBranchCheck.blocked) {
        return { content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }], isError: true };
      }

      const vault = await resolveWriteVault(ctx, cwd, writeScope);

      const id = makeId(title);
      const now = isoDateString(new Date().toISOString());

      const note: Note = {
        id, title, content: cleanedContent, tags,
        lifecycle: lifecycle ?? (role ? ROLE_LIFECYCLE_DEFAULTS[role] : undefined) ?? "permanent",
        ...(role ? { role } : {}),
        alwaysLoad: alwaysLoad ?? false,
        project: project?.id,
        projectName: project?.name,
        createdAt: now,
        updatedAt: now,
        memoryVersion: 1,
      };

      if (project) {
        const accessCandidates = getRecentSessionNoteAccesses(project.id)
          .map((entry) => {
            const cachedNote = getSessionCachedNote(project.id, entry.vaultPath, entry.noteId)
              ?? getRecentSessionAccessNote(project.id, entry.vaultPath, entry.noteId);
            return cachedNote
              ? { note: cachedNote, accessedAt: entry.accessedAt, accessKind: entry.accessKind, score: entry.score }
              : null;
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        const autoRelationships = suggestAutoRelationships(note, accessCandidates);
        if (autoRelationships.length > 0) {
          note.relatedTo = autoRelationships;
        }
      }

      await vault.storage.writeNote(note);

      let embeddingStatus: { status: "written" | "skipped"; reason?: string } = { status: "written" };

      try {
        const text = await embedTextForNote(vault.storage, note);
        const vector = await embed(text);
        await vault.storage.writeEmbedding({ id, model: embedModel, embedding: vector, updatedAt: now });
      } catch (err) {
        embeddingStatus = { status: "skipped", reason: getErrorMessage(err) };
        console.error(`[embedding] Skipped for '${id}': ${err}`);
      }

      const projectScope = describeProject(project);
      const commitSummary = summary ?? extractSummary(cleanedContent);
      const commitBody = formatCommitBody({
        summary: commitSummary,
        noteId: id,
        noteTitle: title,
        projectName: project?.name,
        scope: writeScope,
        tags: tags,
      });
      const commitMessage = `remember: ${title}`;
      const commitFiles = [ctx.vaultManager.noteRelPath(vault, id)];
      const commitStatus = await vault.git.commitWithStatus(commitMessage, commitFiles, commitBody);
      const pushStatus = commitStatus.status === "committed"
        ? await pushAfterMutation(ctx, vault)
        : { status: "skipped" as const, reason: "commit-failed" as const };
      const retry = buildMutationRetryContract({
        commit: commitStatus,
        commitMessage,
        commitBody,
        files: commitFiles,
        cwd,
        vault,
        mutationApplied: true,
      });
      const persistence = buildPersistenceStatus({
        storage: vault.storage,
        id,
        embedding: embeddingStatus,
        commit: commitStatus,
        push: pushStatus,
        commitMessage,
        commitBody,
        retry,
      });

      const vaultLabel = vault.isProject ? " [project vault]" : " [main vault]";
      const textContent = `Remembered as \`${id}\` [${projectScope}, stored=${writeScope}]${vaultLabel}\n${formatPersistenceSummary(persistence)}`;
      
      const structuredContent: RememberResult = {
        action: "remembered",
        id,
        title,
        project: project ? { id: project.id, name: project.name } : undefined,
        scope: writeScope,
        vault: storageLabel(vault),
        tags: tags || [],
        lifecycle: note.lifecycle,
        timestamp: now,
        persistence,
      };

      invalidateActiveProjectCache();
      return {
        content: [{ type: "text", text: textContent }],
        structuredContent,
      };
    }
  );
}
