import type { Vault } from "./vault.js";
import type { EffectiveNoteMetadata } from "./role-suggestions.js";
import { computeLexicalScore, tokenize } from "./lexical.js";

const RECALL_ALWAYS_LOAD_BOOST = 0.01;
const RECALL_SUMMARY_BOOST = 0.012;
const RECALL_DECISION_BOOST = 0.009;
const RECALL_HIGH_IMPORTANCE_BOOST = 0.006;

/** Weight applied to lexical score when computing hybrid boosted score. */
const LEXICAL_HYBRID_WEIGHT = 0.12;
const COVERAGE_HYBRID_WEIGHT = 0.08;
const PHRASE_HYBRID_WEIGHT = 0.16;
const MIN_CANONICAL_EXPLANATION_SCORE = 0.5;
const WORKFLOW_ROLE_BOOSTS: Partial<Record<NonNullable<EffectiveNoteMetadata["role"]>, number>> = {
  plan: 0.03,
  review: 0.025,
  research: 0.02,
  context: 0.015,
  decision: 0.012,
  summary: 0.008,
};

export interface ScoredRecallCandidate {
  id: string;
  score: number;
  /** Semantic plausibility used to gate canonical explanation promotion. */
  semanticScoreForPromotion?: number;
  boosted: number;
  vault: Vault;
  isCurrentProject: boolean;
  /** Lexical overlap score in [0, 1]. Undefined when not computed. */
  lexicalScore?: number;
  /** Coverage of rarer query tokens across the current candidate set. */
  coverageScore?: number;
  /** Exact contiguous phrase coverage across significant query tokens. */
  phraseScore?: number;
  lifecycle?: "temporary" | "permanent";
  relatedCount?: number;
  connectionDiversity?: number;
  structureScore?: number;
  metadata?: EffectiveNoteMetadata;
  canonicalExplanationScore?: number;
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
 * Compute a hybrid score that combines semantic similarity with additive
 * lexical, coverage, phrase, and canonical explanation signals.
 *
 * The formula is:
 * boosted
 *   + LEXICAL_HYBRID_WEIGHT * lexical
 *   + COVERAGE_HYBRID_WEIGHT * coverage
 *   + PHRASE_HYBRID_WEIGHT * phrase
 *   + canonicalExplanation
 *
 * These additive signals act as tiebreakers and small reranking signals. They
 * cannot overcome a large semantic gap but can reorder close candidates.
 */
export function computeHybridScore(candidate: ScoredRecallCandidate): number {
  const lexical = candidate.lexicalScore ?? 0;
  const coverage = candidate.coverageScore ?? 0;
  const phrase = candidate.phraseScore ?? 0;
  const canonical = candidate.canonicalExplanationScore ?? 0;
  return candidate.boosted + LEXICAL_HYBRID_WEIGHT * lexical + COVERAGE_HYBRID_WEIGHT * coverage + PHRASE_HYBRID_WEIGHT * phrase + canonical;
}

export function computeCanonicalExplanationScore(candidate: ScoredRecallCandidate): number {
  if ((candidate.semanticScoreForPromotion ?? 0) < MIN_CANONICAL_EXPLANATION_SCORE) {
    return 0;
  }

  const permanence = candidate.lifecycle === "permanent" ? 0.05 : 0;
  const role = candidate.metadata?.role === "decision"
    ? 0.05
    : candidate.metadata?.role === "context"
      ? 0.04
      : candidate.metadata?.role === "summary"
        ? 0.02
        : 0;
  const centrality = Math.min(0.05, Math.log((candidate.relatedCount ?? 0) + 1) * 0.02);
  const diversity = Math.min(0.04, (candidate.connectionDiversity ?? 0) * 0.015);
  const structure = Math.min(0.03, candidate.structureScore ?? 0);
  const wording = Math.min(0.01, candidate.lexicalScore ?? 0);

  return permanence + role + centrality + diversity + structure + wording;
}

export function applyCanonicalExplanationPromotion(candidates: ScoredRecallCandidate[]): ScoredRecallCandidate[] {
  for (const candidate of candidates) {
    candidate.canonicalExplanationScore = computeCanonicalExplanationScore(candidate);
  }

  return [...candidates].sort((a, b) => computeHybridScore(b) - computeHybridScore(a));
}

function computeSignificantPhraseScore(query: string, candidateText: string): number {
  const phraseTokens = Array.from(new Set(tokenize(query))).filter((token) => token.length >= 4);
  if (phraseTokens.length < 2) {
    return 0;
  }

  const normalizedCandidate = tokenize(candidateText).join(" ");
  return normalizedCandidate.includes(phraseTokens.join(" ")) ? 1 : 0;
}

function computeWeightedQueryCoverage(query: string, candidateText: string, corpusTexts: string[]): number {
  const queryTokens = Array.from(new Set(tokenize(query))).filter((token) => token.length >= 4);
  if (queryTokens.length === 0) {
    return 0;
  }

  const candidateTokens = new Set(tokenize(candidateText));
  const corpusTokenSets = corpusTexts.map((text) => new Set(tokenize(text)));
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const token of queryTokens) {
    const documentFrequency = corpusTokenSets.reduce((count, tokens) => count + (tokens.has(token) ? 1 : 0), 0);
    const weight = 1 / Math.max(documentFrequency, 1);
    totalWeight += weight;
    if (candidateTokens.has(token)) {
      matchedWeight += weight;
    }
  }

  return totalWeight === 0 ? 0 : matchedWeight / totalWeight;
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
  const corpusTexts = candidates
    .map((candidate) => getProjectionText(candidate.id))
    .filter((text): text is string => Boolean(text));

  for (const candidate of candidates) {
    const projText = getProjectionText(candidate.id);
    if (projText) {
      candidate.lexicalScore = computeLexicalScore(query, projText);
      candidate.coverageScore = computeWeightedQueryCoverage(query, projText, corpusTexts);
      candidate.phraseScore = computeSignificantPhraseScore(query, projText);
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

function computeWorkflowScore(candidate: ScoredRecallCandidate): number {
  const roleBoost = candidate.metadata?.role ? (WORKFLOW_ROLE_BOOSTS[candidate.metadata.role] ?? 0) : 0;
  const temporaryBoost = candidate.lifecycle === "temporary" ? 0.01 : 0;
  const centralityBoost = Math.min(0.015, Math.log((candidate.relatedCount ?? 0) + 1) * 0.006);
  return computeHybridScore(candidate) + roleBoost + temporaryBoost + centralityBoost;
}

export function selectWorkflowResults(
  scored: ScoredRecallCandidate[],
  limit: number,
  scope: "project" | "global" | "all"
): ScoredRecallCandidate[] {
  const sorted = [...scored].sort((a, b) => computeWorkflowScore(b) - computeWorkflowScore(a));

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
