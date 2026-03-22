import { describe, expect, it } from "vitest";

import {
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
});
