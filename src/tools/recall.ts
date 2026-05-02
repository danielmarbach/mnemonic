import { z } from "zod";
import { performance } from "perf_hooks";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../server-context.js";
import type { Vault } from "../vault.js";
import type { Note, NoteLifecycle, RelationshipType } from "../storage.js";
import { memoryId } from "../brands.js";
import {
  Confidence,
  RecallResult,
  RecallResultSchema,
  RetrievalEvidence,
  RelationshipPreview,
  ProjectRef,
} from "../structured-content.js";
import { embed, cosineSimilarity } from "../embeddings.js";
import {
  detectTemporalQueryHint,
  shouldApplyTemporalFiltering,
  isWithinTemporalFilterWindow,
  computeTemporalRecencyBoost,
  computeHybridScore,
  selectRecallResults,
  selectWorkflowResults,
  applyLexicalReranking,
  enrichRescueCandidateScores,
  resolveDiscoveredVaults,
  applyCanonicalExplanationPromotion,
  applyGraphSpreadingActivation,
  assignDenseRanks,
  type TemporalQueryHint,
  type ScoredRecallCandidate,
} from "../recall.js";
import { shouldTriggerLexicalRescue } from "../lexical.js";
import {
  getOrBuildVaultEmbeddings,
  setSessionCachedProjection,
  getSessionCachedProjection,
  recordSessionNoteAccess,
  setSessionCachedNote,
  getSessionCachedNote,
} from "../cache.js";
import { getOrBuildProjection } from "../projections.js";
import { embedMissingNotes } from "../helpers/embed.js";
import {
  ensureBranchSynced,
  resolveProject,
  noteProjectRef,
  projectParam,
} from "../helpers/project.js";
import { storageLabel } from "../helpers/vault.js";
import {
  formatNote,
  formatTemporalHistory,
  formatRelationshipPreview,
  toRecallFreshness,
  toRecallRankBand,
  formatRetrievalEvidenceHint,
} from "../helpers/index.js";
import {
  getNoteProvenance,
  buildTemporalHistoryEntry,
  computeConfidence,
} from "../provenance.js";
import { enrichTemporalHistory } from "../temporal-interpretation.js";
import { getRelationshipPreview } from "../relationships.js";
import { collectLexicalRescueCandidates, buildRecallCandidateContext } from "./recall-helpers.js";

