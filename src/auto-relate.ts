import { buildProjection, extractProjectionSummary } from "./projections.js";
import { computeLexicalScore, normalizeText, tokenize } from "./lexical.js";
import type { Note, Relationship } from "./storage.js";

export interface SessionAccessCandidate {
  note: Note;
  accessedAt: string;
  accessKind: "get" | "recall" | "summary";
  score?: number;
}

const MIN_TITLE_MENTION_LENGTH = 12;
const MAX_AUTO_RELATIONSHIPS = 2;
const STRONG_OVERLAP_THRESHOLD = 0.42;

function hasExplicitTitleMention(source: Note, candidate: Note): boolean {
  const normalizedTitle = normalizeText(candidate.title);
  if (normalizedTitle.length < MIN_TITLE_MENTION_LENGTH) {
    return false;
  }

  const haystack = normalizeText(`${source.title}\n${source.content}`);
  return haystack.includes(normalizedTitle);
}

function computeSharedTagScore(source: Note, candidate: Note): number {
  if (source.tags.length === 0 || candidate.tags.length === 0) {
    return 0;
  }

  const sourceTags = new Set(source.tags.map((tag) => normalizeText(tag)));
  const candidateTags = new Set(candidate.tags.map((tag) => normalizeText(tag)));
  let shared = 0;
  for (const tag of sourceTags) {
    if (candidateTags.has(tag)) {
      shared++;
    }
  }

  return Math.min(shared, 3) * 0.08;
}

function computeTitleTokenOverlap(source: Note, candidate: Note): number {
  const sourceTokens = new Set(tokenize(source.title));
  const candidateTokens = new Set(tokenize(candidate.title));
  if (sourceTokens.size === 0 || candidateTokens.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) {
      shared++;
    }
  }

  return shared / Math.max(sourceTokens.size, candidateTokens.size);
}

export function suggestAutoRelationships(
  source: Note,
  candidates: SessionAccessCandidate[],
): Relationship[] {
  const existingIds = new Set((source.relatedTo ?? []).map((rel) => rel.id));
  const ranked = candidates
    .filter((candidate) => candidate.note.id !== source.id)
    .filter((candidate) => candidate.note.lifecycle === "permanent")
    .filter((candidate) => candidate.note.project === source.project)
    .filter((candidate) => !existingIds.has(candidate.note.id))
    .map((candidate) => {
      const explicitMention = hasExplicitTitleMention(source, candidate.note);
      const sourceSummary = extractProjectionSummary(source);
      const candidateProjection = buildProjection(candidate.note).projectionText;
      const lexical = computeLexicalScore(sourceSummary || source.title, candidateProjection);
      const titleOverlap = computeTitleTokenOverlap(source, candidate.note);
      const sharedTags = computeSharedTagScore(source, candidate.note);
      const recencyBoost = candidate.score ? Math.min(candidate.score, 1) * 0.05 : 0;
      const score =
        (explicitMention ? 1 : 0) +
        lexical * 0.45 +
        titleOverlap * 0.2 +
        sharedTags +
        recencyBoost;

      return { candidate, explicitMention, lexical, score };
    })
    .filter(({ explicitMention, lexical, score }) => explicitMention || (lexical >= STRONG_OVERLAP_THRESHOLD && score >= 0.32))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.candidate.accessedAt.localeCompare(left.candidate.accessedAt);
    })
    .slice(0, MAX_AUTO_RELATIONSHIPS);

  return ranked.map(({ candidate }) => ({ id: candidate.note.id, type: "related-to" }));
}
