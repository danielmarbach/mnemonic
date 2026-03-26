import { describe, expect, it } from "vitest";
import { analyzeThemeQuality } from "../src/theme-validation.js";
import type { Note } from "../src/storage.js";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? "note",
    title: overrides.title ?? "Note",
    content: overrides.content ?? "",
    tags: overrides.tags ?? [],
    lifecycle: overrides.lifecycle ?? "permanent",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    memoryVersion: overrides.memoryVersion ?? 1,
  };
}

describe("analyzeThemeQuality", () => {
  it("computes other ratio correctly", () => {
    const notes = [
      makeNote({ id: "1", title: "Overview", tags: ["overview"] }),
      makeNote({ id: "2", title: "Decision", tags: ["decisions"] }),
      makeNote({ id: "3", title: "Random" }),
      makeNote({ id: "4", title: "Another random" }),
    ];

    const result = analyzeThemeQuality(notes);
    expect(result.totalNotes).toBe(4);
    expect(result.otherCount).toBe(2);
    expect(result.otherRatio).toBeCloseTo(0.5, 2);
  });

  it("flags high other ratio as warning", () => {
    const notes = [
      makeNote({ id: "1", title: "Random 1" }),
      makeNote({ id: "2", title: "Random 2" }),
      makeNote({ id: "3", title: "Random 3" }),
      makeNote({ id: "4", title: "Random 4" }),
    ];

    const result = analyzeThemeQuality(notes);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("High 'other' ratio")
    );
  });

  it("flags too many single-note themes", () => {
    const notes = [
      makeNote({ id: "1", title: "Overview", tags: ["overview"] }),
      makeNote({ id: "2", title: "Decision", tags: ["decisions"] }),
      makeNote({ id: "3", title: "Bug", tags: ["bugs"] }),
      makeNote({ id: "4", title: "Quality", tags: ["quality"] }),
    ];

    const result = analyzeThemeQuality(notes);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("single-note themes")
    );
  });

  it("flags skewed distribution", () => {
    const notes = [
      ...Array(8).fill(null).map((_, i) => makeNote({ id: `bug-${i}`, title: `Bug ${i}`, tags: ["bugs"] })),
      makeNote({ id: "random", title: "Random" }),
    ];

    const result = analyzeThemeQuality(notes);
    expect(result.warnings).toContainEqual(
      expect.stringContaining("skewed")
    );
  });

  it("returns clean report for good distribution", () => {
    const notes = [
      makeNote({ id: "1", title: "Overview", tags: ["overview"] }),
      makeNote({ id: "2", title: "Decision 1", tags: ["decisions"] }),
      makeNote({ id: "3", title: "Decision 2", tags: ["decisions"] }),
      makeNote({ id: "4", title: "Bug fix", tags: ["bugs"] }),
    ];

    const result = analyzeThemeQuality(notes);
    expect(result.otherCount).toBe(0);
    expect(result.warnings).toHaveLength(0);
  });
});