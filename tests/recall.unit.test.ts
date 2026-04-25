import { describe, expect, it } from "vitest";

import {
  computeRecallMetadataBoost,
  selectRecallResults,
  applyLexicalReranking,
  applyCanonicalExplanationPromotion,
  computeCanonicalExplanationScore,
  computeHybridScore,
  applyGraphSpreadingActivation,
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
      { id: "a", score: 0.5, boosted: 0.5, vault, isCurrentProject: true, semanticRank: 1, lexicalRank: 1 },
      { id: "b", score: 0.52, boosted: 0.52, vault, isCurrentProject: true, semanticRank: 2, lexicalRank: 50 },
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
    const candidate: ScoredRecallCandidate = {
      id: "a",
      score: 0.7,
      boosted: 0.8,
      vault,
      isCurrentProject: true,
      semanticRank: 1,
      lexicalRank: 1,
    };
    const hybrid = computeHybridScore(candidate);
    expect(hybrid).toBeGreaterThan(0.8);
  });

  it("lexical score cannot overcome large semantic gap", () => {
    const lowSemantic: ScoredRecallCandidate = { id: "a", score: 0.3, boosted: 0.3, vault, isCurrentProject: false, lexicalScore: 1.0 };
    const highSemantic: ScoredRecallCandidate = { id: "b", score: 0.8, boosted: 0.8, vault, isCurrentProject: false, lexicalScore: 0 };
    expect(computeHybridScore(highSemantic)).toBeGreaterThan(computeHybridScore(lowSemantic));
  });

  it("adds a small canonical contribution in RRF mode", () => {
    const candidate: ScoredRecallCandidate = {
      id: "a",
      score: 0.7,
      boosted: 0.5,
      vault,
      isCurrentProject: true,
      semanticRank: 1,
      lexicalRank: 2,
      canonicalExplanationScore: 0.07,
    };

    const withCanonical = computeHybridScore(candidate);
    const withoutCanonical = computeHybridScore({ ...candidate, canonicalExplanationScore: 0 });
    expect(withCanonical).toBeGreaterThan(withoutCanonical);
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

  it("prefers candidates covering rarer query tokens when semantic scores are close", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "canonical", score: 0.55, boosted: 0.55, vault, isCurrentProject: true },
      { id: "broad", score: 0.58, boosted: 0.58, vault, isCurrentProject: true },
    ];

    const projectionTexts = new Map([
      ["canonical", "Title: Key design decisions\nSummary: embeddings gitignored because they are derived data and recomputable"],
      ["broad", "Title: Sync redesign\nSummary: embeddings sync redesign and reindex behavior"],
    ]);

    const reranked = applyLexicalReranking(candidates, "why are embeddings gitignored", (id) => projectionTexts.get(id));

    expect(reranked[0].id).toBe("canonical");
    expect(reranked[0].coverageScore).toBeGreaterThan(reranked[1].coverageScore ?? 0);
  });

  it("rewards contiguous significant-token phrase matches", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "canonical", score: 0.5, boosted: 0.5, vault, isCurrentProject: true },
      { id: "broad", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
    ];

    const projectionTexts = new Map([
      ["canonical", "Title: Key design decisions\nSummary: embeddings gitignored because they are derived data and recomputable"],
      ["broad", "Title: Sync redesign\nSummary: embeddings redesign for sync and reindex behavior"],
    ]);

    const reranked = applyLexicalReranking(candidates, "why are embeddings gitignored", (id) => projectionTexts.get(id));

    expect(reranked[0].id).toBe("canonical");
    expect(reranked[0].phraseScore).toBe(1);
    expect(reranked[1].phraseScore ?? 0).toBe(0);
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

