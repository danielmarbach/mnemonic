import { z } from "zod";
import type {
  CallToolResult,
  InputRequiredResult,
  McpServer,
  ServerContext as SdkServerContext,
} from "@modelcontextprotocol/server";
import type { ServerContext } from "../server-context.js";
import { NOTE_LIFECYCLES, NOTE_ROLES, type Note } from "../storage.js";
import type { Vault } from "../vault.js";
import { isoDateString } from "../brands.js";
import { getErrorMessage, attempt } from "../error-utils.js";
import {
  invalidateActiveProjectCache,
  getRecentSessionNoteAccesses,
  getSessionCachedNote,
  getRecentSessionAccessNote,
} from "../cache.js";
import { suggestAutoRelationships } from "../auto-relate.js";
import { MarkdownLintError, cleanMarkdown } from "../markdown.js";
import {
  explicitScopeConflictsWithPolicy,
  resolveWriteScope,
  WRITE_SCOPES,
  type WriteScope,
} from "../project-memory-policy.js";
import { resolveProject, ensureBranchSynced, describeProject } from "../helpers/project.js";
import {
  extractSummary,
  formatCommitBody,
  formatAskForWriteScope,
  formatScopePolicyConflict,
  checkVaultProtectedBranch,
  commitVaultWithProtection,
} from "../helpers/git-commit.js";
import {
  isMrtrSupported,
  protectedBranchDecision,
  readProtectedBranchConsentState,
  readVaultChoice,
  readWriteScopeChoice,
  scopeSelectionDecision,
  vaultSelectionDecision,
  type VaultChoiceOption,
} from "../helpers/mrtr.js";
import { embedNote } from "../helpers/embed.js";
import {
  buildPersistenceStatus,
  formatPersistenceSummary,
  buildMutationRetryContract,
  pushAfterMutation,
} from "../helpers/persistence.js";
import {
  storageLabel,
  ROLE_LIFECYCLE_DEFAULTS,
  ensureAttachmentsLoaded,
} from "../helpers/vault.js";
import { makeId } from "../helpers/index.js";
import {
  type RememberResult,
  RememberToolResultSchema,
  type RememberLintErrorResult,
} from "../structured-content.js";

type WriteVaultResolution =
  | { kind: "vault"; vault: Vault }
  | { kind: "decision"; result: CallToolResult | InputRequiredResult };

interface RememberVaultCandidate extends VaultChoiceOption {
  vault: Vault;
}

/**
 * Resolves the vault a `remember` write targets.
 *
 * Writes to the main vault for global scope. For project scope, the primary
 * project vault is the default; when writable attached vaults also exist for
 * the project, an MRTR elicitation lets the user pick the target on
 * modern clients. Legacy clients and explicit declines fall back to the
 * primary project vault (the pre-existing behavior). A retry that names a
 * vault outside the offered candidate list re-elicits rather than writing to
 * an unoffered vault.
 */
export async function resolveWriteVaultForRemember(
  ctx: ServerContext,
  cwd: string | undefined,
  writeScope: WriteScope,
  project: Awaited<ReturnType<typeof resolveProject>> | undefined,
  requestCtx: SdkServerContext,
): Promise<WriteVaultResolution> {
  if (writeScope === "global") {
    return { kind: "vault", vault: ctx.vaultManager.main };
  }

  const projectVault = cwd ? await ctx.vaultManager.getOrCreateProjectVault(cwd) : null;
  if (!projectVault) {
    return { kind: "vault", vault: ctx.vaultManager.main };
  }

  const candidates: RememberVaultCandidate[] = [
    {
      key: "project",
      label: `${project?.name ?? "this project"} project vault`,
      vault: projectVault,
    },
  ];

  if (project) {
    await ensureAttachmentsLoaded(ctx, project.id);
    for (const attached of ctx.vaultManager.getAttachmentsForProject(project.id)) {
      if (!attached.writable) {
        continue;
      }
      const ref = attached.attachmentRef;
      candidates.push({
        key: ref?.projectSlug ? `attached:${ref.projectSlug}` : storageLabel(attached),
        label: ref?.projectName
          ? `${ref.projectName} (${ref.projectSlug})`
          : storageLabel(attached),
        vault: attached,
      });
    }
  }

  if (candidates.length === 1) {
    return { kind: "vault", vault: projectVault };
  }

  const vaultChoice = readVaultChoice(requestCtx);
  if (vaultChoice?.kind === "accepted") {
    const chosen = candidates.find((candidate) => candidate.key === vaultChoice.value.vault);
    if (chosen) {
      return { kind: "vault", vault: chosen.vault };
    }
  }

  if (vaultChoice?.kind === "declined" || !isMrtrSupported(requestCtx)) {
    return { kind: "vault", vault: projectVault };
  }

  return { kind: "decision", result: vaultSelectionDecision(requestCtx, candidates) };
}

