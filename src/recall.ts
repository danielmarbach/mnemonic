import type { Vault } from "./vault.js";
import type { EffectiveNoteMetadata } from "./role-suggestions.js";
import { computeLexicalScore, tokenize } from "./lexical.js";
import { MS_PER_DAY } from "./date-utils.js";
import { UnknownRelationshipTypeError } from "./domain-errors.js";

import type { Confidence } from "./structured-content.js";
import type { RelationshipType } from "./storage.js";

const RRF_K = 60;
const RRF_RANK_WINDOW = 100;
const CANONICAL_HYBRID_WEIGHT = 0.05;

// RRF scaling factor: with K=60 and three channels, max RRF ≈ 3/60 ≈ 0.050.
// Multiplied by 3.0 ≈ 0.150, matching the old additive lexical weight's order-of-magnitude
// while remaining calibration-free.
const RRF_SCALING_FACTOR = 3.0;
const MAX_SEMANTIC_CONFIDENCE_PRIOR = 0.05;

const RECALL_ALWAYS_LOAD_BOOST = 0.01;
const RECALL_SUMMARY_BOOST = 0.012;
const RECALL_DECISION_BOOST = 0.009;
const RECALL_HIGH_IMPORTANCE_BOOST = 0.006;

const MAX_PROJECT_PRIOR = 0.005;
const MAX_TEMPORAL_PRIOR = 0.08;
const MAX_METADATA_PRIOR =
  RECALL_ALWAYS_LOAD_BOOST +
  Math.max(RECALL_SUMMARY_BOOST, RECALL_DECISION_BOOST) +
  RECALL_HIGH_IMPORTANCE_BOOST;
const MAX_CANONICAL_PRIOR = 0.0115;

const SPREADING_ENTRY_POINT_LIMIT = 5;
const SPREADING_HOP_DECAY = 0.5;
const SPREADING_ACTIVATION_GATE = 0.5;
const SPREADING_RELATED_TO_MULTIPLIER = 0.8;
const SPREADING_EXPLAINS_DERIVES_MULTIPLIER = 1.0;

const MIN_CANONICAL_EXPLANATION_SCORE = 0.5;
const WORKFLOW_ROLE_BOOSTS = {
  plan: 0.03,
  review: 0.025,
  research: 0.02,
  context: 0.015,
  decision: 0.012,
  summary: 0.008,
} as const;

export interface TemporalQueryHint {
  windowDays: number;
  maxBoost: number;
  confidence: Confidence;
  filterWindowDays?: number;
}

