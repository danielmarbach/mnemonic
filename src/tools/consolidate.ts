import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { ConsolidateResultSchema } from "../structured-content.js";
import {
  projectParam,
  resolveProject,
  ensureBranchSynced,
} from "../helpers/project.js";
import { collectVisibleNotes, projectNotFoundResponse } from "../helpers/vault.js";
import {
  CONSOLIDATION_MODES,
  resolveConsolidationMode,
} from "../project-memory-policy.js";
import { invalidateActiveProjectCache } from "../cache.js";
import {
  detectDuplicates,
  findClusters,
  suggestMerges,
  executeMerge,
  pruneSuperseded,
  dryRunAll,
} from "./consolidate-helpers.js";
export function registerConsolidateTool(server: McpServer, ctx: ServerContext): void {
  // ── consolidate ───────────────────────────────────────────────────────────────
  server.registerTool(
    "consolidate",
    {
      title: "Consolidate Memories",
      description:
        "Use after `recall`, `list`, or `memory_graph` shows overlap that should be merged or cleaned up.\n\n" +
        "Merge overlapping memories into a cleaner canonical note and retire the sources.\n\n" +
        "Use this when:\n" +
        "- Multiple notes cover the same decision, fix, or concept\n" +
        "- One memory supersedes several older fragments\n\n" +
        "Do not use this when:\n" +
        "- You only need a small edit to one note; use `update`\n" +
        "- You only want to connect notes; use `relate`\n\n" +
        "Returns:\n" +
        "- The canonical memory, source ids, resulting relationships, and persistence status\n\n" +
        "Side effects: creates or updates the canonical note, modifies or removes source notes according to mode, git commits, and may push.\n\n" +
        "Typical next step:\n" +
        "- Use `get` to inspect the canonical note and `recall` to confirm duplication is reduced.\n" +
        "- Evidence defaults on for consolidate analysis strategies and execute-merge (lifecycle, risk, warnings).",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        cwd: projectParam,
        strategy: z
          .enum([
            "detect-duplicates",
            "find-clusters",
            "suggest-merges",
            "execute-merge",
            "prune-superseded",
            "dry-run",
          ])
          .describe(
            "What to do: 'dry-run' = full analysis without changes, 'detect-duplicates' = find similar pairs, " +
            "'find-clusters' = group by theme and relationships, 'suggest-merges' = actionable merge recommendations, " +
            "'execute-merge' = perform a merge (requires mergePlan), 'prune-superseded' = delete notes marked as superseded. " +
            "Use `evidence: true` on analysis strategies for trust/risk signals."
          ),
        mode: z
          .enum(CONSOLIDATION_MODES)
          .optional()
          .describe("Override the project's default: 'supersedes' preserves history, 'delete' removes sources immediately"),
        threshold: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .default(0.85)
          .describe("Cosine similarity threshold for duplicate detection (0.85 default)"),
        evidence: z
          .boolean()
          .optional()
          .describe("Confidence signals for analysis strategies and execute-merge (lifecycle, risk, warnings). Default true for safety."),
        mergePlan: z
          .object({
            sourceIds: z.array(z.string()).min(2).describe("Ids of notes to merge into one consolidated note"),
            targetTitle: z.string().describe("Title for the consolidated note"),
            content: z.string().max(100000, "Content must be at most 100,000 characters").optional().describe("Custom body for the consolidated note — distill durable knowledge rather than dumping all source content verbatim"),
            description: z.string().optional().describe("Context explaining the consolidation rationale (stored in the note)"),
            summary: z.string().optional().describe("Git commit summary only. Imperative mood, concise, and focused on why the change matters."),
            tags: z.array(z.string()).optional().describe("Optional tags for later filtering. Use a small number of stable, meaningful tags."),
          })
          .optional()
          .describe("Required for 'execute-merge' strategy. Get sourceIds from 'suggest-merges' output."),
        allowProtectedBranch: z
          .boolean()
          .optional()
          .describe(
            "One-time override for protected branch checks. " +
            "When true, consolidate can commit on a protected branch without changing project policy."
          ),
      }),
      outputSchema: ConsolidateResultSchema,
    },
    async ({ cwd, strategy, mode, threshold, evidence = true, mergePlan, allowProtectedBranch = false }) => {
      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);
      if (!project && cwd) {
        return projectNotFoundResponse(cwd);
      }

      // Gather notes from all vaults (project + main) for this project
      const { entries } = await collectVisibleNotes(ctx, cwd, "all", undefined, "any");
      const projectNotes = project
        ? entries.filter((e) => e.note.project === project.id)
        : entries.filter((e) => !e.note.project);

      if (projectNotes.length === 0) {
        return { content: [{ type: "text", text: "No memories found to consolidate." }], isError: true };
      }

      // Resolve project/default consolidation mode. Temporary-only merges may still
      // resolve to delete later when a specific source set is known.
      const policy = project ? await ctx.configStore.getProjectPolicy(project.id) : undefined;
      const defaultConsolidationMode = resolveConsolidationMode(policy);

        switch (strategy) {
        case "detect-duplicates":
          return detectDuplicates(projectNotes, threshold, project ?? undefined, evidence);

        case "find-clusters":
          return findClusters(projectNotes, project ?? undefined);

        case "suggest-merges":
          return suggestMerges(projectNotes, threshold, defaultConsolidationMode, project ?? undefined, mode, evidence);

        case "execute-merge": {
          if (!mergePlan) {
            return { content: [{ type: "text", text: "execute-merge strategy requires a mergePlan with sourceIds and targetTitle." }], isError: true };
          }
          const mergeResult = await executeMerge(ctx, entries, mergePlan, defaultConsolidationMode, project ?? undefined, cwd, mode, policy, allowProtectedBranch, evidence);
          invalidateActiveProjectCache();
          return mergeResult;
        }

        case "prune-superseded": {
          const pruneResult = await pruneSuperseded(ctx, projectNotes, mode ?? defaultConsolidationMode, project ?? undefined, cwd, policy, allowProtectedBranch);
          invalidateActiveProjectCache();
          return pruneResult;
        }

        case "dry-run":
          return dryRunAll(projectNotes, threshold, defaultConsolidationMode, project ?? undefined, mode, evidence);

        default: {
          const _exhaustive: never = strategy;
          return { content: [{ type: "text", text: `Unknown strategy: ${_exhaustive}` }], isError: true };
        }
      }
    }
  );

}
