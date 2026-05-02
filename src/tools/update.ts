import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import {
  ensureBranchSynced,
  resolveProject,
  noteProjectRef,
  projectParam,
} from "../helpers/project.js";
import {
  formatCommitBody,
  shouldBlockProtectedBranchCommit,
} from "../helpers/git-commit.js";
import {
  buildPersistenceStatus,
  buildMutationRetryContract,
  formatPersistenceSummary,
  pushAfterMutation,
} from "../helpers/persistence.js";
import { embedTextForNote } from "../helpers/embed.js";
import { memoryId, isoDateString } from "../brands.js";
import { cleanMarkdown, MarkdownLintError } from "../markdown.js";
import { getErrorMessage } from "../error-utils.js";
import { embed, embedModel } from "../embeddings.js";
import { applySemanticPatches, type SemanticPatch } from "../semantic-patch.js";
import { hasActualChanges, computeFieldsModified } from "../update-detect-changes.js";
import { suggestAutoRelationships } from "../auto-relate.js";
import {
  invalidateActiveProjectCache,
  getRecentSessionNoteAccesses,
  getSessionCachedNote,
  getRecentSessionAccessNote,
} from "../cache.js";
import { NOTE_LIFECYCLES, NOTE_ROLES, type Note } from "../storage.js";
import {
  type UpdateResult,
  UpdateResultSchema,
  type LintErrorResult,
  NoteIdSchema,
  type PersistenceStatus,
} from "../structured-content.js";

