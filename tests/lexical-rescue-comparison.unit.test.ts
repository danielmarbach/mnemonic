import { describe, expect, it } from "vitest";

import {
  computeLexicalScore,
  LEXICAL_RESCUE_CANDIDATE_LIMIT,
  LEXICAL_RESCUE_THRESHOLD,
  rankDocumentsByTfIdf,
} from "../src/lexical.js";

interface RescueDocument {
  id: string;
  text: string;
}

interface RescueQuery {
  query: string;
  targetId: string;
}

describe("lexical rescue comparison", () => {
  it("improves rare-term rescue ranking over the previous bounded lexical rescue path", () => {
    const documents = buildSyntheticCorpus();
    const rareTermQueries: RescueQuery[] = [
      { query: "projectiontext staleness", targetId: "projection-staleness-target" },
      { query: "projectiontext staleness derived retrieval text", targetId: "projection-staleness-target" },
      { query: "cache refresh projectiontext staleness", targetId: "projection-staleness-target" },
      { query: "workingstate continuity checkpoint", targetId: "working-state-target" },
      { query: "checkpoint continuity next action", targetId: "working-state-target" },
    ];

    const broadQueries: RescueQuery[] = [
      { query: "hybrid recall design", targetId: "hybrid-design-target" },
      { query: "projection overview", targetId: "projection-overview-target" },
    ];

    const t0Baseline = performance.now();
    const baselineRare = computeMeanReciprocalRank(rareTermQueries, (query) => rankByPreviousLexicalRescue(query, documents));
    const baselineBroad = computeMeanReciprocalRank(broadQueries, (query) => rankByPreviousLexicalRescue(query, documents));
    const baselineMs = performance.now() - t0Baseline;

    const t0TfIdf = performance.now();
    const tfIdfRare = computeMeanReciprocalRank(rareTermQueries, (query) => rankDocumentsByTfIdf(query, documents, documents.length));
    const tfIdfBroad = computeMeanReciprocalRank(broadQueries, (query) => rankDocumentsByTfIdf(query, documents, documents.length));
    const tfIdfMs = performance.now() - t0TfIdf;

    console.error(
      `[measurement] lexical-rescue rareTermMrr previous=${baselineRare.toFixed(3)} tfidf=${tfIdfRare.toFixed(3)} broadMrr previous=${baselineBroad.toFixed(3)} tfidf=${tfIdfBroad.toFixed(3)} previousMs=${baselineMs.toFixed(2)} tfidfMs=${tfIdfMs.toFixed(2)}`
    );

    expect(tfIdfRare).toBeGreaterThan(baselineRare);
    expect(tfIdfBroad).toBeGreaterThan(0);
  });
});

function rankByPreviousLexicalRescue(query: string, documents: RescueDocument[]): Array<{ id: string; score: number }> {
  const shortlisted: Array<{ id: string; score: number }> = [];

  for (const document of documents) {
    const score = computeLexicalScore(query, document.text);
    if (score < LEXICAL_RESCUE_THRESHOLD) {
      continue;
    }

    shortlisted.push({ id: document.id, score });
    if (shortlisted.length >= LEXICAL_RESCUE_CANDIDATE_LIMIT) {
      break;
    }
  }

  return shortlisted.sort((a, b) => b.score - a.score);
}

function computeMeanReciprocalRank(
  queries: RescueQuery[],
  ranker: (query: string) => Array<{ id: string; score: number }>
): number {
  let reciprocalRankSum = 0;

  for (const { query, targetId } of queries) {
    const ranked = ranker(query);
    const index = ranked.findIndex((entry) => entry.id === targetId);
    reciprocalRankSum += index >= 0 ? 1 / (index + 1) : 0;
  }

  return reciprocalRankSum / queries.length;
}

function buildSyntheticCorpus(): RescueDocument[] {
  const documents: RescueDocument[] = [];

  for (let i = 0; i < 60; i++) {
    documents.push({
      id: `projection-decoy-${i}`,
      text: "ProjectionText staleness notes for derived retrieval text, broad indexing, and general design guidance.",
    });
  }

  for (let i = 0; i < 20; i++) {
    documents.push({
      id: `workflow-decoy-${i}`,
      text: "Workflow continuity notes and general next action guidance for project operations.",
    });
  }

  for (let i = 0; i < 20; i++) {
    documents.push({
      id: `unrelated-${i}`,
      text: "Weekly menu planning, cooking recipes, and travel logistics.",
    });
  }

  documents.push(
    {
      id: "projection-staleness-target",
      text: "ProjectionText staleness handling for derived retrieval text and cache refresh behavior.",
    },
    {
      id: "working-state-target",
      text: "WorkingState continuity checkpoint keeps the next action and blocker context for resume flow.",
    },
    {
      id: "hybrid-design-target",
      text: "Hybrid recall design with reranking rescue and projections.",
    },
    {
      id: "projection-overview-target",
      text: "Projection overview for derived retrieval text and lexical indexing behavior.",
    }
  );

  return documents;
}
