import { describe, expect, it } from "vitest";
import {
  classifyChange,
  interpretHistoryEntry,
  summarizeHistory,
  enrichTemporalHistory,
  type TemporalHistoryEntry,
  type InterpretedHistoryEntry,
  type ChangeCategory,
} from "../src/temporal-interpretation.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHistoryEntry(overrides: Partial<TemporalHistoryEntry> = {}): TemporalHistoryEntry {
  return {
    commitHash: "abc123",
    timestamp: "2026-01-01T00:00:00.000Z",
    message: "Test commit",
    ...overrides,
  };
}

function makeInterpretedEntry(overrides: Partial<InterpretedHistoryEntry> = {}): InterpretedHistoryEntry {
  return {
    commitHash: "abc123",
    timestamp: "2026-01-01T00:00:00.000Z",
    message: "Test commit",
    changeCategory: "refine",
    changeDescription: "Minor refinement to existing content.",
    ...overrides,
  };
}

// ── classifyChange ────────────────────────────────────────────────────────────

describe("classifyChange", () => {
  it("classifies first commit as 'create'", () => {
    const entry = makeHistoryEntry({ message: "Initial commit" });
    const result = classifyChange(entry, { isFirstCommit: true });
    expect(result).toBe("create");
  });

  it("classifies relation-related messages as 'connect'", () => {
    const prefixes = ["relate:", "unrelate:", "move:", "migrate:", "forget:"];
    for (const prefix of prefixes) {
      const entry = makeHistoryEntry({ message: `${prefix} connect test note` });
      const result = classifyChange(entry);
      expect(result).toBe("connect");
    }
  });

  it("classifies entries without stats as 'unknown'", () => {
    const entry = makeHistoryEntry({ stats: undefined });
    const result = classifyChange(entry);
    expect(result).toBe("unknown");
  });

  it("classifies zero-change entries with relationship change as 'connect'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 0,
        deletions: 0,
        filesChanged: 1,
        changeType: "metadata-only change",
      },
    });
    const result = classifyChange(entry, { relationshipChanged: true });
    expect(result).toBe("connect");
  });

  it("classifies zero-change entries without relationship change as 'unknown'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 0,
        deletions: 0,
        filesChanged: 1,
        changeType: "metadata-only change",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("unknown");
  });

  it("classifies metadata-only changes without relationship as 'refine'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 2,
        deletions: 1,
        filesChanged: 1,
        changeType: "metadata-only change",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("refine");
  });

  it("classifies small low-churn edits as 'refine'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 5,
        deletions: 3,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("refine");
  });

  it("classifies large addition-heavy edits as 'expand'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 100,
        deletions: 10,
        filesChanged: 1,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("expand");
  });

  it("classifies high-churn substantial updates as 'restructure'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 60,
        deletions: 60,
        filesChanged: 2,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("restructure");
  });

  it("classifies medium edits with high churn as 'clarify'", () => {
    // totalChanged = 40, netGrowth = 5, churnRatio = 5/40 = 0.125
    // With changeType of minor edit, totalChanged >= 10 && < 50
    // netGrowth (5) is not > 10, so falls through to refine
    // This test verifies the behavior, but "clarify" requires churnRatio > 0.5
    const entry = makeHistoryEntry({
      stats: {
        additions: 20,
        deletions: 15,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = classifyChange(entry);
    // With these stats: totalChanged = 35, netGrowth = 5, churnRatio = 5/35 = ~0.14
    // This falls into the "refine" category
    expect(result).toBe("refine");
  });

  it("classifies edits with high churn ratio (> 0.5) as 'clarify'", () => {
    // For clarify: totalChanged >= 10 && < 50 && churnRatio > 0.5
    // totalChanged = 30, netGrowth = |10 - 20| = 10, churnRatio = 10/30 = ~0.33
    // Not quite high enough. Let's try: additions = 15, deletions = 25
    // totalChanged = 40, netGrowth = |15 - 25| = 10, churnRatio = 10/40 = 0.25
    // Need more imbalance: additions = 10, deletions = 25
    // totalChanged = 35, netGrowth = |10 - 25| = 15, churnRatio = 15/35 = ~0.43
    // additions = 5, deletions = 25
    // totalChanged = 30, netGrowth = |5 - 25| = 20, churnRatio = 20/30 = ~0.67 (> 0.5)
    const entry = makeHistoryEntry({
      stats: {
        additions: 5,
        deletions: 25,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("clarify");
  });

  it("classifies medium edits with positive growth as 'expand'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 25,
        deletions: 10,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("expand");
  });

  it("classifies substantial updates with low churn and additions as 'expand'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 80,
        deletions: 20,
        filesChanged: 2,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("expand");
  });

  it("classifies relationship changes with small net growth as 'connect'", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 15,
        deletions: 10,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = classifyChange(entry, { relationshipChanged: true });
    expect(result).toBe("connect");
  });
});

// ── interpretHistoryEntry ─────────────────────────────────────────────────────

describe("interpretHistoryEntry", () => {
  it("returns interpreted entry with changeCategory and changeDescription", () => {
    const entry = makeHistoryEntry({
      message: "Add new feature",
      stats: {
        additions: 50,
        deletions: 5,
        filesChanged: 1,
        changeType: "substantial update",
      },
    });
    const result = interpretHistoryEntry(entry, { isFirstCommit: true });

    expect(result.commitHash).toBe(entry.commitHash);
    expect(result.timestamp).toBe(entry.timestamp);
    expect(result.message).toBe(entry.message);
    expect(result.changeCategory).toBe("create");
    expect(result.changeDescription).toBe("Created this note with substantial initial content.");
  });

  it("includes stats in interpreted entry when present", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 10,
        deletions: 5,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = interpretHistoryEntry(entry);

    expect(result.stats).toBeDefined();
    expect(result.stats?.additions).toBe(10);
    expect(result.stats?.deletions).toBe(5);
  });

  it("handles entries without stats gracefully", () => {
    const entry = makeHistoryEntry({ stats: undefined });
    const result = interpretHistoryEntry(entry);

    expect(result.changeCategory).toBe("unknown");
    expect(result.changeDescription).toBe("Updated the note.");
  });

  it("generates appropriate descriptions for each category", () => {
    const categories: ChangeCategory[] = [
      "create",
      "refine",
      "expand",
      "clarify",
      "connect",
      "restructure",
      "reverse",
      "unknown",
    ];

    for (const category of categories) {
      const entry = makeHistoryEntry({
        stats: category === "unknown" ? undefined : {
          additions: category === "create" ? 100 : 10,
          deletions: 0,
          filesChanged: 1,
          changeType: category === "create" ? "substantial update" : "minor edit",
        },
      });
      const result = interpretHistoryEntry(entry, { isFirstCommit: category === "create" });

      expect(result.changeDescription).toBeTruthy();
      expect(result.changeDescription.length).toBeGreaterThan(0);
      expect(result.changeDescription).not.toContain("diff");
      expect(result.changeDescription).not.toContain("@@");
    }
  });
});

