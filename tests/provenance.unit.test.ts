import { describe, expect, it } from "vitest";
import { buildTemporalHistoryEntry } from "../src/provenance.js";
import { enrichTemporalHistory } from "../src/temporal-interpretation.js";
import type { CommitStats, LastCommit } from "../src/git.js";

function makeCommit(overrides: Partial<LastCommit> = {}): LastCommit {
  return {
    hash: "abc1234",
    timestamp: "2026-01-01T00:00:00.000Z",
    message: "Test commit",
    ...overrides,
  };
}

function makeStats(overrides: Partial<CommitStats> = {}): CommitStats {
  return {
    additions: 50,
    deletions: 10,
    filesChanged: 2,
    ...overrides,
  };
}

describe("buildTemporalHistoryEntry", () => {
  it("returns base entry when stats are null", () => {
    const entry = buildTemporalHistoryEntry(makeCommit(), null, false);
    expect(entry.commitHash).toBe("abc1234");
    expect(entry.stats).toBeUndefined();
    expect(entry.summary).toBeUndefined();
  });

  it("always includes stats regardless of verbose flag (for classification pipeline)", () => {
    const commit = makeCommit();
    const stats = makeStats({ additions: 80, deletions: 10, filesChanged: 2 });

    const nonVerbose = buildTemporalHistoryEntry(commit, stats, false);
    const verbose = buildTemporalHistoryEntry(commit, stats, true);

    expect(nonVerbose.stats).toBeDefined();
    expect(nonVerbose.stats?.additions).toBe(80);
    expect(nonVerbose.stats?.deletions).toBe(10);
    expect(nonVerbose.stats?.filesChanged).toBe(2);

    expect(verbose.stats).toBeDefined();
    expect(verbose.stats?.additions).toBe(80);
  });

  it("non-verbose summary omits file count", () => {
    const entry = buildTemporalHistoryEntry(
      makeCommit(),
      makeStats({ additions: 50, deletions: 10, filesChanged: 3 }),
      false
    );
    expect(entry.summary).toMatch(/\+50\/-10 lines/);
    expect(entry.summary).not.toMatch(/files? changed/);
  });

  it("verbose summary includes file count", () => {
    const entry = buildTemporalHistoryEntry(
      makeCommit(),
      makeStats({ additions: 50, deletions: 10, filesChanged: 3 }),
      true
    );
    expect(entry.summary).toMatch(/\+50\/-10 lines/);
    expect(entry.summary).toMatch(/3 files changed/);
  });

  it("classifies metadata-only change correctly", () => {
    const entry = buildTemporalHistoryEntry(
      makeCommit({ message: "relate: link to other note" }),
      makeStats({ additions: 0, deletions: 0, filesChanged: 1 }),
      false
    );
    expect(entry.stats?.changeType).toBe("metadata-only change");
    expect(entry.summary).toBe("metadata-only change");
  });

  it("stats enable correct changeCategory in enrichment pipeline (the core fix)", () => {
    // Simulates the enrichment-layer scenario: two substantial expansion commits
    // that were previously misclassified as 'unknown' due to missing stats in non-verbose mode.
    // After the fix, stats are always present so classifyChange can resolve them as 'expand'.
    const entries = [
      buildTemporalHistoryEntry(
        makeCommit({ hash: "b", timestamp: "2026-01-02T00:00:00.000Z", message: "update: add phase 5 content" }),
        makeStats({ additions: 809, deletions: 23, filesChanged: 14 }),
        false  // non-verbose
      ),
      buildTemporalHistoryEntry(
        makeCommit({ hash: "a", timestamp: "2026-01-01T00:00:00.000Z", message: "consolidate(supersedes): initial note" }),
        makeStats({ additions: 115, deletions: 4, filesChanged: 5 }),
        false  // non-verbose
      ),
    ];

    const result = enrichTemporalHistory(entries);

    // The last entry is the oldest = create
    expect(result.interpretedHistory[1].changeCategory).toBe("create");
    // The update entry — with stats it classifies as 'expand', not 'unknown'
    expect(result.interpretedHistory[0].changeCategory).toBe("expand");
    expect(result.interpretedHistory[0].changeDescription).toBe("Added substantial explanatory content.");
    // historySummary reflects the expansion pattern, not generic fallback
    // 2-entry history uses the specific "created and then expanded" path
    expect(result.historySummary).toBe("This note was created and then expanded with additional detail.");
  });
});