export interface ScoredRecallCandidate {
  id: string;
  /** Vault-qualified identity used when federated vaults contain duplicate note ids. */
  identityKey?: string;
  score: number;
  /** Semantic plausibility used to gate canonical explanation promotion. */
  semanticScoreForPromotion?: number;
  /** Rank from the initial semantic retrieval ordering (1-based). */
  semanticRank?: number;
  /** Rank from the lexical reranking step (1-based). */
  lexicalRank?: number;
  /** Graph spreading activation score. Undefined when no graph evidence exists. */
  graphScore?: number;
  /** Rank from the graph spreading activation channel (1-based). */
  graphRank?: number;
  /** Backward-compatible raw semantic score plus policy boosts for output/diagnostics. */
  boosted: number;
  vault: Vault;
  isCurrentProject: boolean;
  /** Lexical overlap score in [0, 1]. Undefined when not computed. */
  lexicalScore?: number;
  /** Score produced by the independent lexical candidate channel. */
  lexicalChannelScore?: number;
  /** Whether this candidate is present in the bounded lexical result list. */
  lexicalChannelCandidate?: boolean;
  /** Original semantic channel score, when semantic retrieval found this note. */
  semanticScore?: number;
  /** Bounded semantic confidence contribution to final ranking. */
  semanticConfidencePrior?: number;
  /** Bounded product-policy contributions to final ranking. */
  projectPrior?: number;
  temporalPrior?: number;
  metadataPrior?: number;
  /** Individual fusion and final-score contributions, populated during ranking. */
  rrfScore?: number;
  canonicalPrior?: number;
  finalScore?: number;
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

export function recallCandidateIdentity(candidate: ScoredRecallCandidate): string {
  return candidate.identityKey ?? `${candidate.vault.storage?.vaultPath ?? ""}::${candidate.id}`;
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

const TEMPORAL_QUERY_HINTS = [
  // Ordered by specificity (longer/more specific patterns first) to avoid first-match-wins issues.
  {
    pattern: /\b(in\s+the\s+past)\b/i,
    hint: { windowDays: 365, maxBoost: 0.03, confidence: "low" },
  },
  {
    pattern: /\b(this\s+year|last\s+year)\b/i,
    hint: { windowDays: 366, maxBoost: 0.03, confidence: "medium" },
  },
  {
    pattern: /\b(last\s+month)\b/i,
    hint: { windowDays: 62, maxBoost: 0.05, confidence: "medium" },
  },
  {
    pattern: /\b(this\s+month)\b/i,
    hint: { windowDays: 31, maxBoost: 0.05, confidence: "medium" },
  },
  { pattern: /\b(last\s+week)\b/i, hint: { windowDays: 14, maxBoost: 0.06, confidence: "medium" } },
  { pattern: /\b(this\s+week)\b/i, hint: { windowDays: 7, maxBoost: 0.06, confidence: "medium" } },
  { pattern: /\b(yesterday)\b/i, hint: { windowDays: 3, maxBoost: 0.08, confidence: "medium" } },
  { pattern: /\b(today|latest)\b/i, hint: { windowDays: 2, maxBoost: 0.08, confidence: "medium" } },
  {
    pattern: /\b(recent|recently|newest)\b/i,
    hint: { windowDays: 30, maxBoost: 0.05, confidence: "low" },
  },
] as const;

const EXPLICIT_TEMPORAL_WINDOW_PATTERN =
  /\b(?:past|last|the\s+last|in\s+the\s+last)\s+(\d{1,3})\s+(day|days|week|weeks|month|months|year|years)\b/i;

function toDays(value: number, unit: string): number {
  const normalized = unit.toLowerCase();
  if (normalized === "day" || normalized === "days") return value;
  if (normalized === "week" || normalized === "weeks") return value * 7;
  if (normalized === "month" || normalized === "months") return value * 31;
  return value * 366;
}

export function detectTemporalQueryHint(query: string): TemporalQueryHint | undefined {
  const explicitWindow = query.match(EXPLICIT_TEMPORAL_WINDOW_PATTERN);
  if (explicitWindow) {
    const valueStr = explicitWindow[1];
    const unit = explicitWindow[2];
    if (valueStr !== undefined && unit !== undefined) {
      const value = Number.parseInt(valueStr, 10);
      if (Number.isFinite(value) && value > 0) {
        const windowDays = toDays(value, unit);
        return {
          windowDays,
          filterWindowDays: windowDays,
          maxBoost: Math.min(0.08, 0.03 + Math.log10(value + 1) * 0.02),
          confidence: "high",
        };
      }
    }
  }

  for (const entry of TEMPORAL_QUERY_HINTS) {
    if (entry.pattern.test(query)) {
      return entry.hint;
    }
  }

  return undefined;
}

export function computeTemporalRecencyBoost(
  updatedAt: string,
  hint: TemporalQueryHint,
  now: Date = new Date(),
): number {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return 0;
  }

  const ageDays = Math.max(0, (now.getTime() - updated.getTime()) / MS_PER_DAY);
  if (ageDays > hint.windowDays) {
    return 0;
  }

  const freshness = 1 - ageDays / hint.windowDays;
  return hint.maxBoost * freshness;
}

export function shouldApplyTemporalFiltering(hint: TemporalQueryHint | undefined): boolean {
  return hint?.confidence === "high" && hint.filterWindowDays !== undefined;
}

export function isWithinTemporalFilterWindow(
  updatedAt: string,
  windowDays: number,
  now: Date = new Date(),
): boolean {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return true;
  }

