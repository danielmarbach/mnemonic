import type { Note, NoteLifecycle } from "../storage.js";
import type { Vault } from "../vault.js";
import { getEffectiveMetadata } from "../role-suggestions.js";
import { computeRecallMetadataBoost, type ScoredRecallCandidate, type TemporalQueryHint, shouldApplyTemporalFiltering, computeTemporalRecencyBoost, isWithinTemporalFilterWindow } from "../recall.js";
import { getOrBuildProjection } from "../projections.js";
import { getSessionCachedProjectionTokens, setSessionCachedProjectionTokens } from "../cache.js";
import { tokenize, prepareTfIdfCorpusFromTokenizedDocuments, rankDocumentsByTfIdf, LEXICAL_RESCUE_CANDIDATE_LIMIT, LEXICAL_RESCUE_THRESHOLD, LEXICAL_RESCUE_RESULT_LIMIT } from "../lexical.js";

// ── Recall candidate context ──────────────────────────────────────────────────

export function buildRecallCandidateContext(note: Note) {
  const metadata = getEffectiveMetadata(note);
  const relatedCount = note.relatedTo?.length ?? 0;
  return {
    metadata,
    metadataBoost: computeRecallMetadataBoost(metadata),
    lifecycle: note.lifecycle,
    relatedCount,
    connectionDiversity: new Set((note.relatedTo ?? []).map((rel) => rel.type)).size,
    structureScore: Math.min(
      0.04,
      [
        note.content.includes("## ") ? 0.02 : 0,
        note.content.includes("- ") || note.content.includes("1. ") ? 0.01 : 0,
        note.content.length >= 400 ? 0.01 : 0,
      ].reduce((sum, value) => sum + value, 0)
    ),
  };
}

// ── Lexical rescue ────────────────────────────────────────────────────────────

export const PROJECT_SCOPE_BOOST = 0.03;

export async function collectLexicalRescueCandidates(
  vaults: Vault[],
  query: string,
  temporalQueryHint: TemporalQueryHint | undefined,
  project: { id: string; name: string } | undefined,
  scope: "project" | "global" | "all",
  tags: string[] | undefined,
  lifecycle: NoteLifecycle | undefined,
  existingIds: ScoredRecallCandidate[]
): Promise<ScoredRecallCandidate[]> {
  const projectId = project?.id;
  const applyTemporalFilter = shouldApplyTemporalFiltering(temporalQueryHint);
  const temporalFilterWindowDays = applyTemporalFilter ? temporalQueryHint?.filterWindowDays : undefined;
  const existingIdSet = new Set(existingIds.map((c) => c.id));
  const rescuePool: Array<{
    id: string;
    vault: Vault;
    isCurrentProject: boolean;
    updatedAt: string;
    projectionText: string;
    projectionTokens: string[];
    context: ReturnType<typeof buildRecallCandidateContext>;
  }> = [];

  for (const vault of vaults) {
    const notes = await vault.storage.listNotes().catch(() => []);
    for (const note of notes) {
      if (existingIdSet.has(note.id)) continue;

      if (tags && tags.length > 0) {
        const noteTags = new Set(note.tags);
        if (!tags.every((t) => noteTags.has(t))) continue;
      }

      if (lifecycle && note.lifecycle !== lifecycle) continue;

      const isProjectNote = note.project !== undefined;
      const isCurrentProject = project && note.project === project.id;

      if (scope === "project" && !isCurrentProject) continue;
      if (scope === "global" && isProjectNote) continue;
      if (
        applyTemporalFilter
        && temporalFilterWindowDays !== undefined
        && !isWithinTemporalFilterWindow(note.updatedAt, temporalFilterWindowDays)
      ) {
        continue;
      }

      const projection = await getOrBuildProjection(vault.storage, note).catch(() => undefined);
      if (!projection) continue;

      rescuePool.push({
        id: note.id,
        vault,
        isCurrentProject: Boolean(isCurrentProject),
        updatedAt: note.updatedAt,
        projectionText: projection.projectionText,
        projectionTokens: projectId
          ? getSessionCachedProjectionTokens(
            projectId,
            vault.storage.vaultPath,
            note.id,
            projection.projectionText
          ) ?? tokenize(projection.projectionText)
          : tokenize(projection.projectionText),
        context: buildRecallCandidateContext(note),
      });

      if (projectId) {
        setSessionCachedProjectionTokens(
          projectId,
          vault.storage.vaultPath,
          note.id,
          projection.projectionText,
          rescuePool[rescuePool.length - 1]!.projectionTokens
        );
      }
    }
  }

  const rescueDocuments = rescuePool.map((candidate) => ({
    id: candidate.id,
    text: candidate.projectionText,
  }));

  const preparedRescueCorpus = prepareTfIdfCorpusFromTokenizedDocuments(
    rescuePool.map((candidate) => ({
      id: candidate.id,
      text: candidate.projectionText,
      tokens: candidate.projectionTokens,
    }))
  );

  const rankedRescueIds = new Map(
    rankDocumentsByTfIdf(
      query,
      rescueDocuments,
      LEXICAL_RESCUE_CANDIDATE_LIMIT,
      preparedRescueCorpus
    ).map((candidate) => [candidate.id, candidate.score])
  );

  const candidates: ScoredRecallCandidate[] = [];
  for (const candidate of rescuePool) {
    const tfIdfScore = rankedRescueIds.get(candidate.id);
    if (tfIdfScore === undefined || tfIdfScore <= 0) continue;

    const lexicalScore = tfIdfScore;
    if (lexicalScore < LEXICAL_RESCUE_THRESHOLD) continue;

    const temporalBoost = temporalQueryHint
      ? computeTemporalRecencyBoost(candidate.updatedAt, temporalQueryHint)
      : 0;
    const boost = (candidate.isCurrentProject ? PROJECT_SCOPE_BOOST : 0) + candidate.context.metadataBoost + temporalBoost;
    candidates.push({
      id: candidate.id,
      score: lexicalScore,
      semanticScoreForPromotion: 0,
      boosted: boost,
      vault: candidate.vault,
      isCurrentProject: candidate.isCurrentProject,
      lexicalScore,
      lifecycle: candidate.context.lifecycle,
      relatedCount: candidate.context.relatedCount,
      connectionDiversity: candidate.context.connectionDiversity,
      structureScore: candidate.context.structureScore,
      metadata: candidate.context.metadata,
    });
  }

  return candidates
    .sort((a, b) => (b.lexicalScore ?? 0) - (a.lexicalScore ?? 0))
    .slice(0, LEXICAL_RESCUE_RESULT_LIMIT);
}

// ── Tag discovery helpers ─────────────────────────────────────────────────────

export type DiscoverTagStat = {
  count: number;
  examples: string[];
  lifecycles: Set<NoteLifecycle>;
  contextMatches: number;
  exactCandidateMatch: boolean;
};

export function tokenizeTagDiscoveryText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function countTokenOverlap(tokens: Set<string>, other: Iterable<string>): number {
  let matches = 0;
  for (const token of other) {
    if (tokens.has(token)) {
      matches++;
    }
  }
  return matches;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasExactTagContextMatch(tag: string, values: Array<string | undefined>): boolean {
  const normalizedTag = tag.toLowerCase();
  const pattern = new RegExp(`(^|[^a-z0-9_-])${escapeRegex(normalizedTag)}([^a-z0-9_-]|$)`);
  return values.some(value => value ? pattern.test(value.toLowerCase()) : false);
}