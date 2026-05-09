import { describe, expect, it } from "vitest";

import {
  computeRecallDiversity,
  computeRecallRetrievalCoverage,
} from "../src/tools/recall-helpers.js";
import type { NoteLifecycle } from "../src/storage.js";

describe("computeRecallDiversity", () => {
  it("returns diversity metrics from recall results", () => {
    const results = [
      { id: "a", tags: ["workflow", "plan"], lifecycle: "temporary" as NoteLifecycle, role: "plan" },
      { id: "b", tags: ["workflow", "decision"], lifecycle: "permanent" as NoteLifecycle, role: "decision" },
      { id: "c", tags: ["bug"], lifecycle: "temporary" as NoteLifecycle, role: "context" },
    ];
    const diversity = computeRecallDiversity(results);
    expect(diversity).toBeDefined();
    expect(diversity!.themeCount).toBe(4);
    expect(diversity!.roleMix).toEqual({ plan: 1, decision: 1, context: 1 });
    expect(diversity!.lifecycleMix).toEqual({ temporary: 2, permanent: 1 });
  });

  it("counts unique tags across all results", () => {
    const results = [
      { id: "a", tags: ["x", "y"], lifecycle: "permanent" as NoteLifecycle, role: "summary" },
      { id: "b", tags: ["y", "z"], lifecycle: "permanent" as NoteLifecycle, role: "summary" },
    ];
    const diversity = computeRecallDiversity(results);
    expect(diversity!.themeCount).toBe(3);
  });

  it("omits role when undefined", () => {
    const results = [
      { id: "a", tags: ["test"], lifecycle: "temporary" as NoteLifecycle },
    ];
    const diversity = computeRecallDiversity(results);
    expect(diversity!.roleMix).toEqual({});
    expect(diversity!.lifecycleMix).toEqual({ temporary: 1 });
  });

  it("returns undefined on computation failure", () => {
    const results = null as unknown as Array<{ id: string; tags: string[]; lifecycle: NoteLifecycle; role?: string }>;
    const diversity = computeRecallDiversity(results);
    expect(diversity).toBeUndefined();
  });

  it("returns empty diversity for empty results", () => {
    const diversity = computeRecallDiversity([]);
    expect(diversity).toBeDefined();
    expect(diversity!.themeCount).toBe(0);
    expect(diversity!.roleMix).toEqual({});
    expect(diversity!.lifecycleMix).toEqual({});
  });
});

describe("computeRecallRetrievalCoverage", () => {
  it("computes coverage fraction for anchors in results", () => {
    const anchorIds = new Set(["a1", "a2", "a3"]);
    const anchorLookup = new Map([
      ["a1", "Anchor One"],
      ["a2", "Anchor Two"],
      ["a3", "Anchor Three"],
    ]);
    const resultIds = ["a1", "other", "a3"];

    const coverage = computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage).toBeDefined();
    expect(coverage!.anchorsInResults).toBe(2);
    expect(coverage!.highPriorityAnchorsTotal).toBe(3);
    expect(coverage!.fraction).toBeCloseTo(2 / 3);
    expect(coverage!.missingAnchors).toEqual([{ id: "a2", title: "Anchor Two" }]);
  });

  it("returns fraction 0 when no anchors exist", () => {
    const anchorIds = new Set<string>();
    const anchorLookup = new Map<string, string>();
    const resultIds = ["x", "y"];

    const coverage = computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage!.highPriorityAnchorsTotal).toBe(0);
    expect(coverage!.fraction).toBe(0);
    expect(coverage!.missingAnchors).toEqual([]);
  });

  it("returns fraction 1 when all anchors are in results", () => {
    const anchorIds = new Set(["a1", "a2"]);
    const anchorLookup = new Map([
      ["a1", "Anchor One"],
      ["a2", "Anchor Two"],
    ]);
    const resultIds = ["a1", "a2", "other"];

    const coverage = computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage!.anchorsInResults).toBe(2);
    expect(coverage!.fraction).toBe(1);
    expect(coverage!.missingAnchors).toEqual([]);
  });

  it("caps missing anchors at maxMissing", () => {
    const anchorIds = new Set(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
    const anchorLookup = new Map([
      ["a1", "A1"], ["a2", "A2"], ["a3", "A3"],
      ["a4", "A4"], ["a5", "A5"], ["a6", "A6"], ["a7", "A7"],
    ]);
    const resultIds = ["other"];

    const coverage = computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup, 3);
    expect(coverage!.missingAnchors.length).toBe(3);
  });

  it("uses unknown title for missing anchor lookup", () => {
    const anchorIds = new Set(["orphan"]);
    const anchorLookup = new Map<string, string>();
    const resultIds: string[] = [];

    const coverage = computeRecallRetrievalCoverage(resultIds, anchorIds, anchorLookup);
    expect(coverage!.missingAnchors).toEqual([{ id: "orphan", title: "(unknown)" }]);
  });

  it("returns undefined on computation failure", () => {
    const coverage = computeRecallRetrievalCoverage(null as any, null as any, null as any);
    expect(coverage).toBeUndefined();
  });
});