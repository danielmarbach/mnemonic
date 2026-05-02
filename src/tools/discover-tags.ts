import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import { NOTE_LIFECYCLES, type NoteLifecycle } from "../storage.js";
import { DiscoverTagsResultSchema, type DiscoverTagsResult } from "../structured-content.js";
import {
  type DiscoverTagStat,
  tokenizeTagDiscoveryText,
  countTokenOverlap,
  hasExactTagContextMatch,
} from "../tools/recall-helpers.js";
import { projectParam, ensureBranchSynced } from "../helpers/project.js";
import { collectVisibleNotes, storageLabel } from "../helpers/vault.js";

export function registerDiscoverTagsTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "discover_tags",
    {
      title: "Discover Tags",
      description:
        "Suggest canonical tags for a specific note before `remember` when tag choice is ambiguous.\n\n" +
        "Use this when:\n" +
        "- You have a note title, content, or query and want compact tag suggestions\n" +
        "- You want canonical project terminology without exposing lots of unrelated tags\n" +
        "- You want to demote temporary-only tags unless they fit the note\n\n" +
        "Do not use this when:\n" +
        "- You need to browse notes by tag; use `list` with `tags` filter instead\n" +
        "- You already know the exact tags you want to use\n" +
        "- You want broad inventory output but are not explicitly requesting `mode: \"browse\"`\n\n" +
        "Returns:\n" +
        "- Default: bounded `recommendedTags` ranked by note relevance first and usage count second\n" +
        "- Each suggestion includes canonicality and lifecycle signals plus one compact example\n" +
        "- Optional `mode: \"browse\"` returns broader inventory output\n\n" +
        "Typical next step:\n" +
        "- Reuse suggested canonical tags when they fit, or create a new tag only when genuinely novel.\n\n" +
        "Performance: O(n) where n = total notes scanned. Expect 100-200ms for 500 notes.\n\n" +
        "Read-only.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      inputSchema: z.object({
        cwd: projectParam,
        mode: z.enum(["suggest", "browse"]).optional().default("suggest"),
        title: z.string().optional(),
        content: z.string().optional(),
        query: z.string().optional(),
        candidateTags: z.array(z.string()).optional(),
        lifecycle: z.enum(NOTE_LIFECYCLES).optional(),
        scope: z
          .enum(["project", "global", "all"])
          .optional()
          .default("all")
          .describe(
            "'project' = only this project's memories; " +
            "'global' = only unscoped memories; " +
            "'all' = everything visible (default)"
          ),
        storedIn: z
          .enum(["project-vault", "main-vault", "any"])
          .optional()
          .default("any")
          .describe("Filter by vault storage label like list tool."),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: DiscoverTagsResultSchema,
    },
    async ({ cwd, mode, title, content, query, candidateTags, lifecycle, scope, storedIn, limit }) => {
      await ensureBranchSynced(ctx, cwd);
      const startTime = Date.now();

      const { project, entries } = await collectVisibleNotes(ctx, cwd, scope, undefined, storedIn);

      const tagStats = new Map<string, DiscoverTagStat>();
      const candidateTagSet = new Set((candidateTags || []).map(tag => tag.toLowerCase()));
      const contextValues = [title, content, query, ...(candidateTags || [])];
      const contextTokens = new Set(tokenizeTagDiscoveryText(contextValues.filter(Boolean).join(" ")));
      const isTemporaryTarget = lifecycle === "temporary";
      const effectiveLimit = limit ?? (mode === "browse" ? 20 : 10);

      for (const { note } of entries) {
        const noteTokens = new Set(tokenizeTagDiscoveryText(`${note.title} ${note.content} ${note.tags.join(" ")}`));
        const contextMatches = contextTokens.size > 0 ? countTokenOverlap(contextTokens, noteTokens) : 0;

        for (const tag of note.tags) {
          const stats = tagStats.get(tag) || {
            count: 0,
            examples: [],
            lifecycles: new Set<NoteLifecycle>(),
            contextMatches: 0,
            exactCandidateMatch: false,
          };
          stats.count++;
          if (stats.examples.length < 3) {
            stats.examples.push(note.title);
          }
          stats.lifecycles.add(note.lifecycle);
          stats.contextMatches += contextMatches;
          if (candidateTagSet.has(tag.toLowerCase())) {
            stats.exactCandidateMatch = true;
          }
          tagStats.set(tag, stats);
        }
      }

      const rawTags = Array.from(tagStats.entries())
        .map(([tag, stats]) => {
          const lifecycleTypes = Array.from(stats.lifecycles) as NoteLifecycle[];
          const isTemporaryOnly = stats.lifecycles.size === 1 && stats.lifecycles.has("temporary");
          const tagTokens = tokenizeTagDiscoveryText(tag);
          const exactContextMatch = stats.exactCandidateMatch || hasExactTagContextMatch(tag, contextValues);
          const tagTokenOverlap = contextTokens.size > 0
            ? countTokenOverlap(contextTokens, tagTokens)
            : 0;
          const averageContextMatch = stats.count > 0 ? stats.contextMatches / stats.count : 0;
          const reason = exactContextMatch
            ? "matches a candidate tag already present in the note context"
            : tagTokenOverlap > 0 || stats.contextMatches > 0
              ? "matches the note context and existing project usage"
              : "high-usage canonical tag from existing project notes";

          return {
            tag,
            usageCount: stats.count,
            examples: stats.examples,
            example: stats.examples[0],
            reason,
            lifecycleTypes,
            isTemporaryOnly,
            exactContextMatch,
            tagTokenOverlap,
            averageContextMatch,
            isBroadSingleToken: tagTokens.length === 1,
            isHighFrequency: stats.count >= 4,
            specificityBoost: tagTokens.length > 1 ? 4 : 0,
          };
        });

      const hasStrongSpecificCandidate = rawTags.some(tag =>
        tag.exactContextMatch && (!tag.isBroadSingleToken || tag.usageCount > 1)
      );

      const tags = rawTags
        .map((tag) => {
          const hasWeakDirectMatch = tag.tagTokenOverlap <= 1 && tag.averageContextMatch <= 2;
          const genericPenalty = hasStrongSpecificCandidate && tag.isBroadSingleToken && tag.isHighFrequency && hasWeakDirectMatch
            ? 10
            : 0;
          const score = hasStrongSpecificCandidate
            ? (tag.exactContextMatch ? 12 : 0) +
              (tag.tagTokenOverlap * 5) +
              tag.specificityBoost +
              (tag.averageContextMatch * 3) +
              (tag.usageCount * 0.1) -
              genericPenalty -
              (!isTemporaryTarget && tag.isTemporaryOnly ? 2 : 0)
            : (tag.exactContextMatch ? 6 : 0) +
              (tag.tagTokenOverlap * 3) +
              (tag.averageContextMatch * 2) +
              (tag.usageCount * 1.5) +
              (tag.isTemporaryOnly ? -3 : 1) -
              (!isTemporaryTarget && tag.isTemporaryOnly ? 2 : 0);

          return {
            ...tag,
            score,
          };
        })
        .sort((a, b) => b.score - a.score || b.usageCount - a.usageCount || a.tag.localeCompare(b.tag));

      const durationMs = Date.now() - startTime;
      const vaultsSearched = new Set(entries.map(e => storageLabel(e.vault))).size;

      const lines: string[] = [];
      if (mode === "browse") {
        if (project && scope !== "global") {
          lines.push(`Tags for ${project.name} (scope: ${scope}):`);
        } else {
          lines.push(`Tags (scope: ${scope}):`);
        }
        lines.push("");
        lines.push(`Total: ${tags.length} unique tags across ${entries.length} notes (${durationMs}ms)`);
        lines.push("");
        lines.push("Tags sorted by usage:");
        for (const t of tags.slice(0, effectiveLimit)) {
          const lifecycleMark = t.isTemporaryOnly ? " [temp-only]" : "";
          lines.push(`  ${t.tag} (${t.usageCount})${lifecycleMark}`);
          if (t.examples.length > 0) {
            lines.push(`    Example: "${t.examples[0]}"`);
          }
        }
        if (tags.length > effectiveLimit) {
          lines.push(`  ... and ${tags.length - effectiveLimit} more`);
        }
      } else {
        const suggestedTags = tags.slice(0, effectiveLimit);
        if (project && scope !== "global") {
          lines.push(`Suggested tags for ${project.name} (scope: ${scope}):`);
        } else {
          lines.push(`Suggested tags (scope: ${scope}):`);
        }
        lines.push("");
        lines.push(`Considered ${tags.length} unique tags across ${entries.length} notes (${durationMs}ms)`);
        lines.push("");
        if (contextTokens.size === 0) {
          lines.push("No note context provided; showing the most canonical existing tags.");
          lines.push("");
        }
        lines.push("Recommended tags:");
        for (const t of suggestedTags) {
          const lifecycleMark = t.isTemporaryOnly ? " [temp-only]" : "";
          lines.push(`  ${t.tag} (${t.usageCount})${lifecycleMark}`);
          if (t.example) {
            lines.push(`    Example: "${t.example}"`);
          }
          lines.push(`    Why: ${t.reason}`);
        }
      }

      const structuredContent: DiscoverTagsResult = mode === "browse"
        ? {
            action: "tags_discovered",
            project: project ? { id: project.id, name: project.name } : undefined,
            mode,
            scope: scope || "all",
            tags: tags.slice(0, effectiveLimit).map(tag => ({
              tag: tag.tag,
              usageCount: tag.usageCount,
              examples: tag.examples,
              lifecycleTypes: tag.lifecycleTypes,
              isTemporaryOnly: tag.isTemporaryOnly,
            })),
            totalTags: tags.length,
            totalNotes: entries.length,
            vaultsSearched,
            durationMs,
          }
        : {
            action: "tags_discovered",
            project: project ? { id: project.id, name: project.name } : undefined,
            mode,
            scope: scope || "all",
            recommendedTags: tags.slice(0, effectiveLimit).map(tag => ({
              tag: tag.tag,
              usageCount: tag.usageCount,
              example: tag.example,
              reason: tag.reason,
              lifecycleTypes: tag.lifecycleTypes,
              isTemporaryOnly: tag.isTemporaryOnly,
            })),
            totalTags: tags.length,
            totalNotes: entries.length,
            vaultsSearched,
            durationMs,
          };

      return { content: [{ type: "text", text: lines.join("\n") }], structuredContent };
    }
  );
}