export function registerRecallTool(server: McpServer, ctx: ServerContext): void {
  server.registerTool(
    "recall",
    {
      title: "Recall",
      description:
        "Semantic search over stored memories using embeddings.\n\n" +
        "Supports opt-in temporal mode (`mode: \"temporal\"`) to enrich top semantic matches with compact git-backed history.\n\n" +
        "Supports workflow mode (`mode: \"workflow\"`) to prioritize RPIR-style chain reconstruction while retaining compatibility with legacy relationships.\n\n" +
        "Use this when:\n" +
        "- You know the topic but not the exact memory id\n" +
        "- You are starting a session and want relevant prior context\n" +
        "- You want to check whether a memory already exists before creating another one\n" +
        "- You explicitly want to inspect how a note evolved over time\n\n" +
        "Do not use this when:\n" +
        "- You already know the exact id; use `get`\n" +
        "- You just want to browse by tags or scope; use `list`\n\n" +
        "Returns:\n" +
        "- Ranked memory matches with scores, vault label, tags, lifecycle, and updated time\n" +
        "- Bounded 1-hop relationship previews automatically attached to top results\n" +
        "- In temporal mode, optional compact history entries for top matches\n" +
        "- Optional retrieval evidence via `evidence: \"compact\"` for why a result ranked\n\n" +
        "Read-only.\n\n" +
        "Typical next step:\n" +
        "- Use `get`, `update`, `relate`, or `consolidate` based on the results.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query describing the topic, decision, bug, preference, or context you want to find."),
        cwd: projectParam,
        limit: z.number().int().min(1).max(20).optional().default(ctx.defaultRecallLimit),
        minSimilarity: z.number().min(0).max(1).optional().default(ctx.defaultMinSimilarity),
        mode: z.enum(["default", "temporal", "workflow"]).optional().default("default").describe("Use `temporal` for compact git-backed history, or `workflow` for RPIR-oriented chain reconstruction."),
        verbose: z.boolean().optional().default(false).describe("Only meaningful with `mode: \"temporal\"`. Adds richer stats-based history context without returning raw diffs."),
        evidence: z.enum(["compact"]).optional().describe("Optional retrieval rationale. Omit for default output; use `compact` for bounded rank and lineage signals."),
        tags: z.array(z.string()).optional().describe("Filter results to notes with all of these tags."),
        scope: z
          .enum(["project", "global", "all"])
          .optional()
          .default("all")
          .describe(
            "'project' = only this project's memories (project-scoped storage), " +
            "'global' = only unscoped memories (main/global storage), " +
            "'all' = both, with project notes boosted (default)"
          ),
        lifecycle: z.enum(["temporary", "permanent"]).optional().describe("Filter results by lifecycle. Useful for recovering working-state with `lifecycle: temporary` after `project_memory_summary` orientation."),
      }),
      outputSchema: RecallResultSchema,
    },
    async ({ query, cwd, limit, minSimilarity, mode, verbose, evidence, tags, scope, lifecycle }) => {
      const t0Recall = performance.now();
      await ensureBranchSynced(ctx, cwd);

      const project = await resolveProject(ctx, cwd);
      const queryVec = await embed(query);
      const vaults = await ctx.vaultManager.searchOrder(cwd);
      const noteCache = new Map<string, Note>();

      const noteCacheKey = (vault: Vault, id: string): string => `${vault.storage.vaultPath}::${id}`;
      const readCachedNote = async (vault: Vault, id: string): Promise<Note | null> => {
        // Check session cache first (populated when getOrBuildVaultEmbeddings was called)
        if (project) {
          const sessionNote = getSessionCachedNote(project.id, vault.storage.vaultPath, id);
          if (sessionNote !== undefined) return sessionNote;
        }
        const key = noteCacheKey(vault, id);
        const cached = noteCache.get(key);
        if (cached) {
          return cached;
        }

        const note = await vault.storage.readNote(memoryId(id));
        if (note) {
          noteCache.set(key, note);
        }

        return note;
      };

      await Promise.allSettled(
        vaults.map((vault) =>
          embedMissingNotes(ctx, vault.storage).catch(() => { /* best-effort: don't block recall if Ollama is down */ }),
        ),
      );

      const scored: ScoredRecallCandidate[] = [];
      const temporalQueryHint = detectTemporalQueryHint(query);
      const applyTemporalFilter = shouldApplyTemporalFiltering(temporalQueryHint);
      const temporalFilterWindowDays = applyTemporalFilter ? temporalQueryHint?.filterWindowDays : undefined;

      for (const vault of vaults) {
        const embeddings = project
          ? (await getOrBuildVaultEmbeddings(project.id, vault)) ?? await vault.storage.listEmbeddings()
          : await vault.storage.listEmbeddings();

        for (const rec of embeddings) {
          const rawScore = cosineSimilarity(queryVec, rec.embedding);
          if (rawScore < minSimilarity) continue;

          const note = await readCachedNote(vault, rec.id);
          if (!note) continue;

          if (tags && tags.length > 0) {
            const noteTags = new Set(note.tags);
            if (!tags.every((t) => noteTags.has(t))) continue;
          }

          if (lifecycle && note.lifecycle !== lifecycle) {
            continue;
          }

          const isProjectNote = note.project !== undefined;
          const isCurrentProject = project && note.project === project.id;

          if (scope === "project") {
            if (!isCurrentProject) continue;
          } else if (scope === "global") {
            if (isProjectNote) continue;
          }

          if (
            applyTemporalFilter
            && temporalFilterWindowDays !== undefined
            && !isWithinTemporalFilterWindow(note.updatedAt, temporalFilterWindowDays)
          ) {
            continue;
          }

          const context = buildRecallCandidateContext(note);
          const temporalBoost = temporalQueryHint
            ? computeTemporalRecencyBoost(note.updatedAt, temporalQueryHint)
            : 0;
          const boost = (isCurrentProject ? ctx.projectScopeBoost : 0) + context.metadataBoost + temporalBoost;
          scored.push({
            id: rec.id,
            score: rawScore,
            semanticScoreForPromotion: rawScore,
            boosted: rawScore + boost,
            vault,
            isCurrentProject: Boolean(isCurrentProject),
            lifecycle: context.lifecycle,
            relatedCount: context.relatedCount,
            connectionDiversity: context.connectionDiversity,
            structureScore: context.structureScore,
            metadata: context.metadata,
          });
        }
      }

      const projectionTexts = new Map<string, string>();
      const noteRelationships = new Map<string, Array<{ id: string; type: RelationshipType }>>();
      for (const candidate of scored) {
        const note = await readCachedNote(candidate.vault, candidate.id).catch(() => null);
        if (!note) {
          continue;
        }

        if (note.relatedTo && note.relatedTo.length > 0) {
          noteRelationships.set(candidate.id, note.relatedTo.map((r) => ({ id: r.id, type: r.type })));
        }

        const projection = await getOrBuildProjection(candidate.vault.storage, note).catch(() => undefined);
        if (!projection) {
          continue;
        }

        projectionTexts.set(candidate.id, projection.projectionText);
        if (project) {
          setSessionCachedProjection(project.id, candidate.id, projection);
        }
      }

      // Apply lexical reranking over semantic candidates (fail-soft)
      const getProjectionText = (id: string): string | undefined => {
        const inlineProjection = projectionTexts.get(id);
        if (inlineProjection) {
          return inlineProjection;
        }
        if (project) {
          const cached = getSessionCachedProjection(project.id, id);
          if (cached) return cached.projectionText;
        }
        return undefined;
      };
      const strongestSemanticScore = scored.reduce<number | undefined>(
        (max, candidate) => max === undefined ? candidate.score : Math.max(max, candidate.score),
        undefined
      );
      const reranked = applyLexicalReranking(scored, query, getProjectionText);
      const semanticCandidateIds = new Set(reranked.map((candidate) => candidate.id));

      // Apply graph spreading activation: traverse related notes and boost their scores
      const preSpreadIds = new Set(reranked.map((c) => c.id));
      const getNoteRelationships = (id: string): Array<{ id: string; type: RelationshipType }> | undefined => {
        return noteRelationships.get(id);
      };
      const withGraphSpread = applyGraphSpreadingActivation(reranked, getNoteRelationships);
      const graphDiscoveredIds = new Set(withGraphSpread.filter((candidate) => !semanticCandidateIds.has(candidate.id)).map((candidate) => candidate.id));

      // Resolve correct vault for graph-discovered candidates that inherited their
      // entry point's vault instead of their own.
      await resolveDiscoveredVaults(withGraphSpread, preSpreadIds, async (id) => {
        for (const v of vaults) {
          const note = await v.storage.readNote(memoryId(id)).catch(() => null);
          if (note) {
            const isCurrentProject = project ? note.project === project.id : false;
            return { vault: v, isCurrentProject };
          }
        }
        return undefined;
      });

      // Re-assign semanticRank after graph spreading since scores are now modified
      // and graph-discovered candidates have no semanticRank.
      const sortedByScore = [...withGraphSpread].sort((a, b) => b.score - a.score || b.boosted - a.boosted);
      assignDenseRanks(sortedByScore, (candidate) => candidate.score, (candidate, rank) => {
        candidate.semanticRank = rank;
      });

      let promoted = applyCanonicalExplanationPromotion(withGraphSpread);
      let rescueCandidateIds = new Set<string>();

      // Lexical rescue: when semantic results are weak, scan projections for additional candidates.
      // Skip rescue when the caller set a strict minSimilarity above the default,
      // because rescue candidates lack genuine semantic backing.
      const rescueAllowed = minSimilarity <= ctx.defaultMinSimilarity;
      if (rescueAllowed && shouldTriggerLexicalRescue(strongestSemanticScore, scored.length)) {
        const rescueCandidates = await collectLexicalRescueCandidates(
          vaults,
          query,
          temporalQueryHint,
          project ?? undefined,
          scope,
          tags,
          lifecycle,
          promoted
        );
        promoted.push(...rescueCandidates);
        rescueCandidateIds = new Set(rescueCandidates.map((candidate) => candidate.id));
        enrichRescueCandidateScores(promoted, query, getProjectionText);
        promoted = applyCanonicalExplanationPromotion(promoted);
      }

      const top = mode === "workflow"
        ? selectWorkflowResults(promoted, limit, scope)
        : selectRecallResults(promoted, limit, scope);

      if (top.length === 0) {
        const structuredContent: RecallResult = { action: "recalled", query, scope: scope || "all", results: [] };
        return { content: [{ type: "text", text: "No memories found matching that query." }], structuredContent };
      }

      const header = project
        ? `Recall results for project **${project.name}** (scope: ${scope}):`
        : `Recall results (global):`;

      const sections: string[] = [];
      const structuredResults: Array<{
        id: string;
        title: string;
        score: number;
        boosted: number;
        project?: ProjectRef;
        vault: string;
        tags: string[];
        lifecycle: NoteLifecycle;
        role?: Note["role"];
        updatedAt: string;
        provenance?: {
          lastUpdatedAt: string;
          lastCommitHash: string;
          lastCommitMessage: string;
          recentlyChanged: boolean;
        };
        confidence?: Confidence;
        history?: Array<{
          commitHash: string;
          timestamp: string;
          message: string;
          summary?: string;
          stats?: {
            additions: number;
            deletions: number;
            filesChanged: number;
            changeType: "metadata-only change" | "minor edit" | "substantial update";
          };
        }>;
        historySummary?: string;
        relationships?: RelationshipPreview;
        retrievalEvidence?: RetrievalEvidence;
      }> = [];

      // Determine how many top results get relationship expansion
      // Top 1 by default, top 3 if result count is small
      const recallRelationshipLimit = top.length <= 3 ? 3 : 1;

      for (const [index, { id, score, vault, boosted, semanticRank, lexicalRank, canonicalExplanationScore, metadata, isCurrentProject }] of top.entries()) {
        const note = await readCachedNote(vault, id);
        if (note) {
          const centrality = note.relatedTo?.length ?? 0;
          const filePath = `${vault.notesRelDir}/${id}.md`;
          const provenance = await getNoteProvenance(vault.git, filePath);
          const confidence = computeConfidence(note.lifecycle, note.updatedAt, centrality);
          let history: Array<{
            commitHash: string;
            timestamp: string;
            message: string;
            summary?: string;
            stats?: {
              additions: number;
              deletions: number;
              filesChanged: number;
              changeType: "metadata-only change" | "minor edit" | "substantial update";
            };
          }> | undefined;

          let historySummary: string | undefined;

          if (mode === "temporal") {
            if (index < ctx.temporalHistoryNoteLimit) {
              const commits = await vault.git.getFileHistory(filePath, ctx.temporalHistoryCommitLimit);
              const rawHistory = await Promise.all(
                commits.map(async (commit) => {
                  const stats = await vault.git.getCommitStats(filePath, commit.hash);
                  return buildTemporalHistoryEntry(commit, stats, verbose);
                })
              );
              const enriched = enrichTemporalHistory(rawHistory);
              history = verbose
                ? enriched.interpretedHistory
                : enriched.interpretedHistory.map(entry => ({ ...entry, stats: undefined }));
              historySummary = enriched.historySummary;
            }
          }

          // Add relationship preview for top N results (fail-soft)
          let relationships: RelationshipPreview | undefined;
          if (index < recallRelationshipLimit) {
            relationships = await getRelationshipPreview(
              note,
              ctx.vaultManager.allKnownVaults(),
              { activeProjectId: project?.id, limit: 3 }
            );
          }

          const formattedHistory = mode === "temporal" && history !== undefined
            ? `\n\n${formatTemporalHistory(history)}`
            : "";
          const formattedRelationships = relationships !== undefined
            ? `\n\n${formatRelationshipPreview(relationships)}`
            : "";
          const provenanceLine = provenance || confidence
            ? `\n**confidence:** ${confidence ?? "medium"}${provenance?.recentlyChanged ? " | **recently changed**" : ""}`
            : "";
          const supersededRelations = (note.relatedTo ?? []).filter((rel) => rel.type === "supersedes");
          const retrievalEvidence: RetrievalEvidence | undefined = evidence === "compact"
            ? {
              channels: [
                semanticRank !== undefined ? "semantic" : undefined,
                lexicalRank !== undefined ? "lexical" : undefined,
                graphDiscoveredIds.has(id) ? "graph" : undefined,
                rescueCandidateIds.has(id) ? "rescue" : undefined,
                canonicalExplanationScore !== undefined && canonicalExplanationScore > 0 ? "canonical" : undefined,
                temporalQueryHint ? "temporal-boost" : undefined,
              ].filter((value): value is RetrievalEvidence["channels"][number] => value !== undefined),
              rankBand: toRecallRankBand(semanticRank),
              projectRelevant: isCurrentProject,
              freshness: toRecallFreshness(note.updatedAt),
              superseded: supersededRelations.length > 0,
              supersededBy: supersededRelations.length > 0 ? supersededRelations[0]?.id : undefined,
              supersededCount: supersededRelations.length > 0 ? supersededRelations.length : undefined,
            }
            : undefined;
          const evidenceLine = retrievalEvidence
            ? `\n${formatRetrievalEvidenceHint(retrievalEvidence, metadata?.role)}`
            : "";
          // Suppress raw related IDs when enriched preview is shown to avoid duplication
          sections.push(`${formatNote(note, score, relationships === undefined)}${provenanceLine}${evidenceLine}${formattedHistory}${formattedRelationships}`);

          structuredResults.push({
            id,
            title: note.title,
            score,
            boosted,
            project: noteProjectRef(note),
            vault: storageLabel(vault),
            tags: note.tags,
            lifecycle: note.lifecycle,
            role: note.role,
            updatedAt: note.updatedAt,
            provenance,
            confidence,
            history,
            historySummary,
            relationships,
            retrievalEvidence,
          });

          if (project) {
            setSessionCachedNote(project.id, vault.storage.vaultPath, note);
            recordSessionNoteAccess(project.id, vault.storage.vaultPath, id, "recall", computeHybridScore({
              id,
              score,
              boosted,
              vault,
              isCurrentProject: note.project === project.id,
            }));
          }
        }
      }

      const textContent = `${header}\n\n${sections.join("\n\n---\n\n")}`;

      const structuredContent: RecallResult = {
        action: "recalled",
        query,
        scope: scope || "all",
        results: structuredResults,
      };

      console.error(`[recall:timing] ${(performance.now() - t0Recall).toFixed(1)}ms`);
      return {
        content: [{ type: "text", text: textContent }],
        structuredContent,
      };
    }
  );
}
