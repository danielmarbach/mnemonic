import { describe, expect, it } from "vitest";

import {
  aggregateMergeRisk,
  buildConsolidateNoteEvidence,
  buildGroupWarnings,
  buildNoteWarnings,
  classifyConsolidationNote,
  classifyConsolidationPair,
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

  it("derives merge risk with critical vs non-critical calibration", () => {
    expect(deriveMergeRisk([])).toBe("low");
    expect(deriveMergeRisk(["temporary research - consider whether it contains unique evidence"])).toBe("medium");
    expect(deriveMergeRisk(["lifecycle (temporary) differs from group majority (permanent)"])).toBe("medium");
    expect(deriveMergeRisk(["supersedes 1 other - merging may orphan the supersedes chain"])).toBe("high");
    expect(deriveMergeRisk(["target is older than 1 source - stale summary risk"])).toBe("high");
    expect(
      deriveMergeRisk([
        "temporary research - consider whether it contains unique evidence",
        "lifecycle (temporary) differs from group majority (permanent)",
      ])
    ).toBe("high");
  });

  it("aggregates merge risk from per-note risks", () => {
    expect(aggregateMergeRisk([])).toBe("low");
    expect(aggregateMergeRisk(["low", "low"])).toBe("low");
    expect(aggregateMergeRisk(["low", "medium"])).toBe("medium");
    expect(aggregateMergeRisk(["medium", "high"])).toBe("high");
    expect(aggregateMergeRisk(["low", "high"])).toBe("high");
  });

  it("builds per-note warnings for temporary research, supersedes chain, lifecycle mismatch and stale target", () => {
    const noteA = {
      id: "a",
      title: "A",
      lifecycle: "temporary" as const,
      role: "research" as const,
      updatedAt: "2026-04-10T00:00:00.000Z",
      relatedTo: [{ id: "b", type: "supersedes" as const }],
    };
    const noteB = {
      id: "b",
      title: "B",
      lifecycle: "permanent" as const,
      role: "research" as const,
      updatedAt: "2026-04-12T00:00:00.000Z",
      relatedTo: [] as Array<{ id: string; type: "supersedes" }>,
    };
    const noteC = {
      id: "c",
      title: "C",
      lifecycle: "permanent" as const,
      role: "research" as const,
      updatedAt: "2026-04-12T00:00:00.000Z",
      relatedTo: [] as Array<{ id: string; type: "supersedes" }>,
    };
    const allNotes = [noteA, noteB, noteC];
    const warningsA = buildNoteWarnings(noteA, allNotes, noteA);
    const warningsB = buildNoteWarnings(noteB, allNotes, noteA);

    expect(warningsA).toContain("temporary research - consider whether it contains unique evidence");
    expect(warningsA).toContain("supersedes 1 other - merging may orphan the supersedes chain");
    expect(warningsA).toContain("target is older than 2 sources - stale summary risk");
    expect(warningsA).toContain("lifecycle (temporary) differs from group majority (permanent)");
    expect(warningsB).toEqual([]);
  });

  it("builds group warnings with note prefixes", () => {
    const noteA = {
      id: "a",
      title: "A",
      lifecycle: "temporary" as const,
      role: "research" as const,
      updatedAt: "2026-04-10T00:00:00.000Z",
      relatedTo: [{ id: "b", type: "supersedes" as const }],
    };
    const noteB = {
      id: "b",
      title: "B",
      lifecycle: "permanent" as const,
      role: "research" as const,
      updatedAt: "2026-04-12T00:00:00.000Z",
      relatedTo: [] as Array<{ id: string; type: "supersedes" }>,
    };
    const groupWarnings = buildGroupWarnings([noteA, noteB], noteA);
    expect(groupWarnings.length).toBeGreaterThanOrEqual(1);
    for (const w of groupWarnings) {
      expect(w).toMatch(/^(A|B): /);
    }
  });

  it("builds consolidate note evidence with per-note warnings and accurate risk", () => {
    const sourceNote = {
      id: "source",
      title: "Source",
      lifecycle: "permanent" as const,
      role: "decision" as const,
      updatedAt: "2026-04-10T00:00:00.000Z",
      relatedTo: [{ id: "target", type: "supersedes" as const }],
    };
    const otherNote = {
      id: "other",
      title: "Other",
      lifecycle: "permanent" as const,
      role: undefined,
      updatedAt: "2026-04-12T00:00:00.000Z",
      relatedTo: [{ id: "source", type: "supersedes" as const }],
    };
    const allNotes = [sourceNote, otherNote];
    const evidence = buildConsolidateNoteEvidence(
      sourceNote,
      allNotes,
      new Date("2026-04-15T00:00:00.000Z"),
    );

    expect(evidence.id).toBe("source");
    expect(evidence.superseded).toBe(true);
    expect(evidence.supersededCount).toBe(1);
    expect(evidence.supersededBy).toBe("other");
    expect(evidence.relatedCount).toBe(1);
    expect(evidence.ageDays).toBeGreaterThan(0);
    expect(evidence.mergeRisk).toBe("high");
    expect(evidence.warnings).toBeDefined();
    expect(evidence.warnings!.some((w) => w.includes("supersedes chain"))).toBe(true);
  });

  describe("classifyConsolidationPair", () => {
    it("classifies lineage when notes have derives-from relationship", () => {
      const plan = {
        id: "plan-1",
        title: "Implementation plan",
        lifecycle: "temporary" as const,
        role: "plan" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [{ id: "apply-1", type: "derives-from" as const }],
      };
      const apply = {
        id: "apply-1",
        title: "Apply implementation",
        lifecycle: "temporary" as const,
        role: "context" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      expect(classifyConsolidationPair(plan, apply)).toBe("lineage");
    });

    it("classifies lineage when notes have follows relationship", () => {
      const research = {
        id: "research-1",
        title: "Research findings",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [{ id: "plan-1", type: "follows" as const }],
      };
      const plan = {
        id: "plan-1",
        title: "Plan",
        lifecycle: "temporary" as const,
        role: "plan" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      expect(classifyConsolidationPair(research, plan)).toBe("lineage");
    });

    it("classifies supersession-pressure when one note supersedes another", () => {
      const newer = {
        id: "newer",
        title: "Newer decision",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [{ id: "older", type: "supersedes" as const }],
      };
      const older = {
        id: "older",
        title: "Older decision",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      expect(classifyConsolidationPair(newer, older)).toBe("supersession-pressure");
    });

    it("classifies unique-evidence-risk for research notes without lineage", () => {
      const researchA = {
        id: "r1",
        title: "Research A",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      const researchB = {
        id: "r2",
        title: "Research B",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      expect(classifyConsolidationPair(researchA, researchB)).toBe("unique-evidence-risk");
    });

    it("classifies lineage over research role when both apply", () => {
      const researchWithLineage = {
        id: "r1",
        title: "Research with lineage",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [{ id: "r2", type: "derives-from" as const }],
      };
      const researchB = {
        id: "r2",
        title: "Related research",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      expect(classifyConsolidationPair(researchWithLineage, researchB)).toBe("lineage");
    });

    it("classifies duplicate-pressure for similar permanent notes without special conditions", () => {
      const decisionA = {
        id: "d1",
        title: "Decision A",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      const decisionB = {
        id: "d2",
        title: "Decision B",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      expect(classifyConsolidationPair(decisionA, decisionB)).toBe("duplicate-pressure");
    });
  });

  describe("classifyConsolidationNote", () => {
    it("returns supersession-pressure for a note that supersedes another", () => {
      const note = {
        id: "newer",
        title: "Newer decision",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [{ id: "older", type: "supersedes" as const }],
      };
      const allNotes = [note];
      const contextIds = new Set([note.id, "older"]);
      expect(classifyConsolidationNote(note, allNotes, contextIds)).toBe("supersession-pressure");
    });

    it("returns supersession-pressure for a note that is superseded", () => {
      const note = {
        id: "older",
        title: "Older decision",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      const newer = {
        id: "newer",
        title: "Newer decision",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [{ id: "older", type: "supersedes" as const }],
      };
      const allNotes = [note, newer];
      const contextIds = new Set([note.id, newer.id]);
      expect(classifyConsolidationNote(note, allNotes, contextIds)).toBe("supersession-pressure");
    });

    it("returns lineage for a note with derives-from to a context note", () => {
      const note = {
        id: "apply-1",
        title: "Apply plan",
        lifecycle: "temporary" as const,
        role: "context" as const,
        updatedAt: "2026-04-12T00:00:00.000Z",
        relatedTo: [{ id: "plan-1", type: "derives-from" as const }],
      };
      const allNotes = [note];
      const contextIds = new Set([note.id, "plan-1"]);
      expect(classifyConsolidationNote(note, allNotes, contextIds)).toBe("lineage");
    });

    it("returns unique-evidence-risk for research notes without lineage", () => {
      const note = {
        id: "r1",
        title: "Research findings",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      const allNotes = [note];
      const contextIds = new Set([note.id]);
      expect(classifyConsolidationNote(note, allNotes, contextIds)).toBe("unique-evidence-risk");
    });

    it("returns undefined for plain permanent notes without special conditions", () => {
      const note = {
        id: "d1",
        title: "Decision",
        lifecycle: "permanent" as const,
        role: "decision" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [] as Array<{ id: string; type: string }>,
      };
      const allNotes = [note];
      const contextIds = new Set([note.id]);
      expect(classifyConsolidationNote(note, allNotes, contextIds)).toBeUndefined();
    });

    it("prefers lineage over research role when both conditions apply", () => {
      const note = {
        id: "r1",
        title: "Research with lineage",
        lifecycle: "temporary" as const,
        role: "research" as const,
        updatedAt: "2026-04-10T00:00:00.000Z",
        relatedTo: [{ id: "plan-1", type: "derives-from" as const }],
      };
      const allNotes = [note];
      const contextIds = new Set([note.id, "plan-1"]);
      expect(classifyConsolidationNote(note, allNotes, contextIds)).toBe("lineage");
    });
  });
});
