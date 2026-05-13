import { describe, expect, it } from "vitest";
import { buildTemporalHistoryEntry, computeSignalStrength, computeConfidence, computeDecayInfo } from "../src/provenance.js";
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

describe("computeSignalStrength", () => {
  const recentIso = () => new Date().toISOString();
  const daysAgoIso = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  it("returns 0 for temporary note with no role and no relations", () => {
    const result = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: recentIso(),
      centrality: 0,
    });
    expect(result).toBeCloseTo(0.10, 2); // only recency: 0.10 * (1 - 0/90)
  });

  it("returns higher scores for permanent summary with many relations", () => {
    const result = computeSignalStrength({
      lifecycle: "permanent",
      updatedAt: recentIso(),
      role: "summary",
      centrality: 20,
    });
    // role=0.15 + centrality=min(0.15, log(21)*0.05≈0.152)→0.15 + lifecycle=0.10 + recency≈0.10 = ~0.50
    expect(result).toBeGreaterThan(0.45);
    expect(result).toBeLessThanOrEqual(0.55);
  });

  it("recency decays with age", () => {
    const recent = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: recentIso(),
      centrality: 0,
    });
    const old = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: daysAgoIso(45),
      centrality: 0,
    });
    expect(recent).toBeGreaterThan(old);
  });

  it("recency reaches zero at 90+ days", () => {
    const result = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: daysAgoIso(100),
      centrality: 0,
    });
    expect(result).toBe(0);
  });

  it("centrality caps at 0.15", () => {
    const result = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: recentIso(),
      centrality: 1000,
    });
    // centrality should cap at 0.15
    expect(result).toBeCloseTo(0.25, 2); // centrality(0.15) + recency(0.10)
  });

  it("lifecycle permanent contributes 0.10", () => {
    const temp = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: recentIso(),
      centrality: 0,
    });
    const perm = computeSignalStrength({
      lifecycle: "permanent",
      updatedAt: recentIso(),
      centrality: 0,
    });
    expect(perm - temp).toBeCloseTo(0.10, 2);
  });

  it("missing role contributes 0", () => {
    const withoutRole = computeSignalStrength({
      lifecycle: "permanent",
      updatedAt: recentIso(),
      centrality: 5,
    });
    const withRole = computeSignalStrength({
      lifecycle: "permanent",
      updatedAt: recentIso(),
      role: "context",
      centrality: 5,
    });
    expect(withRole - withoutRole).toBeCloseTo(0.05, 2);
  });
});

describe("computeConfidence with signalStrength", () => {
  it("returns high at 0.35 threshold", () => {
    expect(computeConfidence("permanent", new Date().toISOString(), 5, 0.35)).toBe("high");
    expect(computeConfidence("permanent", new Date().toISOString(), 5, 0.40)).toBe("high");
  });

  it("returns medium between 0.15 and 0.35", () => {
    expect(computeConfidence("permanent", new Date().toISOString(), 5, 0.15)).toBe("medium");
    expect(computeConfidence("temporary", new Date().toISOString(), 0, 0.20)).toBe("medium");
  });

  it("returns low below 0.15", () => {
    expect(computeConfidence("temporary", new Date().toISOString(), 0, 0.0)).toBe("low");
    expect(computeConfidence("temporary", new Date().toISOString(), 0, 0.10)).toBe("low");
  });

  it("falls back to legacy logic when signalStrength is undefined", () => {
    const lowResult = computeConfidence("temporary", new Date().toISOString(), 3, undefined);
    expect(lowResult).toBeDefined();
    expect(["high", "medium", "low"]).toContain(lowResult);
  });
});

describe("computeSignalStrength fail-soft guards", () => {
  it("gracefully handles invalid updatedAt (daysSince returns 0, yielding full recency)", () => {
    const result = computeSignalStrength({
      lifecycle: "permanent",
      updatedAt: "not-a-date",
      role: "summary",
      centrality: 5,
    });
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(0);
  });

  it("clamps negative centrality while preserving other signal", () => {
    const result = computeSignalStrength({
      lifecycle: "temporary",
      updatedAt: new Date().toISOString(),
      centrality: -5,
    });
    expect(result).toBeCloseTo(0.10, 2);
  });
});

describe("computeDecayInfo", () => {
  const now = new Date("2026-05-12T00:00:00.000Z");
  const daysAgoIso = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

  it("uses exponential half-life decay from updatedAt", () => {
    const result = computeDecayInfo({
      lifecycle: "temporary",
      updatedAt: daysAgoIso(30),
      role: "research",
      now,
    });

    expect(result.ageDays).toBe(30);
    expect(result.halfLifeDays).toBe(30);
    expect(result.freshness).toBeCloseTo(0.5, 3);
    expect(result.staleness).toBeCloseTo(0.5, 3);
    expect(result.basis).toEqual(["temporary", "research"]);
  });

  it("suggests consolidation for stale temporary workflow notes", () => {
    const result = computeDecayInfo({
      lifecycle: "temporary",
      updatedAt: daysAgoIso(31),
      role: "plan",
      now,
    });

    expect(result.maintenanceHint).toBe("consolidate");
  });

  it("suggests review for stale temporary context notes", () => {
    const result = computeDecayInfo({
      lifecycle: "temporary",
      updatedAt: daysAgoIso(46),
      role: "context",
      now,
    });

    expect(result.halfLifeDays).toBe(45);
    expect(result.maintenanceHint).toBe("review");
  });

  it("uses long half-life and no age-only hint for permanent core notes", () => {
    const result = computeDecayInfo({
      lifecycle: "permanent",
      updatedAt: daysAgoIso(365),
      role: "decision",
      now,
    });

    expect(result.halfLifeDays).toBe(365);
    expect(result.freshness).toBeCloseTo(0.5, 3);
    expect(result.maintenanceHint).toBeUndefined();
  });

  it("extends half-life for central non-superseded notes", () => {
    const result = computeDecayInfo({
      lifecycle: "permanent",
      updatedAt: daysAgoIso(180),
      centrality: 20,
      now,
    });

    expect(result.halfLifeDays).toBeGreaterThan(180);
    expect(result.basis).toContain("centrality-extension");
  });

  it("suggests prune-superseded for stale superseded notes without centrality extension", () => {
    const result = computeDecayInfo({
      lifecycle: "permanent",
      updatedAt: daysAgoIso(31),
      role: "decision",
      centrality: 20,
      superseded: true,
      now,
    });

    expect(result.halfLifeDays).toBe(30);
    expect(result.basis).toEqual(["superseded"]);
    expect(result.maintenanceHint).toBe("prune-superseded");
  });

  it("handles invalid dates and negative centrality fail-soft", () => {
    const result = computeDecayInfo({
      lifecycle: "temporary",
      updatedAt: "not-a-date",
      centrality: -5,
      now,
    });

    expect(result.ageDays).toBe(0);
    expect(result.freshness).toBe(1);
    expect(result.staleness).toBe(0);
    expect(result.maintenanceHint).toBeUndefined();
  });

  it("normalizes non-finite now and centrality fail-soft", () => {
    const result = computeDecayInfo({
      lifecycle: "permanent",
      updatedAt: daysAgoIso(10),
      centrality: Number.NaN,
      now: new Date(Number.NaN),
    });

    expect(result.ageDays).toBe(0);
    expect(result.halfLifeDays).toBe(180);
    expect(result.freshness).toBe(1);
    expect(result.staleness).toBe(0);
  });
});
