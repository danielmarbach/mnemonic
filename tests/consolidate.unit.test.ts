import { describe, expect, it } from "vitest";

import {
  buildConsolidateNoteEvidence,
  buildMergeWarnings,
  deriveMergeRisk,
  filterRelationships,
  mergeRelationshipsFromNotes,
  normalizeMergePlanSourceIds,
  resolveEffectiveConsolidationMode,
} from "../src/consolidate.js";

describe("consolidate helpers", () => {
  it("deduplicates merge plan source ids while preserving order", () => {
    expect(normalizeMergePlanSourceIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
  });

  it("preserves distinct relationship types when merging source notes", () => {
    const relationships = mergeRelationshipsFromNotes(
      [
        { relatedTo: [{ id: "target-1", type: "related-to" }, { id: "source-2", type: "related-to" }] },
        { relatedTo: [{ id: "target-1", type: "explains" }, { id: "target-2", type: "example-of" }] },
      ],
      new Set(["source-1", "source-2"])
    );

    expect(relationships).toEqual([
      { id: "target-1", type: "related-to" },
      { id: "target-1", type: "explains" },
      { id: "target-2", type: "example-of" },
    ]);
  });

  it("filters dangling relationships and removes the field when empty", () => {
    const original = [
      { id: "keep", type: "related-to" as const },
      { id: "drop", type: "supersedes" as const },
    ];

    expect(filterRelationships(original, ["drop"])).toEqual([{ id: "keep", type: "related-to" }]);
    expect(filterRelationships([{ id: "drop", type: "supersedes" }], ["drop"])).toBeUndefined();
  });

  it("returns the original relationship array when nothing changes", () => {
    const original = [{ id: "keep", type: "related-to" as const }];
    expect(filterRelationships(original, ["other"])).toBe(original);
  });

  it("uses delete mode for all-temporary source notes when no explicit mode is given", () => {
    expect(
      resolveEffectiveConsolidationMode(
        [{ lifecycle: "temporary" }, { lifecycle: "temporary" }],
        "supersedes",
      ),
    ).toBe("delete");
  });

  it("falls back to the project/default mode for mixed lifecycle merges", () => {
    expect(
      resolveEffectiveConsolidationMode(
        [{ lifecycle: "temporary" }, { lifecycle: "permanent" }],
        "supersedes",
      ),
    ).toBe("supersedes");
  });

  it("lets an explicit mode override lifecycle-derived defaults", () => {
    expect(
      resolveEffectiveConsolidationMode(
        [{ lifecycle: "temporary" }, { lifecycle: "temporary" }],
        "supersedes",
        "supersedes",
      ),
    ).toBe("supersedes");
  });

  it("derives merge risk from warning severity", () => {
    expect(deriveMergeRisk([])).toBe("low");
    expect(deriveMergeRisk(["temporary research note in merge - consider whether it contains unique evidence"])).toBe("medium");
    expect(deriveMergeRisk(["same role but different lifecycles - verify merge intent"])).toBe("high");
    expect(
      deriveMergeRisk([
        "temporary research note in merge - consider whether it contains unique evidence",
        "note supersedes another - merging may orphan the supersedes chain",
      ])
    ).toBe("high");
  });

  it("builds merge warnings for temporary research, supersedes chain, lifecycle mismatch and stale target", () => {
    const warnings = buildMergeWarnings(
      [
        {
          id: "a",
          title: "A",
          lifecycle: "temporary" as const,
          role: "research" as const,
          updatedAt: "2026-04-10T00:00:00.000Z",
          relatedTo: [{ id: "b", type: "supersedes" as const }],
        },
        {
          id: "b",
          title: "B",
          lifecycle: "permanent" as const,
          role: "research" as const,
          updatedAt: "2026-04-12T00:00:00.000Z",
          relatedTo: [],
        },
      ],
      { id: "a", updatedAt: "2026-04-10T00:00:00.000Z" }
    );

    expect(warnings).toContain("temporary research note in merge - consider whether it contains unique evidence");
    expect(warnings).toContain("note supersedes another - merging may orphan the supersedes chain");
    expect(warnings).toContain("newer note would be merged into older summary - stale summary risk");
    expect(warnings).toContain("same role but different lifecycles - verify merge intent");
  });

  it("builds consolidate note evidence with superseded and inbound superseder fields", () => {
    const evidence = buildConsolidateNoteEvidence(
      {
        id: "source",
        title: "Source",
        lifecycle: "permanent",
        role: "decision",
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [{ id: "target", type: "supersedes" }],
      },
      [
        { id: "source", relatedTo: [{ id: "target", type: "supersedes" }] },
        { id: "other", relatedTo: [{ id: "source", type: "supersedes" }] },
      ],
      ["note supersedes another - merging may orphan the supersedes chain"],
      new Date("2026-04-15T00:00:00.000Z")
    );

    expect(evidence.id).toBe("source");
    expect(evidence.superseded).toBe(true);
    expect(evidence.supersededCount).toBe(1);
    expect(evidence.supersededBy).toBe("other");
    expect(evidence.relatedCount).toBe(1);
    expect(evidence.ageDays).toBeGreaterThan(0);
    expect(evidence.mergeRisk).toBe("high");
  });
});