describe("canonical explanation promotion", () => {
  it("promotes a central permanent decision note when semantic scores are close", () => {
    const candidates: ScoredRecallCandidate[] = [
      {
        id: "canonical",
        score: 0.56,
        semanticScoreForPromotion: 0.56,
        boosted: 0.56,
        vault,
        isCurrentProject: true,
        lifecycle: "permanent",
        relatedCount: 6,
        connectionDiversity: 3,
        structureScore: 0.03,
        metadata: {
          role: "decision",
          roleSource: "explicit",
          importance: "high",
          importanceSource: "explicit",
          alwaysLoadSource: "none",
        },
      },
      {
        id: "incidental",
        score: 0.58,
        semanticScoreForPromotion: 0.58,
        boosted: 0.58,
        vault,
        isCurrentProject: true,
        lifecycle: "permanent",
        relatedCount: 1,
        connectionDiversity: 1,
        structureScore: 0.01,
        metadata: {
          roleSource: "none",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
    ];

    const promoted = applyCanonicalExplanationPromotion(candidates);
    expect(promoted[0].id).toBe("canonical");
    expect(promoted[0].canonicalExplanationScore).toBeGreaterThan(promoted[1].canonicalExplanationScore ?? 0);
  });

  it("does not promote a highly central note when semantic plausibility is too low", () => {
    const unrelated: ScoredRecallCandidate = {
      id: "unrelated-central",
      score: 0.34,
      semanticScoreForPromotion: 0.34,
      boosted: 0.34,
      vault,
      isCurrentProject: true,
      lifecycle: "permanent",
      relatedCount: 12,
      connectionDiversity: 5,
      structureScore: 0.04,
      metadata: {
        role: "decision",
        roleSource: "explicit",
        importance: "high",
        importanceSource: "explicit",
        alwaysLoadSource: "none",
      },
    };

    expect(computeCanonicalExplanationScore(unrelated)).toBe(0);
  });

  it("does not treat lexical rescue strength as semantic plausibility for canonical promotion", () => {
    const rescuedButUnproven = {
      id: "rescued-but-unproven",
      score: 0.93,
      boosted: 0.15,
      vault,
      isCurrentProject: true,
      lexicalScore: 0.93,
      semanticScoreForPromotion: 0,
      lifecycle: "permanent" as const,
      relatedCount: 12,
      connectionDiversity: 5,
      structureScore: 0.04,
      metadata: {
        role: "decision" as const,
        roleSource: "explicit" as const,
        importance: "high" as const,
        importanceSource: "explicit" as const,
        alwaysLoadSource: "none" as const,
      },
    } satisfies ScoredRecallCandidate & { semanticScoreForPromotion?: number };

    expect(computeCanonicalExplanationScore(rescuedButUnproven)).toBe(0);
  });

  it("keeps temporary notes behind durable explanation notes", () => {
    const promoted = applyCanonicalExplanationPromotion([
      {
        id: "temporary",
        score: 0.57,
        semanticScoreForPromotion: 0.57,
        boosted: 0.57,
        vault,
        isCurrentProject: true,
        lifecycle: "temporary",
        relatedCount: 5,
        connectionDiversity: 3,
        structureScore: 0.03,
        metadata: {
          role: "context",
          roleSource: "suggested",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
      {
        id: "durable",
        score: 0.55,
        semanticScoreForPromotion: 0.55,
        boosted: 0.55,
        vault,
        isCurrentProject: true,
        lifecycle: "permanent",
        relatedCount: 4,
        connectionDiversity: 2,
        structureScore: 0.02,
        metadata: {
          role: "decision",
          roleSource: "explicit",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
    ]);

    expect(promoted[0].id).toBe("durable");
  });

  it("does not let a low-semantic canonical note beat a much stronger semantic match", () => {
    const promoted = applyCanonicalExplanationPromotion([
      {
        id: "canonical-but-weaker",
        score: 0.58,
        semanticScoreForPromotion: 0.58,
        boosted: 0.58,
        vault,
        isCurrentProject: true,
        lifecycle: "permanent",
        relatedCount: 100,
        connectionDiversity: 10,
        structureScore: 1,
        metadata: {
          role: "decision",
          roleSource: "explicit",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
      {
        id: "semantically-stronger",
        score: 0.82,
        semanticScoreForPromotion: 0.82,
        boosted: 0.82,
        vault,
        isCurrentProject: true,
        metadata: {
          roleSource: "none",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
    ]);

    expect(promoted[0].id).toBe("semantically-stronger");
  });

  it("uses wording only as a weak tiebreaker", () => {
    const promoted = applyCanonicalExplanationPromotion([
      {
        id: "canonical",
        score: 0.55,
        semanticScoreForPromotion: 0.55,
        boosted: 0.55,
        vault,
        isCurrentProject: true,
        lexicalScore: 0.1,
        lifecycle: "permanent",
        relatedCount: 6,
        connectionDiversity: 3,
        structureScore: 0.03,
        metadata: {
          role: "decision",
          roleSource: "explicit",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
      {
        id: "wording-heavy",
        score: 0.56,
        semanticScoreForPromotion: 0.56,
        boosted: 0.56,
        vault,
        isCurrentProject: true,
        lexicalScore: 1,
        lifecycle: "permanent",
        relatedCount: 1,
        connectionDiversity: 1,
        structureScore: 0,
        metadata: {
          roleSource: "none",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
    ]);

    expect(promoted[0].id).toBe("canonical");
  });

  it("can promote a wording-light explanatory note from graph and role evidence", () => {
    const promoted = applyCanonicalExplanationPromotion([
      {
        id: "canonical-structural",
        score: 0.55,
        semanticScoreForPromotion: 0.55,
        boosted: 0.55,
        vault,
        isCurrentProject: true,
        lexicalScore: 0,
        lifecycle: "permanent",
        relatedCount: 7,
        connectionDiversity: 3,
        structureScore: 0.04,
        metadata: {
          role: "decision",
          roleSource: "explicit",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
      {
        id: "lexical-but-thin",
        score: 0.56,
        semanticScoreForPromotion: 0.56,
        boosted: 0.56,
        vault,
        isCurrentProject: true,
        lexicalScore: 0.9,
        lifecycle: "permanent",
        relatedCount: 1,
        connectionDiversity: 1,
        structureScore: 0,
        metadata: {
          roleSource: "none",
          importanceSource: "none",
          alwaysLoadSource: "none",
        },
      },
    ]);

    expect(promoted[0].id).toBe("canonical-structural");
  });
});

describe("selectRecallResults keeps all candidates (rescue filtering is at the caller)", () => {
  it("includes rescue candidates alongside semantic matches", () => {
    const candidates: ScoredRecallCandidate[] = [
      {
        id: "semantic-match",
        score: 0.85,
        semanticScoreForPromotion: 0.85,
        boosted: 0.85,
        vault,
        isCurrentProject: true,
      },
      {
        id: "rescue-pure-lexical",
        score: 0.93,
        semanticScoreForPromotion: 0,
        boosted: 0.15,
        vault,
        isCurrentProject: true,
        lexicalScore: 0.93,
      },
    ];

    const results = selectRecallResults(candidates, 5, "all");

    expect(results).toHaveLength(2);
  });

  it("includes rescue candidates when they are the only matches", () => {
    const candidates: ScoredRecallCandidate[] = [
      {
        id: "rescue-strong-lexical",
        score: 0.93,
        semanticScoreForPromotion: 0,
        boosted: 0.15,
        vault,
        isCurrentProject: true,
        lexicalScore: 0.8,
        coverageScore: 0.5,
        phraseScore: 1,
      },
    ];

    const results = selectRecallResults(candidates, 5, "all");

    expect(results.map((r) => r.id)).toEqual(["rescue-strong-lexical"]);
  });
});

describe("applyGraphSpreadingActivation", () => {
  it("discovers a related note not in the semantic candidate set", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "entry") {
        return [{ id: "related-note", type: "related-to" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    expect(result).toHaveLength(2);
    const discovered = result.find((c) => c.id === "related-note");
    expect(discovered).toBeDefined();
    expect(discovered!.score).toBeCloseTo(0.6 * 0.5 * 0.8, 5);
  });

  it("boosts an existing candidate instead of skipping it", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
      { id: "already-there", score: 0.5, boosted: 0.5, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "entry") {
        return [{ id: "already-there", type: "related-to" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    expect(result).toHaveLength(2);
    const boosted = result.find((c) => c.id === "already-there")!;
    expect(boosted.score).toBeCloseTo(0.5 + 0.6 * 0.5 * 0.8, 5);
    expect(boosted.boosted).toBeCloseTo(0.5 + 0.6 * 0.5 * 0.8, 5);
  });

  it("accumulates propagated scores onto an existing candidate from multiple entry points", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry-a", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
      { id: "entry-b", score: 0.55, boosted: 0.55, vault, isCurrentProject: true },
      { id: "shared", score: 0.5, boosted: 0.5, vault, isCurrentProject: true, semanticScoreForPromotion: 0.5 },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "entry-a") {
        return [{ id: "shared", type: "related-to" as const }];
      }
      if (id === "entry-b") {
        return [{ id: "shared", type: "explains" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    const shared = result.find((c) => c.id === "shared")!;
    const expectedBoost = 0.6 * 0.5 * 0.8 + 0.55 * 0.5 * 1.0;
    expect(shared.score).toBeCloseTo(0.5 + expectedBoost, 5);
    expect(shared.boosted).toBeCloseTo(0.5 + expectedBoost, 5);
    expect(shared.semanticScoreForPromotion).toBeCloseTo(0.5 + expectedBoost, 5);
  });

  it("applies explains/derives-from multiplier of 1.0", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry", score: 0.7, boosted: 0.7, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "entry") {
        return [{ id: "explains-note", type: "explains" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    const discovered = result.find((c) => c.id === "explains-note");
    expect(discovered!.score).toBeCloseTo(0.7 * 0.5 * 1.0, 5);
  });

  it("only uses top 5 entry points", () => {
    const candidates: ScoredRecallCandidate[] = Array.from({ length: 10 }, (_, i) => ({
      id: `entry-${i}`,
      score: 0.5 + i * 0.05,
      boosted: 0.5 + i * 0.05,
      vault,
      isCurrentProject: true,
    }));

    const getNoteRelationships = (id: string) => {
      if (id === "entry-0") {
        return [{ id: "deeply-related", type: "related-to" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    expect(result.find((c) => c.id === "deeply-related")).toBeUndefined();
  });

  it("skips propagation when no entry point meets activation gate (0.5)", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "weak", score: 0.3, boosted: 0.3, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "weak") {
        return [{ id: "related", type: "related-to" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    expect(result).toHaveLength(1);
  });

  it("propagates from entry points with score >= 0.5", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "weak", score: 0.3, boosted: 0.3, vault, isCurrentProject: true },
      { id: "strong", score: 0.55, boosted: 0.55, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "strong") {
        return [{ id: "graph-discovered", type: "related-to" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    const discovered = result.find((c) => c.id === "graph-discovered");
    expect(discovered).toBeDefined();
  });

  it("accumulates propagated scores when same note is reachable via multiple entry points", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry-a", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
      { id: "entry-b", score: 0.55, boosted: 0.55, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "entry-a") {
        return [{ id: "shared", type: "related-to" as const }];
      }
      if (id === "entry-b") {
        return [{ id: "shared", type: "related-to" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    const discovered = result.find((c) => c.id === "shared");
    const expectedScore = (0.6 * 0.5 * 0.8) + (0.55 * 0.5 * 0.8);
    expect(discovered!.score).toBeCloseTo(expectedScore, 5);
  });

  it("returns original candidates unchanged when no relationships exist", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry", score: 0.6, boosted: 0.6, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = () => undefined;

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    expect(result).toEqual(candidates);
  });

  it("returns original candidates when empty candidate set", () => {
    const getNoteRelationships = () => [{ id: "should-not-appear", type: "related-to" as const }];

    const result = applyGraphSpreadingActivation([], getNoteRelationships);

    expect(result).toHaveLength(0);
  });

  it("sets semanticScoreForPromotion on discovered candidates", () => {
    const candidates: ScoredRecallCandidate[] = [
      { id: "entry", score: 0.7, boosted: 0.7, vault, isCurrentProject: true },
    ];

    const getNoteRelationships = (id: string) => {
      if (id === "entry") {
        return [{ id: "discovered", type: "explains" as const }];
      }
      return undefined;
    };

    const result = applyGraphSpreadingActivation(candidates, getNoteRelationships);

    const discovered = result.find((c) => c.id === "discovered");
    expect(discovered!.semanticScoreForPromotion).toBeCloseTo(0.7 * 0.5 * 1.0, 5);
  });
});
