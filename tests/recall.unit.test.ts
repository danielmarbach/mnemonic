import { describe, expect, it } from "vitest";

import { selectRecallResults, type ScoredRecallCandidate } from "../src/recall.js";

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
});