export function registerUpdateTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "update",
    {
      title: "Update Memory",
      description:
        "Use after `recall` + `get` when an existing memory should be refined instead of creating a duplicate.\n\n" +
        "Modify an existing memory by id.\n\n" +
        "Use this when:\n" +
        "- A stored memory is stale, incomplete, or wrong\n" +
        "- You recalled something useful and want to refine the same note instead of creating a duplicate\n\n" +
        "Do not use this when:\n" +
        "- No note exists yet; use `remember`\n" +
        "- Several notes need to be merged or retired together; use `consolidate`\n\n" +
        "Returns:\n" +
        "- The updated memory id, changed fields, and persistence status\n\n" +
        "Side effects: rewrites the note, refreshes embeddings, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `relate` or `consolidate` if the update changes how this note connects to others.\n\n" +
        "Use `semanticPatch` for targeted edits (more token-efficient). Use `content` only for complete rewrites.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        id: NoteIdSchema.describe("Exact memory id. Use an id returned by `recall`, `list`, `recent_memories`, or `where_is`."),
        semanticPatch: z
          .preprocess(
            (val) => {
              if (typeof val === "string") {
                try { return JSON.parse(val); } catch { return val; }
              }
              return val;
            },
            z.array(z.object({
            selector: z.object({
              heading: z.string().optional(),
              headingStartsWith: z.string().optional(),
              nthChild: z.number().int().optional(),
              lastChild: z.literal(true).optional(),
            }).refine(
              (sel) => {
                const keys = [sel.heading, sel.headingStartsWith, sel.nthChild, sel.lastChild].filter((v) => v !== undefined);
                return keys.length === 1;
              },
              { message: "Selector must have exactly one of: heading, headingStartsWith, nthChild, lastChild" }
            ),
            operation: z.discriminatedUnion("op", [
              z.object({ op: z.literal("appendChild"), value: z.string() }),
              z.object({ op: z.literal("prependChild"), value: z.string() }),
              z.object({ op: z.literal("replace"), value: z.string() }),
              z.object({ op: z.literal("replaceChildren"), value: z.string() }),
              z.object({ op: z.literal("insertAfter"), value: z.string() }),
              z.object({ op: z.literal("insertBefore"), value: z.string() }),
              z.object({ op: z.literal("remove") }),
            ]),
          })))
          .optional()
          .describe(
            "Targeted edits to note sections. Array of {selector, operation} objects. Mutually exclusive with content. " +
            "If this fails, fix the issue in your patch values and retry — do NOT fall back to full content rewrite.\n\n" +
            "selector: exactly one of { heading: \"exact heading text\" } | { headingStartsWith: \"prefix\" } | { lastChild: true } | { nthChild: 0-based-index }\n" +
            "operation: { op: \"appendChild\", value: \"content\" } | { op: \"prependChild\", value: \"content\" } | { op: \"replace\", value: \"new content\" } | { op: \"replaceChildren\", value: \"new children\" } | { op: \"insertAfter\", value: \"content\" } | { op: \"insertBefore\", value: \"content\" } | { op: \"remove\" }\n\n" +
            "Example — add a paragraph under ## Findings, replace body under ## Recommendation, remove ## Old Section:\n" +
            "[\n" +
            "  { \"selector\": { \"heading\": \"Findings\" }, \"operation\": { \"op\": \"insertAfter\", \"value\": \"A new paragraph.\" } },\n" +
            "  { \"selector\": { \"heading\": \"Recommendation\" }, \"operation\": { \"op\": \"replace\", \"value\": \"## Recommendation\\n\\nUpdated recommendation.\" } },\n" +
            "  { \"selector\": { \"heading\": \"Old Section\" }, \"operation\": { \"op\": \"remove\" } }\n" +
            "]\n\n" +
            "IMPORTANT: `appendChild`, `prependChild`, and `replaceChildren` do NOT work with `heading` selectors (headings only contain inline text, not block content). To add or replace content under a heading, use `insertAfter`. To replace a heading entirely, use `replace`."
          ),
        content: z.string().max(100000, "Content must be at most 100,000 characters").optional().describe("Full note body replacement. Use only for complete rewrites or when the note is small. Mutually exclusive with semanticPatch. Content must pass markdown lint. Auto-fixable issues are fixed automatically. Common unfixable issues: fenced code blocks need a language tag (e.g. use ```text not bare ```), and broken links are rejected. If lint fails, fix the specific issues and retry — do NOT fall back to semanticPatch for this."),
        title: z.string().max(500, "Title must be at most 500 characters").optional().describe("Specific, retrieval-friendly title. Prefer the concrete topic or decision, not a vague label."),
        tags: z.array(z.string()).optional().describe("Optional tags for later filtering. Use a small number of stable, meaningful tags."),
        lifecycle: z
          .enum(NOTE_LIFECYCLES)
          .optional()
          .describe("Change lifecycle. Preserve the existing value unless you're intentionally switching it."),
        role: z
          .enum(NOTE_ROLES)
          .optional()
          .describe("Change role. Preserve the existing value unless you're intentionally switching it."),
        summary: z.string().optional().describe("Git commit summary only. Imperative mood, concise, and focused on why the change matters."),
        alwaysLoad: z
          .boolean()
          .optional()
          .describe(
            "When true, this note loads automatically at session start and receives priority in recall and relationship expansion. " +
            "Use for session anchors and critical context that should always be available."
          ),
        cwd: projectParam,
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
            "When true, update can commit on a protected branch without changing project policy."
          ),
      }),
      outputSchema: UpdateResultSchema,
    },
    async ({ id, content, semanticPatch, title, tags, lifecycle, role, summary, alwaysLoad, cwd, allowProtectedBranch = false }) => {
      await ensureBranchSynced(ctx, cwd);
      const noteId = memoryId(id);

      const found = await ctx.vaultManager.findNote(id, cwd);
      if (!found) {
        return { content: [{ type: "text", text: `No memory found with id '${id}'` }], isError: true };
      }

      // Validate: content and semanticPatch are mutually exclusive
      const hasContent = content !== undefined;
      const hasSemanticPatch = semanticPatch !== undefined && semanticPatch.length > 0;
      if (hasContent && hasSemanticPatch) {
        return { content: [{ type: "text", text: "Exactly one of content or semanticPatch must be provided, not both." }], isError: true };
      }

      const { note, vault } = found;
      if (vault.isProject) {
        const resolvedProject = await resolveProject(ctx, cwd);
        const projectLabel = resolvedProject
          ? `${resolvedProject.name} (${resolvedProject.id})`
          : `${note.projectName ?? "project"} (${note.project ?? "unknown"})`;
        const policy = note.project ? await ctx.configStore.getProjectPolicy(note.project) : undefined;
        const protectedBranchCheck = await shouldBlockProtectedBranchCommit({
          ctx,
          cwd,
          writeScope: "project",
          automaticCommit: true,
          projectLabel,
          policy,
          allowProtectedBranch,
          toolName: "update",
        });
        if (protectedBranchCheck.blocked) {
          return {
            content: [{ type: "text", text: protectedBranchCheck.message ?? "Protected branch policy blocked this commit." }],
            isError: true,
          };
        }
      }

      const now = isoDateString(new Date().toISOString());

      let patchedContent: string | undefined;
      let lintWarnings: string[] | undefined;
      if (semanticPatch && semanticPatch.length > 0) {
        try {
          const result = await applySemanticPatches(note.content, semanticPatch as SemanticPatch[]);
          patchedContent = result.content;
          lintWarnings = result.lintWarnings;
        } catch (err) {
          if (err instanceof MarkdownLintError) {
            const message = `Semantic patch produced content with markdown lint issues. Fix the lint issues in your patch values and retry — do NOT fall back to full content rewrite.\n\n${err.message}`;
            return { content: [{ type: "text", text: message }], isError: true };
          }
          const message = getErrorMessage(err);
          return { content: [{ type: "text", text: `Semantic patch failed: ${message}` }], isError: true };
        }
      }
      let cleanedContent: string | undefined;
      if (content !== undefined) {
        try {
          cleanedContent = await cleanMarkdown(content);
        } catch (err) {
          if (err instanceof MarkdownLintError) {
            const message = `Markdown lint issues prevented the update. Fix the specific lint errors in your content and retry — do NOT fall back to semanticPatch for this.\n\n${err.message}`;
            return {
              content: [{ type: "text" as const, text: message }],
              structuredContent: { action: "lint_error", tool: "update", issues: err.issues } as LintErrorResult,
              isError: true,
            };
          }
          throw err;
        }
      }

      const resolvedTitle = title ?? note.title;
      const resolvedContent = patchedContent ?? cleanedContent ?? note.content;
      const resolvedTags = tags ?? note.tags;
      const resolvedLifecycle = lifecycle ?? note.lifecycle;
      const resolvedRole = role !== undefined ? role : (note.role ? note.role : undefined);
      const resolvedAlwaysLoad = alwaysLoad !== undefined ? alwaysLoad : note.alwaysLoad;

      let relatedToChanged = false;
      let resolvedRelatedTo = note.relatedTo;
      if (note.project) {
        const accessCandidates = getRecentSessionNoteAccesses(note.project)
          .map((entry) => {
            const cachedNote = getSessionCachedNote(note.project!, entry.vaultPath, entry.noteId)
              ?? getRecentSessionAccessNote(note.project!, entry.vaultPath, entry.noteId);
            return cachedNote
              ? { note: cachedNote, accessedAt: entry.accessedAt, accessKind: entry.accessKind, score: entry.score }
              : null;
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        const autoRelationships = suggestAutoRelationships({
          ...note,
          title: resolvedTitle,
          content: resolvedContent,
          tags: resolvedTags,
          lifecycle: resolvedLifecycle,
          alwaysLoad: resolvedAlwaysLoad,
        }, accessCandidates);
        if (autoRelationships.length > 0) {
          const existing = [...(note.relatedTo ?? [])];
          for (const relationship of autoRelationships) {
            if (!existing.some((rel) => rel.id === relationship.id && rel.type === relationship.type)) {
              existing.push(relationship);
            }
          }
          resolvedRelatedTo = existing;
          relatedToChanged = true;
        }
      }

      const changes = computeFieldsModified({
        patchedContent,
        originalContent: note.content,
        contentExplicitlyProvided: content !== undefined,
        semanticPatchProvided: semanticPatch !== undefined && semanticPatch.length > 0,
        newTitle: resolvedTitle,
        originalTitle: note.title,
        titleExplicitlyProvided: title !== undefined,
        newLifecycle: resolvedLifecycle,
        originalLifecycle: note.lifecycle,
        lifecycleExplicitlyProvided: lifecycle !== undefined,
        newRole: resolvedRole,
        originalRole: note.role,
        roleExplicitlySet: role !== undefined,
        newTags: resolvedTags,
        originalTags: note.tags,
        tagsExplicitlyProvided: tags !== undefined,
        newAlwaysLoad: resolvedAlwaysLoad,
        originalAlwaysLoad: note.alwaysLoad,
        alwaysLoadExplicitlyProvided: alwaysLoad !== undefined,
        relatedToChanged,
      });

      const hasChanges = hasActualChanges({
        content: cleanedContent,
        originalContent: note.content,
        title,
        originalTitle: note.title,
        tags,
        originalTags: note.tags,
        lifecycle,
        originalLifecycle: note.lifecycle,
        role,
        originalRole: note.role,
        roleExplicitlySet: role !== undefined,
        alwaysLoad,
        originalAlwaysLoad: note.alwaysLoad,
        semanticPatchApplied: semanticPatch !== undefined && semanticPatch.length > 0,
        relatedToChanged,
      });

      if (!hasChanges) {
        const noOpPersistence: PersistenceStatus = {
          notePath: vault.storage.notePath(memoryId(id)),
          embeddingPath: vault.storage.embeddingPath(memoryId(id)),
          embedding: { status: "skipped", model: embedModel, reason: "no-changes" },
          git: {
            commit: "skipped",
            push: "skipped",
            commitReason: "no-changes",
            pushReason: "no-changes",
          },
          durability: "local-only",
        };
        return {
          content: [{ type: "text", text: `No changes to memory '${id}'` }],
          structuredContent: {
            action: "updated" as const,
            id,
            title: note.title,
            fieldsModified: [],
            timestamp: note.updatedAt,
            project: noteProjectRef(note),
            lifecycle: note.lifecycle,
            role: note.role,
            persistence: noOpPersistence,
          },
        };
      }

      const updated: Note = {
        ...note,
        title: resolvedTitle,
        content: resolvedContent,
        tags: resolvedTags,
        lifecycle: resolvedLifecycle,
        ...(role !== undefined ? { role: resolvedRole } : (note.role ? { role: note.role } : {})),
        alwaysLoad: resolvedAlwaysLoad,
        updatedAt: now,
        relatedTo: resolvedRelatedTo,
      };

      await vault.storage.writeNote(updated);

      const shouldReembed = patchedContent !== undefined || cleanedContent !== undefined;
      let embeddingStatus: { status: "written" | "skipped"; reason?: string } = { status: "skipped", reason: shouldReembed ? undefined : "metadata-only" };

      if (shouldReembed) {
        try {
          const text = await embedTextForNote(vault.storage, updated);
          const vector = await embed(text);
          await vault.storage.writeEmbedding({ id: noteId, model: embedModel, embedding: vector, updatedAt: now });
          embeddingStatus = { status: "written" };
        } catch (err) {
          embeddingStatus = { status: "skipped", reason: getErrorMessage(err) };
          console.error(`[embedding] Re-embed failed for '${id}': ${err}`);
        }
      }

      const changeDesc = changes.length > 0 ? `Updated ${changes.join(", ")}` : "No changes";
      const commitSummary = summary ?? changeDesc;

      const commitBody = formatCommitBody({
        summary: commitSummary,
        noteId: id,
        noteTitle: updated.title,
        projectName: updated.projectName,
        tags: updated.tags,
      });
      const commitMessage = `update: ${updated.title}`;
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

      const structuredContent: UpdateResult = {
        action: "updated",
        id,
        title: updated.title,
        fieldsModified: changes,
        timestamp: now,
        project: noteProjectRef(updated),
        lifecycle: updated.lifecycle,
        role: updated.role,
        lintWarnings: lintWarnings && lintWarnings.length > 0 ? lintWarnings : undefined,
        persistence,
      };

      invalidateActiveProjectCache();
      const fieldText = changes.length > 0 ? `\nfields modified: ${changes.join(", ")}` : "";
      const warningsText = lintWarnings && lintWarnings.length > 0
        ? `\nmarkdown lint warnings (not auto-fixable):\n- ${lintWarnings.join("\n- ")}`
        : "";
      return { content: [{ type: "text", text: `Updated memory '${id}'${fieldText}${warningsText}\n${formatPersistenceSummary(persistence)}` }], structuredContent };
    }
  );
}
