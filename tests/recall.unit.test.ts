import { describe, expect, it } from "vitest";

import {
  computeRecallMetadataBoost,
  selectRecallResults,
  applyLexicalReranking,
  computeHybridScore,
  type ScoredRecallCandidate,
} from "../src/recall.js";
import type { EffectiveNoteMetadata } from "../src/role-suggestions.js";

const vault = {} as ScoredRecallCandidate["vault"];

describe("selectRecallResults", () => {
  it("prefers current-project matches before widening to global results", () => {
    const results = selectRecallResults(
      [
        { id: "global-best", score: 0.95, boosted: 0.95, vault, isCurrentProject: false },
        { id: "project-a", score: 0.72, boosted: 0.87, vault, isCurrentProject: true },
        { id: "project-b", score: 0.7, boosted: 0.85, vault, isCurrentProject: true },
        { id: "global-next", score: 0.8, boosted: 0.8, vault, isCurrentProject: false },
      ],
      3,
      "all"
    );

    expect(results.map((result) => result.id)).toEqual(["project-a", "project-b", "global-best"]);
  });

  it("returns only project matches when they fill the limit", () => {
    const results = selectRecallResults(
      [
        { id: "project-a", score: 0.82, boosted: 0.97, vault, isCurrentProject: true },
        { id: "project-b", score: 0.8, boosted: 0.95, vault, isCurrentProject: true },
        { id: "global-best", score: 0.99, boosted: 0.99, vault, isCurrentProject: false },
      ],
      2,
      "all"
    );

    expect(results.map((result) => result.id)).toEqual(["project-a", "project-b"]);
  });

  it("falls back to standard boosted ordering for non-all scopes or no project matches", () => {
    const candidates = [
      { id: "global-best", score: 0.9, boosted: 0.9, vault, isCurrentProject: false },
      { id: "project-a", score: 0.7, boosted: 0.85, vault, isCurrentProject: true },
    ];

    expect(selectRecallResults(candidates, 2, "global").map((result) => result.id)).toEqual([
      "global-best",
      "project-a",
    ]);
    expect(
      selectRecallResults(
        [{ id: "global-best", score: 0.9, boosted: 0.9, vault, isCurrentProject: false }],
        1,
        "all"
      ).map((result) => result.id)
    ).toEqual(["global-best"]);
  });

  it("keeps stronger project preference behavior intact after additive metadata boosts", () => {
    const results = selectRecallResults(
      [
        { id: "global-metadata", score: 0.91, boosted: 0.94, vault, isCurrentProject: false },
        { id: "project-a", score: 0.78, boosted: 0.93, vault, isCurrentProject: true },
        { id: "project-b", score: 0.76, boosted: 0.91, vault, isCurrentProject: true },
      ],
      2,
      "all"
    );

    expect(results.map((result) => result.id)).toEqual(["project-a", "project-b"]);
  });

  it("uses hybrid score for ordering when lexical scores are present", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "a", score: 0.5, boosted: 0.5, vault, isCurrentProject: true, lexicalScore: 0.9 },
      { id: "b", score: 0.52, boosted: 0.52, vault, isCurrentProject: true, lexicalScore: 0.1 },
    ];

    const results = selectRecallResults(candidates, 2, "all");
    expect(results.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("computeRecallMetadataBoost", () => {
  it("adds a small metadata boost", () => {
    const metadata: EffectiveNoteMetadata = {
      role: "summary",
      roleSource: "suggested",
      importance: "high",
      importanceSource: "suggested",
      alwaysLoadSource: "none",
    };

    const boost = computeRecallMetadataBoost(metadata);

    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThan(0.05);
  });

  it("keeps semantic-best results ahead when metadata boost is smaller", () => {
    const summaryMetadata: EffectiveNoteMetadata = {
      role: "summary",
      roleSource: "suggested",
      importanceSource: "none",
      alwaysLoadSource: "none",
    };

    const semanticBest = 0.92 + computeRecallMetadataBoost();
    const metadataBoosted = 0.9 + computeRecallMetadataBoost(summaryMetadata);

    expect(semanticBest).toBeGreaterThan(metadataBoosted);
  });
});

describe("computeHybridScore", () => {
  it("returns boosted score when no lexical score", () => {
    const candidate: ScoredRecallCandidate = { id: "a", score: 0.7, boosted: 0.8, vault, isCurrentProject: true };
    expect(computeHybridScore(candidate)).toBeCloseTo(0.8, 5);
  });

  it("adds lexical contribution when present", () => {
    const candidate: ScoredRecallCandidate = { id: "a", score: 0.7, boosted: 0.8, vault, isCurrentProject: true, lexicalScore: 1.0 };
    const hybrid = computeHybridScore(candidate);
    expect(hybrid).toBeGreaterThan(0.8);
  });

  it("lexical score cannot overcome large semantic gap", () => {
    const lowSemantic: ScoredRecallCandidate = { id: "a", score: 0.3, boosted: 0.3, vault, isCurrentProject: false, lexicalScore: 1.0 };
    const highSemantic: ScoredRecallCandidate = { id: "b", score: 0.8, boosted: 0.8, vault, isCurrentProject: false, lexicalScore: 0 };
    expect(computeHybridScore(highSemantic)).toBeGreaterThan(computeHybridScore(lowSemantic));
  });
});

describe("applyLexicalReranking", () => {
  it("computes lexical scores and reorders candidates", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "a", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
      { id: "b", score: 0.62, boosted: 0.62, vault, isCurrentProject: true },
    ];

    const projectionTexts = new Map([
      ["a", "Title: Design Decisions\nSummary: key design decisions for the system"],
      ["b", "Title: Random Note\nSummary: something unrelated"],
    ]);

    const reranked = applyLexicalReranking(candidates, "design decisions", (id) => projectionTexts.get(id));

    expect(reranked[0].lexicalScore).toBeGreaterThan(reranked[1].lexicalScore!);
    expect(reranked[0].id).toBe("a");
  });

  it("handles missing projection text gracefully", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "a", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
    ];

    const reranked = applyLexicalReranking(candidates, "test", () => undefined);

    expect(reranked[0].lexicalScore).toBeUndefined();
  });

  it("preserves all candidates after reranking", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "a", score: 0.5, boosted: 0.5, vault, isCurrentProject: true },
      { id: "b", score: 0.7, boosted: 0.7, vault, isCurrentProject: true },
    ];

    const reranked = applyLexicalReranking(candidates, "test", (id) => `text for ${id}`);

    expect(reranked).toHaveLength(2);
  });
});
