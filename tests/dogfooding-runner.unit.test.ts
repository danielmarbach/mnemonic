import { describe, expect, it } from "vitest";
import {
  allTemporarySourcesAutoDelete,
  getRecentMemoryNotes,
  getSummaryThemeEntries,
  getWorkingStateNotes,
  pickRecentNoteForRelationshipNavigation,
} from "../scripts/dogfooding-runner-helpers.mjs";

describe("dogfooding runner helpers", () => {
  it("reads summary themes from count/example records", () => {
    const summary = {
      themes: {
        decisions: { count: 2, examples: [{ id: "a", title: "A" }] },
        tooling: { count: 1, examples: [{ id: "b", title: "B" }] },
      },
    };

    expect(getSummaryThemeEntries(summary)).toEqual([
      ["decisions", { count: 2, examples: [{ id: "a", title: "A" }] }],
      ["tooling", { count: 1, examples: [{ id: "b", title: "B" }] }],
    ]);
  });

  it("reads recent memories from notes rather than results", () => {
    const recent = {
      notes: [
        { id: "temp-1", title: "Checkpoint", lifecycle: "temporary" },
      ],
    };

    expect(getRecentMemoryNotes(recent)).toEqual([
      { id: "temp-1", title: "Checkpoint", lifecycle: "temporary" },
    ]);
  });

  it("reads working state notes from the workingState object", () => {
    const summary = {
      workingState: {
        summary: "1 temporary note may help resume active work.",
        recoveryHint: "Orient first.",
        notes: [{ id: "wip-1", title: "WIP" }],
      },
    };

    expect(getWorkingStateNotes(summary)).toEqual([{ id: "wip-1", title: "WIP" }]);
  });

  it("treats all-temporary merges as auto-delete when no explicit mode is provided", () => {
    expect(allTemporarySourcesAutoDelete([
      { lifecycle: "temporary" },
      { lifecycle: "temporary" },
    ])).toBe(true);

    expect(allTemporarySourcesAutoDelete([
      { lifecycle: "temporary" },
      { lifecycle: "permanent" },
    ])).toBe(false);
  });

  it("prefers recent notes that already have relationships for navigation checks", () => {
    const picked = pickRecentNoteForRelationshipNavigation([
      { id: "latest", title: "Latest note", relationships: { shown: [] } },
      { id: "older", title: "Older linked note", relationships: { shown: [{ id: "decision-1" }] } },
    ]);

    expect(picked?.id).toBe("older");
  });
});