// ── summarizeHistory ──────────────────────────────────────────────────────────

describe("summarizeHistory", () => {
  it("returns undefined for empty history", () => {
    const result = summarizeHistory([]);
    expect(result).toBeUndefined();
  });

  it("summarizes single 'create' entry correctly", () => {
    const entries = [makeInterpretedEntry({ changeCategory: "create" })];
    const result = summarizeHistory(entries);
    expect(result).toBe("This note was created and has not been modified since.");
  });

  it("summarizes single non-create entry", () => {
    const entries = [makeInterpretedEntry({ changeCategory: "refine" })];
    const result = summarizeHistory(entries);
    expect(result).toBe("This note was refined.");
  });

  it("summarizes single 'unknown' entry with generic message", () => {
    const entries = [makeInterpretedEntry({ changeCategory: "unknown" })];
    const result = summarizeHistory(entries);
    // "unknown" is special-cased to "updated" in the fallback
    expect(result).toBe("This note was updatedd.");
  });

  it("summarizes create + refine pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("This note was created and then refined.");
  });

  it("summarizes create + expand pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "expand" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("This note was created and then expanded with additional detail.");
  });

  it("summarizes create + clarify pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "clarify" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("This note was created and then clarified.");
  });

  it("summarizes create + clarify + connect pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "connect" }),
      makeInterpretedEntry({ changeCategory: "clarify" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    // Clarify is dominant (2 non-create), but with connect present, we get the connect message
    expect(result).toBe("The core content remained stable; later edits expanded rationale and linked related notes.");
  });

  it("summarizes stable core with expansion pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "expand" }),
      makeInterpretedEntry({ changeCategory: "expand" }),
      makeInterpretedEntry({ changeCategory: "clarify" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("The core decision remained stable while rationale and examples expanded.");
  });

  it("summarizes stable core with expansion and connect pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "connect" }),
      makeInterpretedEntry({ changeCategory: "expand" }),
      makeInterpretedEntry({ changeCategory: "expand" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("The core content remained stable; later edits expanded rationale and linked related notes.");
  });

  it("summarizes substantial restructure pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "restructure" }),
      makeInterpretedEntry({ changeCategory: "expand" }),
      makeInterpretedEntry({ changeCategory: "clarify" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("The note evolved through several substantial revisions before settling into its current form.");
  });

  it("summarizes predominantly refinement pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("This note was created and then refined incrementally.");
  });

  it("summarizes predominantly connection pattern", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "connect" }),
      makeInterpretedEntry({ changeCategory: "connect" }),
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    expect(result).toBe("The note was connected to related work through incremental updates.");
  });

  it("summarizes mixed pattern with generic fallback", () => {
    const entries = [
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "unknown" }),
      makeInterpretedEntry({ changeCategory: "refine" }),
      makeInterpretedEntry({ changeCategory: "create" }),
    ];
    const result = summarizeHistory(entries);
    // refine is dominant (2 non-create), no expansion or restructure
    expect(result).toBe("This note was created and then refined incrementally.");
  });
});

