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

  it("measures rescue tradeoffs on a more realistic note-shaped corpus", () => {
    const documents = buildRealisticCorpus();
    const rareTermQueries: RescueQuery[] = [
      { query: "projectiontext staleness", targetId: "projection-staleness-target" },
      { query: "workingstate continuity checkpoint", targetId: "working-state-target" },
      { query: "temporal interpretation stats context", targetId: "temporal-stats-target" },
    ];

    const broadQueries: RescueQuery[] = [
      { query: "hybrid recall design", targetId: "hybrid-design-target" },
      { query: "dogfooding test packs", targetId: "dogfooding-pack-target" },
      { query: "language independent role heuristics", targetId: "language-independence-target" },
    ];

    const t0Previous = performance.now();
    const previousRare = computeMeanReciprocalRank(rareTermQueries, (query) => rankByPreviousLexicalRescue(query, documents));
    const previousBroad = computeMeanReciprocalRank(broadQueries, (query) => rankByPreviousLexicalRescue(query, documents));
    const previousMs = performance.now() - t0Previous;

    const t0TfIdf = performance.now();
    const tfIdfRare = computeMeanReciprocalRank(rareTermQueries, (query) => rankDocumentsByTfIdf(query, documents, documents.length));
    const tfIdfBroad = computeMeanReciprocalRank(broadQueries, (query) => rankDocumentsByTfIdf(query, documents, documents.length));
    const tfIdfMs = performance.now() - t0TfIdf;

    console.error(
      `[measurement] lexical-rescue realistic rareTermMrr previous=${previousRare.toFixed(3)} tfidf=${tfIdfRare.toFixed(3)} broadMrr previous=${previousBroad.toFixed(3)} tfidf=${tfIdfBroad.toFixed(3)} previousMs=${previousMs.toFixed(2)} tfidfMs=${tfIdfMs.toFixed(2)}`
    );

    expect(previousRare).toBeGreaterThan(0);
    expect(tfIdfRare).toBeGreaterThan(0);
    expect(previousBroad).toBeGreaterThan(0);
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

function buildRealisticCorpus(): RescueDocument[] {
  const documents: RescueDocument[] = [];

  for (let i = 0; i < 35; i++) {
    documents.push({
      id: `design-decoy-${i}`,
      text: [
        `Title: Design note ${i}`,
        "Lifecycle: permanent",
        "Tags: design, recall",
        "Summary: General recall design notes for hybrid retrieval, ranking behavior, and projection usage.",
        "Headings: Overview | Constraints | Tradeoffs",
      ].join("\n"),
    });
  }

  for (let i = 0; i < 25; i++) {
    documents.push({
      id: `workflow-decoy-${i}`,
      text: [
        `Title: Checkpoint note ${i}`,
        "Lifecycle: temporary",
        "Tags: workflow, checkpoint",
        "Summary: General workflow continuity note with next action guidance and blockers for ongoing work.",
        "Headings: Status | Attempts | Next Action",
      ].join("\n"),
    });
  }

  for (let i = 0; i < 15; i++) {
    documents.push({
      id: `temporal-decoy-${i}`,
      text: [
        `Title: Temporal note ${i}`,
        "Lifecycle: permanent",
        "Tags: temporal, provenance",
        "Summary: Temporal interpretation overview with history summary and change categories.",
        "Headings: History | Interpretation | Output",
      ].join("\n"),
    });
  }

  for (let i = 0; i < 15; i++) {
    documents.push({
      id: `misc-decoy-${i}`,
      text: [
        `Title: Miscellaneous note ${i}`,
        "Lifecycle: permanent",
        "Tags: docs, notes",
        "Summary: Broad project notes, release guidance, and documentation structure.",
        "Headings: Summary | Notes",
      ].join("\n"),
    });
  }

  documents.push(
    {
      id: "projection-staleness-target",
      text: [
        "Title: Projection staleness handling",
        "Lifecycle: permanent",
        "Tags: projections, recall, design",
        "Summary: ProjectionText staleness handling for derived retrieval text and cache refresh behavior.",
        "Headings: Staleness | ProjectionText | Cache Refresh",
      ].join("\n"),
    },
    {
      id: "working-state-target",
      text: [
        "Title: Working-state continuity design",
        "Lifecycle: permanent",
        "Tags: workflow, temporary-notes, design",
        "Summary: WorkingState continuity checkpoint keeps the next action and blocker context for resume flow.",
        "Headings: Continuity | Checkpoint | Next Action",
      ].join("\n"),
    },
    {
      id: "temporal-stats-target",
      text: [
        "Title: Temporal interpretation strategy",
        "Lifecycle: permanent",
        "Tags: temporal, design",
        "Summary: Temporal interpretation uses stats context and history summaries instead of raw diffs.",
        "Headings: Temporal | Stats Context | History Summary",
      ].join("\n"),
    },
    {
      id: "hybrid-design-target",
      text: [
        "Title: Hybrid recall design and implementation",
        "Lifecycle: permanent",
        "Tags: recall, hybrid-search, design",
        "Summary: Hybrid recall design with reranking rescue and projections.",
        "Headings: Design Principles | Implementation | Tests",
      ].join("\n"),
    },
    {
      id: "dogfooding-pack-target",
      text: [
        "Title: Dogfooding test packs: reusable prompts and scorecards",
        "Lifecycle: permanent",
        "Tags: dogfooding, testing, prompt",
        "Summary: Reusable dogfooding test packs for validating recall, orientation, and continuity behavior.",
        "Headings: Pack A | Pack B | Pack C",
      ].join("\n"),
    },
    {
      id: "language-independence-target",
      text: [
        "Title: mnemonic language independent role heuristics",
        "Lifecycle: permanent",
        "Tags: roles, language-independence, design",
        "Summary: Language independent heuristics keep wording cues supplementary and avoid English-only bias.",
        "Headings: Rationale | Signals | Constraints",
      ].join("\n"),
    }
  );

  return documents;
}