  const ageDays = Math.max(0, (now.getTime() - updated.getTime()) / MS_PER_DAY);
  return ageDays <= windowDays;
}

/**
 * Compute the bounded hybrid score.
 *
 * Retrieval evidence is rank-only:
 *   RRF = Σ 1/(K + channelRank)
 *
 * Raw semantic magnitude is retained for diagnostics and rank assignment, but
 * never added directly to the fused score. Missing channels contribute zero.
 * The semantic confidence prior is deliberately capped so it can resolve close
 * results without defeating agreement from another retrieval channel.
 */
function clampPrior(value: number, maximum: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, value));
}

export function computeHybridScore(candidate: ScoredRecallCandidate): number {
  const semanticContribution =
    candidate.semanticRank !== undefined ? 1 / (RRF_K + candidate.semanticRank) : 0;
  const lexicalContribution =
    candidate.lexicalRank !== undefined ? 1 / (RRF_K + candidate.lexicalRank) : 0;
  const graphContribution =
    candidate.graphRank !== undefined ? 1 / (RRF_K + candidate.graphRank) : 0;
  const rrf = semanticContribution + lexicalContribution + graphContribution;

  const derivedSemanticConfidencePrior =
    (candidate.semanticScore ??
      (candidate.semanticRank !== undefined ? candidate.score : undefined)) !== undefined &&
    candidate.semanticRank !== undefined
      ? (candidate.semanticScore ?? candidate.score) * MAX_SEMANTIC_CONFIDENCE_PRIOR
      : 0;
  const semanticConfidencePrior = clampPrior(
    candidate.semanticConfidencePrior ?? derivedSemanticConfidencePrior,
    MAX_SEMANTIC_CONFIDENCE_PRIOR,
  );
  const projectPrior = clampPrior(candidate.projectPrior ?? 0, MAX_PROJECT_PRIOR);
  const temporalPrior = clampPrior(candidate.temporalPrior ?? 0, MAX_TEMPORAL_PRIOR);
  const metadataPrior = clampPrior(candidate.metadataPrior ?? 0, MAX_METADATA_PRIOR);
  const canonicalPrior = clampPrior(
    (candidate.canonicalExplanationScore ?? 0) * CANONICAL_HYBRID_WEIGHT,
    MAX_CANONICAL_PRIOR,
  );
  const rrfScore = rrf * RRF_SCALING_FACTOR;
  const finalScore =
    rrfScore +
    semanticConfidencePrior +
    projectPrior +
    temporalPrior +
    metadataPrior +
    canonicalPrior;

  candidate.rrfScore = rrfScore;
  candidate.semanticConfidencePrior = semanticConfidencePrior;
  candidate.canonicalPrior = canonicalPrior;
  candidate.finalScore = finalScore;

  return finalScore;
}

function computeLexicalRankSignal(candidate: ScoredRecallCandidate): number {
  if (candidate.lexicalChannelScore !== undefined) {
    return candidate.lexicalChannelScore;
  }

  const lexical = candidate.lexicalScore ?? 0;
  const coverage = candidate.coverageScore ?? 0;
  const phrase = candidate.phraseScore ?? 0;
  return lexical + coverage * 0.3 + phrase * 0.5;
}

function compareIds(a: ScoredRecallCandidate, b: ScoredRecallCandidate): number {
  return recallCandidateIdentity(a).localeCompare(recallCandidateIdentity(b));
}

const RANK_EPSILON = 1e-9;

export function assignDenseRanks<T>(
  items: T[],
  scoreOf: (item: T) => number,
  setRank: (item: T, rank: number | undefined) => void,
  rankWindow = RRF_RANK_WINDOW,
): void {
  let currentRank = 0;
  let previousScore: number | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
    if (i >= rankWindow) {
      setRank(item, undefined);
      continue;
    }
    const score = scoreOf(item);
    if (previousScore === undefined || Math.abs(score - previousScore) > RANK_EPSILON) {
      currentRank = i + 1;
      previousScore = score;
    }
    setRank(item, currentRank <= rankWindow ? currentRank : undefined);
  }
}

