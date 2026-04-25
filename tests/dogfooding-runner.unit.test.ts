import { describe, expect, it } from "vitest";
import {
  getRecentMemoryNotes,
  getSummaryThemeEntries,
  getWorkingStateNotes,
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

});
