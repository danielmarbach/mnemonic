import type { Vault } from "./vault.js";
import type { EffectiveNoteMetadata } from "./role-suggestions.js";

const RECALL_ALWAYS_LOAD_BOOST = 0.01;
const RECALL_SUMMARY_BOOST = 0.012;
const RECALL_DECISION_BOOST = 0.009;
const RECALL_HIGH_IMPORTANCE_BOOST = 0.006;

export interface ScoredRecallCandidate {
  id: string;
  score: number;
  boosted: number;
  vault: Vault;
  isCurrentProject: boolean;
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

export function selectRecallResults(
  scored: ScoredRecallCandidate[],
  limit: number,
  scope: "project" | "global" | "all"
): ScoredRecallCandidate[] {
  const sorted = [...scored].sort((a, b) => b.boosted - a.boosted);

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