function compareByHybridScore(a: ScoredRecallCandidate, b: ScoredRecallCandidate): number {
  const hybridDelta = computeHybridScore(b) - computeHybridScore(a);
  if (hybridDelta !== 0) {
    return hybridDelta;
  }

  const lexicalDelta = computeLexicalRankSignal(b) - computeLexicalRankSignal(a);
  if (lexicalDelta !== 0) {
    return lexicalDelta;
  }

  return compareIds(a, b);
}

export function computeCanonicalExplanationScore(candidate: ScoredRecallCandidate): number {
  if ((candidate.semanticScoreForPromotion ?? 0) < MIN_CANONICAL_EXPLANATION_SCORE) {
    return 0;
  }

  const permanence = candidate.lifecycle === "permanent" ? 0.05 : 0;
  const role =
    candidate.metadata?.role === "decision"
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

export function applyCanonicalExplanationPromotion(
  candidates: ScoredRecallCandidate[],
): ScoredRecallCandidate[] {
  for (const candidate of candidates) {
    candidate.canonicalExplanationScore = computeCanonicalExplanationScore(candidate);
  }

  // Assign lexicalRank only to candidates with lexical evidence.
  const hasIndependentLexicalChannel = candidates.some(
    (candidate) => candidate.lexicalChannelCandidate !== undefined,
  );
  const sortedByLexical = candidates
    .filter(
      (candidate) =>
        (!hasIndependentLexicalChannel || candidate.lexicalChannelCandidate === true) &&
        computeLexicalRankSignal(candidate) > 0,
    )
    .sort((a, b) => {
      const lexicalDelta = computeLexicalRankSignal(b) - computeLexicalRankSignal(a);
      if (lexicalDelta !== 0) return lexicalDelta;
      return compareIds(a, b);
    });
  assignDenseRanks(sortedByLexical, computeLexicalRankSignal, (candidate, rank) => {
    candidate.lexicalRank = rank;
  });

  return [...candidates].sort(compareByHybridScore);
}

function computeSignificantPhraseScore(query: string, candidateText: string): number {
  const phraseTokens = Array.from(new Set(tokenize(query))).filter((token) => token.length >= 4);
  if (phraseTokens.length < 2) {
    return 0;
  }

  const normalizedCandidate = tokenize(candidateText).join(" ");
  return normalizedCandidate.includes(phraseTokens.join(" ")) ? 1 : 0;
}

function computeWeightedQueryCoverage(
  query: string,
  candidateText: string,
  corpusTexts: string[],
): number {
  const queryTokens = Array.from(new Set(tokenize(query))).filter((token) => token.length >= 4);
  if (queryTokens.length === 0) {
    return 0;
  }

  const candidateTokens = new Set(tokenize(candidateText));
  const corpusTokenSets = corpusTexts.map((text) => new Set(tokenize(text)));
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const token of queryTokens) {
    const documentFrequency = corpusTokenSets.reduce(
      (count, tokens) => count + (tokens.has(token) ? 1 : 0),
      0,
    );
    const weight = 1 / Math.max(documentFrequency, 1);
    totalWeight += weight;
    if (candidateTokens.has(token)) {
      matchedWeight += weight;
    }
  }

  return totalWeight === 0 ? 0 : matchedWeight / totalWeight;
}

/**
 * Apply lexical scoring to semantic candidates. Returns the same array.
 *
 * Computes lexical overlap, coverage, and phrase scores using projection
 * text.  When projection text is unavailable, lexicalScore stays undefined.
 *
 * Also assigns semanticRank (1-based) based on the current boosted ordering.
 * Sorting by RRF + canonical is deferred until applyCanonicalExplanationPromotion
 * so that lexicalRank can be assigned after all scores are known.
 */