export function registerRememberTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "remember",
    {
      title: "Remember",
      description:
        "REQUIRES: Call `recall` or `list` first to check whether this memory already exists.\n\n" +
        "Use this when:\n" +
        "- Creating a decision, preference, bug fix, or durable context as a new note with embeddings\n" +
        "- No existing note already covers the topic\n\n" +
        "Do not use this when:\n" +
        "- A memory may already exist; use `recall` first to check\n" +
        "- You need to change an existing memory; use `update`\n" +
        "- Several overlapping notes should be merged; use `consolidate`\n\n" +
        "Returns: created id, scope, vault label, lifecycle, persistence status. On lint failure, returns action=lint_error with the list of unfixable issues.\n\n" +
        "Writable attachments: set `writable: true` on `add_attachment` to enable writes.\n\n" +
        "[mutating: writes note, embeddings, git commits, may push]\n\n" +
        "Typical next step:\n" +
        "- Use `relate` if this new memory connects to something recalled earlier.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        title: z
          .string()
          .max(500, "Title must be at most 500 characters")
          .describe(
            "Specific, retrieval-friendly title. Prefer the concrete topic or decision, not a vague label.",
          ),
        content: z
          .string()
          .max(100000, "Content must be at most 100,000 characters")
          .describe(
            "Markdown note body. Put the key fact, decision, or outcome in the opening lines, then supporting detail. Embeddings weight early content more heavily. " +
              "Content must pass markdown lint. Auto-fixable issues are fixed automatically. Common unfixable issues: fenced code blocks need a language tag (e.g. use ```text not bare ```), and broken links are rejected. " +
              "If lint fails, fix the specific issues listed in the error and retry the same call.",
          ),
        tags: z
          .array(z.string())
          .optional()
          .default([])
          .describe(
            "Optional tags for later filtering. Use a small number of stable, meaningful tags.",
          ),
        lifecycle: z
          .enum(NOTE_LIFECYCLES)
          .optional()
          .describe(
            "Memory lifetime. Use `temporary` for short-lived working context such as active investigations or transient status. " +
              "Use `permanent` for durable knowledge such as decisions, fixes, patterns, and preferences. " +
              "When omitted, defaults based on role: research/plan/review → temporary, decision/summary/reference → permanent.",
          ),
        role: z
          .enum(NOTE_ROLES)
          .optional()
          .describe(
            "Optional prioritization hint for the note. Inferred automatically when omitted. " +
              "Set explicitly for workflow artifacts like research or review notes.",
          ),
        summary: z
          .string()
          .optional()
          .describe(
            "Git commit summary only. Imperative mood, concise, and focused on why the change matters.",
          ),
        alwaysLoad: z
          .boolean()
          .optional()
          .describe(
            "When true, this note loads automatically at session start and receives priority in recall and relationship expansion. " +
              "Use for session anchors and critical context that should always be available.",
          ),
        cwd: z
          .string()
          .optional()
          .describe(
            "Absolute project working directory. Pass this whenever the task is related to a repository so routing, search boosting, policy lookup, and vault selection work correctly.",
          ),
        scope: z
          .enum(WRITE_SCOPES)
          .optional()
          .describe(
            "Where to store: 'project' writes to the shared project vault visible to all contributors; " +
              "'global' writes to the private main vault visible only on this machine. " +
              "Prefer omitting this: the project's saved policy (see set_project_memory_policy) is authoritative when one exists, and passing a value that contradicts it triggers a user confirmation " +
              "(or an error on clients without prompts; retry with scopePolicyOverride=true only when the user explicitly requested the deviation). " +
              "When writable attached vaults exist for the project, you may be asked to pick the write target. " +
              "When omitted and no policy exists, defaults to 'project' when cwd is present, otherwise 'global'.",
          ),
        scopePolicyOverride: z
          .boolean()
          .optional()
          .describe(
            "One-time override for the saved write-scope policy. " +
              "Set true only when the user explicitly asked to store somewhere that contradicts the project's saved policy; the result then records the override.",
          ),
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
              "When true, remember can commit on a protected branch without changing project policy.",
          ),
        checkedForExisting: z
          .boolean()
          .optional()
          .describe(
            "Optional agent hint indicating that `recall` or `list` was already used to check for an existing memory on this topic.",
          ),
      }),
      outputSchema: RememberToolResultSchema,
    },
    async (
      {
        title,
        content,
        tags,
        lifecycle,
        role,
        summary,
        alwaysLoad,
        cwd,
        scope,
        scopePolicyOverride = false,
        allowProtectedBranch: allowProtectedBranchArg = false,
      },
      requestCtx,
    ) => {
      const branchConsent = readProtectedBranchConsentState(requestCtx);
      const allowProtectedBranch = allowProtectedBranchArg || branchConsent === "granted";

      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);

      // A retried MRTR round carries the protected-branch consent, the write
      // scope choice, and the vault choice as input responses; fold them into
      // the effective arguments before reaching any decision point.

      const cleanResult = await attempt("remember:clean-markdown", async () =>
        cleanMarkdown(content),
      );
      if (!cleanResult.ok) {
        const err = cleanResult.error;
        if (err instanceof MarkdownLintError) {
          const message = `Markdown lint issues prevented this note from being stored. Fix the specific lint errors listed below in your content and retry the remember call — the note was NOT stored.\n\n${err.message}`;
          return {
            content: [{ type: "text" as const, text: message }],
            structuredContent: {
              action: "lint_error",
              tool: "remember",
              issues: err.issues,
            } satisfies RememberLintErrorResult,
            isError: true,
          };
        }
        throw err;
      }
      const cleanedContent = cleanResult.value;
      const policy = project ? await ctx.configStore.getProjectPolicy(project.id) : undefined;
      const policyScope = policy?.defaultScope;
      const projectVaultExists = cwd
        ? Boolean(await ctx.vaultManager.getProjectVaultIfExists(cwd))
        : true;
      let writeScope = resolveWriteScope(scope, policyScope, Boolean(project), projectVaultExists);
      // An explicit scope that contradicts the saved policy must not silently
      // override it (agents habitually restate the default explicitly). Route
      // it through the same choice flow as policy "ask": a folded MRTR
      // response wins, a decline or legacy client gets actionable error text,
      // otherwise elicit. scopePolicyOverride short-circuits the guard when
      // the user explicitly requested the deviation.
      const scopeConflictsWithPolicy =
        scope !== undefined &&
        policyScope !== undefined &&
        !scopePolicyOverride &&
        explicitScopeConflictsWithPolicy(scope, policyScope);
      if (writeScope === "ask" || scopeConflictsWithPolicy) {
        const unadopted = !projectVaultExists && !policyScope;
        const scopeChoice = readWriteScopeChoice(requestCtx);
        if (scopeChoice?.kind === "accepted") {
          writeScope = scopeChoice.value.scope;
        } else if (scopeChoice?.kind === "declined" || !isMrtrSupported(requestCtx)) {
          const text = scopeConflictsWithPolicy
            ? formatScopePolicyConflict(project, scope, policyScope)
            : formatAskForWriteScope(project, unadopted);
          return {
            content: [{ type: "text", text }],
            isError: true,
          };
        } else {
          const conflictMessage =
            policyScope === "ask"
              ? `The saved memory policy for ${describeProject(project)} is set to always ask, but scope="${scope}" was passed explicitly. ` +
                `Where should this memory be stored? "project" stores in the shared project vault for all contributors; ` +
                `"global" stores in the private main vault for this machine only.`
              : `Explicit scope="${scope}" contradicts the saved memory policy for ${describeProject(project)} (defaultScope="${policyScope}"). ` +
                `Where should this memory be stored? "${policyScope}" follows the saved policy; "${scope}" overrides it.`;
          const message = scopeConflictsWithPolicy
            ? conflictMessage
            : (() => {
                const header = formatAskForWriteScope(project, unadopted).split("\n")[0] ?? "";
                return (
                  `${header} Where should this memory be stored? ` +
                  `"project" stores in the shared project vault for all contributors; ` +
                  `"global" stores in the private main vault for this machine only.`
                );
              })();
          return scopeSelectionDecision(requestCtx, message);
        }
      }

      const vaultResolution = await resolveWriteVaultForRemember(
        ctx,
        cwd,
        writeScope,
        project,
        requestCtx,
      );
      if (vaultResolution.kind === "decision") {
        return vaultResolution.result;
      }
      const vault = vaultResolution.vault;

      const protectedBranchCheck = await checkVaultProtectedBranch({
        ctx,
        vault,
        allowProtectedBranch,
        toolName: "remember",
        noteProjectId: project?.id,
      });
      if (protectedBranchCheck.blocked) {
        if (branchConsent === "denied") {
          return {
            content: [{ type: "text", text: protectedBranchCheck.message }],
            isError: true,
          };
        }
        return protectedBranchDecision(requestCtx, protectedBranchCheck);
      }

      const id = makeId(title);
      const now = isoDateString(new Date().toISOString());

      const note: Note = {
        id,
        title,
        content: cleanedContent,
        tags,
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
            const cachedNote =
              getSessionCachedNote(project.id, entry.vaultPath, entry.noteId) ??
              getRecentSessionAccessNote(project.id, entry.vaultPath, entry.noteId);
            return cachedNote
              ? {
                  note: cachedNote,
                  accessedAt: entry.accessedAt,
                  accessKind: entry.accessKind,
                  score: entry.score,
                }
              : null;
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
        const autoRelationships = suggestAutoRelationships(note, accessCandidates);
        if (autoRelationships.length > 0) {
          note.relatedTo = autoRelationships;
        }
      }

      await vault.storage.writeNote(note);

      let embeddingStatus: { status: "written" | "skipped"; reason?: string } = {
        status: "written",
      };

      const embedResult = await attempt("remember:embed", () =>
        embedNote(vault.storage, note, now),
      );
      if (!embedResult.ok) {
        embeddingStatus = { status: "skipped", reason: getErrorMessage(embedResult.error) };
        console.error(`[embedding] Skipped for '${id}': ${embedResult.error}`);
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
      const commitStatus = await commitVaultWithProtection({
        ctx,
        vault,
        commitMessage,
        files: commitFiles,
        commitBody,
        allowProtectedBranch,
        toolName: "remember",
        noteProjectId: project?.id,
      });
      const pushStatus =
        commitStatus.status === "committed"
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

      const vaultLabel = ` [${storageLabel(vault)}]`;
      const policyMarker = policyScope
        ? writeScope === policyScope || scope === undefined
          ? ` [policy=${policyScope}]`
          : ` [policy=${policyScope}→${writeScope}, override]`
        : "";
      const textContent = `Remembered as \`${id}\` [${projectScope}, stored=${writeScope}]${policyMarker}${vaultLabel}\n${formatPersistenceSummary(persistence)}`;

      const structuredContent: RememberResult = {
        action: "remembered",
        id,
        title,
        project: project ? { id: project.id, name: project.name } : undefined,
        scope: writeScope,
        policyScope,
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
    },
  );
}
