import type { Vault } from "./vault.js";
import type { EffectiveNoteMetadata } from "./role-suggestions.js";
import { computeLexicalScore } from "./lexical.js";

const RECALL_ALWAYS_LOAD_BOOST = 0.01;
const RECALL_SUMMARY_BOOST = 0.012;
const RECALL_DECISION_BOOST = 0.009;
const RECALL_HIGH_IMPORTANCE_BOOST = 0.006;

/** Weight applied to lexical score when computing hybrid boosted score. */
const LEXICAL_HYBRID_WEIGHT = 0.12;

export interface ScoredRecallCandidate {
  id: string;
  score: number;
  boosted: number;
  vault: Vault;
  isCurrentProject: boolean;
  /** Lexical overlap score in [0, 1]. Undefined when not computed. */
  lexicalScore?: number;
}

export function computeRecallMetadataBoost(metadata?: EffectiveNoteMetadata): number {
  if (!metadata) {
    return 0;
  }

  let boost = 0;

  if (metadata.alwaysLoad === true && metadata.alwaysLoadSource === "explicit") {
    boost += RECALL_ALWAYS_LOAD_BOOST;
  }

  if (metadata.role === "summary") {
    boost += RECALL_SUMMARY_BOOST;
  } else if (metadata.role === "decision") {
    boost += RECALL_DECISION_BOOST;
  }

  if (metadata.importance === "high") {
    boost += RECALL_HIGH_IMPORTANCE_BOOST;
  }

  return boost;
}

/**
 * Compute a hybrid score that combines semantic similarity with lexical overlap.
 *
 * The formula is: boosted + LEXICAL_HYBRID_WEIGHT * lexicalScore
 *
 * Lexical score acts as a tiebreaker and small reranking signal — it cannot
 * overcome a large semantic gap but can reorder close candidates.
 */
export function computeHybridScore(candidate: ScoredRecallCandidate): number {
  const lexical = candidate.lexicalScore ?? 0;
  return candidate.boosted + LEXICAL_HYBRID_WEIGHT * lexical;
}

/**
 * Apply lexical reranking to a set of semantic candidates.
 *
 * For each candidate, compute lexical overlap against the query using the
 * provided projection text, then re-sort by hybrid score.
 *
 * When projection text is unavailable for a candidate, lexicalScore stays
 * undefined and contributes 0 to the hybrid score.
 */
export function applyLexicalReranking(
  candidates: ScoredRecallCandidate[],
  query: string,
  getProjectionText: (id: string) => string | undefined
): ScoredRecallCandidate[] {
  for (const candidate of candidates) {
    const projText = getProjectionText(candidate.id);
    if (projText) {
      candidate.lexicalScore = computeLexicalScore(query, projText);
    }
  }

  return [...candidates].sort((a, b) => computeHybridScore(b) - computeHybridScore(a));
}

export function selectRecallResults(
  scored: ScoredRecallCandidate[],
  limit: number,
  scope: "project" | "global" | "all"
): ScoredRecallCandidate[] {
  const sorted = [...scored].sort((a, b) => computeHybridScore(b) - computeHybridScore(a));

  if (scope !== "all") {
    return sorted.slice(0, limit);
  }

  const projectMatches = sorted.filter((candidate) => candidate.isCurrentProject);
  if (projectMatches.length === 0) {
    return sorted.slice(0, limit);
  }

  const topProject = projectMatches.slice(0, limit);
  if (topProject.length >= limit) {
    return topProject;
  }

  const selectedIds = new Set(topProject.map((candidate) => candidate.id));
  const fallback = sorted.filter((candidate) => !selectedIds.has(candidate.id));
  return [...topProject, ...fallback].slice(0, limit);
}