export function applyLexicalReranking(
  candidates: ScoredRecallCandidate[],
  query: string,
  getProjectionText: (id: string, candidate?: ScoredRecallCandidate) => string | undefined,
): ScoredRecallCandidate[] {
  const corpusTexts = candidates
    .map((candidate) => getProjectionText(candidate.id, candidate))
    .filter((text): text is string => Boolean(text));

  for (const candidate of candidates) {
    const projText = getProjectionText(candidate.id, candidate);
    if (projText) {
      candidate.lexicalScore = computeLexicalScore(query, projText);
      candidate.coverageScore = computeWeightedQueryCoverage(query, projText, corpusTexts);
      candidate.phraseScore = computeSignificantPhraseScore(query, projText);
    }
  }

  // Assign semanticRank using dense semantic score ordering.
  // Tied semantic scores share the same rank so lexical rank can break ties.
  const sortedBySemantic = [...candidates].sort((a, b) => {
    const semanticDelta = b.score - a.score;
    return semanticDelta !== 0 ? semanticDelta : compareIds(a, b);
  });
  assignDenseRanks(
    sortedBySemantic,
    (candidate) => candidate.score,
    (candidate, rank) => {
      candidate.semanticRank = rank;
    },
  );

  return candidates;
}

export function enrichRescueCandidateScores(
  allCandidates: ScoredRecallCandidate[],
  query: string,
  getProjectionText: (id: string, candidate?: ScoredRecallCandidate) => string | undefined,
): void {
  const rescueIds = new Set(
    allCandidates
      .filter((c) => c.coverageScore === undefined && c.lexicalScore !== undefined)
      .map((c) => c.id),
  );
  if (rescueIds.size === 0) return;

  const corpusTexts = allCandidates
    .map((candidate) => getProjectionText(candidate.id, candidate))
    .filter((text): text is string => Boolean(text));

  for (const candidate of allCandidates) {
    if (!rescueIds.has(candidate.id)) continue;
    const projText = getProjectionText(candidate.id, candidate);
    if (projText) {
      candidate.coverageScore = computeWeightedQueryCoverage(query, projText, corpusTexts);
      candidate.phraseScore = computeSignificantPhraseScore(query, projText);
    }
  }
}

export function selectRecallResults(
  scored: ScoredRecallCandidate[],
  limit: number,
  scope: "project" | "global" | "all",
): ScoredRecallCandidate[] {
  void scope;
  const sorted = [...scored].sort(compareByHybridScore);
  return sorted.slice(0, limit);
}

function computeWorkflowScore(candidate: ScoredRecallCandidate): number {
  const roleBoost = candidate.metadata?.role
    ? (WORKFLOW_ROLE_BOOSTS[candidate.metadata.role as keyof typeof WORKFLOW_ROLE_BOOSTS] ?? 0)
    : 0;
  const temporaryBoost = candidate.lifecycle === "temporary" ? 0.01 : 0;
  const centralityBoost = Math.min(0.015, Math.log((candidate.relatedCount ?? 0) + 1) * 0.006);
  return computeHybridScore(candidate) + roleBoost + temporaryBoost + centralityBoost;
}

export function selectWorkflowResults(
  scored: ScoredRecallCandidate[],
  limit: number,
  scope: "project" | "global" | "all",
): ScoredRecallCandidate[] {
  void scope;
  const sorted = [...scored].sort((a, b) => {
    const workflowDelta = computeWorkflowScore(b) - computeWorkflowScore(a);
    if (workflowDelta !== 0) {
      return workflowDelta;
    }
    return compareByHybridScore(a, b);
  });

  return sorted.slice(0, limit);
}

function getRelationshipMultiplier(type: RelationshipType): number {
  switch (type) {
    case "explains":
    case "derives-from":
      return SPREADING_EXPLAINS_DERIVES_MULTIPLIER;
    case "related-to":
    case "example-of":
    case "supersedes":
    case "follows":
      return SPREADING_RELATED_TO_MULTIPLIER;
    default: {
      const _exhaustive: never = type;
      throw new UnknownRelationshipTypeError(_exhaustive);
    }
  }
}