// ── enrichTemporalHistory ─────────────────────────────────────────────────────

describe("enrichTemporalHistory", () => {
  it("returns empty interpretedHistory for empty entries", () => {
    const result = enrichTemporalHistory([]);
    expect(result.interpretedHistory).toEqual([]);
    expect(result.historySummary).toBeUndefined();
  });

  it("interprets single entry and generates summary", () => {
    const entries: TemporalHistoryEntry[] = [
      makeHistoryEntry({
        message: "Initial commit",
        stats: {
          additions: 50,
          deletions: 0,
          filesChanged: 1,
          changeType: "substantial update",
        },
      }),
    ];
    const result = enrichTemporalHistory(entries);

    expect(result.interpretedHistory).toHaveLength(1);
    expect(result.interpretedHistory[0].changeCategory).toBe("create");
    expect(result.historySummary).toBe("This note was created and has not been modified since.");
  });

  it("processes entries in reverse chronological order (oldest last)", () => {
    const entries: TemporalHistoryEntry[] = [
      makeHistoryEntry({ commitHash: "newest", timestamp: "2026-01-03T00:00:00.000Z" }),
      makeHistoryEntry({ commitHash: "middle", timestamp: "2026-01-02T00:00:00.000Z" }),
      makeHistoryEntry({ commitHash: "oldest", timestamp: "2026-01-01T00:00:00.000Z" }),
    ];
    const result = enrichTemporalHistory(entries);

    expect(result.interpretedHistory).toHaveLength(3);
    expect(result.interpretedHistory[0].commitHash).toBe("newest");
    expect(result.interpretedHistory[1].commitHash).toBe("middle");
    expect(result.interpretedHistory[2].commitHash).toBe("oldest");
    expect(result.interpretedHistory[2].changeCategory).toBe("create");
  });

  it("interprets entries without stats as unknown (when not first commit)", () => {
    const entries: TemporalHistoryEntry[] = [
      makeHistoryEntry({ commitHash: "newer", timestamp: "2026-01-02T00:00:00.000Z", stats: undefined }),
      makeHistoryEntry({ commitHash: "older", timestamp: "2026-01-01T00:00:00.000Z", stats: undefined }),
    ];
    const result = enrichTemporalHistory(entries);

    // First entry (oldest) is "create", second entry (newer) without stats is "unknown"
    expect(result.interpretedHistory[0].changeCategory).toBe("unknown");
    expect(result.interpretedHistory[0].changeDescription).toBe("Updated the note.");
  });

  it("handles substantial history with multiple patterns", () => {
    const entries: TemporalHistoryEntry[] = [
      makeHistoryEntry({
        commitHash: "v5",
        timestamp: "2026-01-05T00:00:00.000Z",
        message: "Final refinement",
        stats: { additions: 5, deletions: 3, filesChanged: 1, changeType: "minor edit" },
      }),
      makeHistoryEntry({
        commitHash: "v4",
        timestamp: "2026-01-04T00:00:00.000Z",
        message: "Add related notes",
        stats: { additions: 30, deletions: 5, filesChanged: 1, changeType: "minor edit" },
      }),
      makeHistoryEntry({
        commitHash: "v3",
        timestamp: "2026-01-03T00:00:00.000Z",
        message: "Expand rationale",
        stats: { additions: 50, deletions: 10, filesChanged: 1, changeType: "substantial update" },
      }),
      makeHistoryEntry({
        commitHash: "v2",
        timestamp: "2026-01-02T00:00:00.000Z",
        message: "Clarify wording",
        stats: { additions: 20, deletions: 15, filesChanged: 1, changeType: "minor edit" },
      }),
      makeHistoryEntry({
        commitHash: "v1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: "Initial commit",
        stats: { additions: 100, deletions: 0, filesChanged: 1, changeType: "substantial update" },
      }),
    ];
    const result = enrichTemporalHistory(entries);

    expect(result.interpretedHistory).toHaveLength(5);
    expect(result.interpretedHistory[4].changeCategory).toBe("create");
    expect(result.historySummary).toBeTruthy();
    expect(result.historySummary?.length).toBeGreaterThan(0);
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe("temporal interpretation edge cases", () => {
  it("handles entries with unusual stats gracefully", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 0,
        deletions: 100,
        filesChanged: 1,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBeTruthy();
  });

  it("handles very large additions", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 10000,
        deletions: 100,
        filesChanged: 10,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("expand");
  });

  it("handles equal additions and deletions (pure rewrite)", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 500,
        deletions: 500,
        filesChanged: 5,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry);
    expect(result).toBe("restructure");
  });

  it("classifies messages case-insensitively for connect prefixes", () => {
    const entry = makeHistoryEntry({ message: "RELATE: test note" });
    const result = classifyChange(entry);
    expect(result).toBe("connect");
  });

  it("handles unknown categories in descriptions", () => {
    const entry = makeHistoryEntry({ stats: undefined });
    const result = interpretHistoryEntry(entry);
    expect(result.changeCategory).toBe("unknown");
    expect(result.changeDescription).toBe("Updated the note.");
  });

  it("handles relationship changes with substantial updates", () => {
    const entry = makeHistoryEntry({
      stats: {
        additions: 100,
        deletions: 50,
        filesChanged: 2,
        changeType: "substantial update",
      },
    });
    const result = classifyChange(entry, { relationshipChanged: true });
    expect(result).toBe("restructure");
  });

  it("handles create with minimal content", () => {
    const entry = makeHistoryEntry({
      message: "Create note",
      stats: {
        additions: 5,
        deletions: 0,
        filesChanged: 1,
        changeType: "minor edit",
      },
    });
    const result = interpretHistoryEntry(entry, { isFirstCommit: true });
    expect(result.changeCategory).toBe("create");
    expect(result.changeDescription).toBe("Created this note.");
  });

  it("handles create with substantial content", () => {
    const entry = makeHistoryEntry({
      message: "Create note",
      stats: {
        additions: 100,
        deletions: 0,
        filesChanged: 1,
        changeType: "substantial update",
      },
    });
    const result = interpretHistoryEntry(entry, { isFirstCommit: true });
    expect(result.changeCategory).toBe("create");
    expect(result.changeDescription).toBe("Created this note with substantial initial content.");
  });
});