export function applyGraphSpreadingActivation(
  candidates: ScoredRecallCandidate[],
  getNoteRelationships: (
    id: string,
    vault: Vault,
  ) => Array<{ id: string; type: RelationshipType; vaultPath?: string }> | undefined,
): ScoredRecallCandidate[] {
  if (candidates.length === 0) {
    return candidates;
  }

  const sortedByScore = [...candidates].sort((a, b) => {
    const scoreDelta = b.score - a.score;
    return scoreDelta !== 0 ? scoreDelta : compareIds(a, b);
  });
  const entryPoints = sortedByScore.slice(0, SPREADING_ENTRY_POINT_LIMIT);

  const eligibleEntries = entryPoints.filter((e) => e.score >= SPREADING_ACTIVATION_GATE);
  if (eligibleEntries.length === 0) {
    return candidates;
  }

  const candidateMap = new Map(candidates.map((c) => [recallCandidateIdentity(c), c]));
  const discovered = new Map<string, ScoredRecallCandidate>();

  for (const entry of eligibleEntries) {
    const entryVaultPath = entry.vault.storage?.vaultPath ?? "";
    const relationships = getNoteRelationships(entry.id, entry.vault);
    if (!relationships) continue;

    for (const rel of relationships) {
      const multiplier = getRelationshipMultiplier(rel.type);
      const propagatedScore = entry.score * SPREADING_HOP_DECAY * multiplier;

      const relatedVaultPath = rel.vaultPath ?? entryVaultPath;
      const relatedIdentity = `${relatedVaultPath}::${rel.id}`;
      const existingCandidate = candidateMap.get(relatedIdentity);
      if (existingCandidate) {
        existingCandidate.graphScore = (existingCandidate.graphScore ?? 0) + propagatedScore;
      } else if (!discovered.has(relatedIdentity)) {
        discovered.set(relatedIdentity, {
          id: rel.id,
          identityKey: relatedIdentity,
          score: 0,
          semanticScoreForPromotion: 0,
          graphScore: propagatedScore,
          boosted: 0,
          vault: entry.vault,
          isCurrentProject: entry.isCurrentProject,
        });
      } else {
        const existing = discovered.get(relatedIdentity);
        if (existing) {
          existing.graphScore = (existing.graphScore ?? 0) + propagatedScore;
        }
      }
    }
  }

  const withDiscovered =
    discovered.size === 0 ? candidates : [...candidates, ...discovered.values()];
  const sortedByGraph = withDiscovered
    .filter((candidate) => candidate.graphScore !== undefined)
    .sort((a, b) => {
      const graphDelta = (b.graphScore ?? 0) - (a.graphScore ?? 0);
      if (graphDelta !== 0) return graphDelta;
      return compareIds(a, b);
    });
  assignDenseRanks(
    sortedByGraph,
    (candidate) => candidate.graphScore ?? 0,
    (candidate, rank) => {
      candidate.graphRank = rank;
    },
  );

  return withDiscovered;
}

export function resolveDiscoveredVaults(
  candidates: ScoredRecallCandidate[],
  originalCandidateIds: Set<string>,
  resolveVault: (
    id: string,
    candidate: ScoredRecallCandidate,
  ) => Promise<{ vault: Vault; isCurrentProject: boolean } | undefined>,
): Promise<void> {
  const discovered = candidates.filter(
    (c) => !originalCandidateIds.has(recallCandidateIdentity(c)) && c.vault !== undefined,
  );
  if (discovered.length === 0) return Promise.resolve();

  return Promise.all(
    discovered.map(async (c) => {
      const resolved = await resolveVault(c.id, c);
      if (resolved) {
        c.vault = resolved.vault;
        c.identityKey = `${resolved.vault.storage.vaultPath}::${c.id}`;
        c.isCurrentProject = resolved.isCurrentProject;
      }
    }),
  ).then(() => {});
}
