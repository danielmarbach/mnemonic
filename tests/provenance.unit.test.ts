import { describe, expect, it, vi } from "vitest";
import { computeConfidence, getNoteProvenance } from "../src/provenance.js";

const mockGit = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLastCommit: vi.fn() as any,
} as any;

describe("computeConfidence", () => {
  it("returns high when lifecycle is permanent, centrality >= 5, and updated within 30 days", () => {
    const recent = new Date();
    const updatedAt = recent.toISOString();
    expect(computeConfidence("permanent", updatedAt, 5)).toBe("high");
    expect(computeConfidence("permanent", updatedAt, 10)).toBe("high");
  });

  it("returns medium when updated within 90 days but not meeting high criteria", () => {
    const recent = new Date();
    const updatedAt = recent.toISOString();
    expect(computeConfidence("permanent", updatedAt, 4)).toBe("medium");
    expect(computeConfidence("temporary", updatedAt, 10)).toBe("medium");
  });

  it("returns medium when permanent, centrality >= 5, but updated more than 30 days ago", () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const updatedAt = oldDate.toISOString();
    expect(computeConfidence("permanent", updatedAt, 5)).toBe("medium");
  });

  it("returns low when updated more than 90 days ago", () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const updatedAt = oldDate.toISOString();
    expect(computeConfidence("permanent", updatedAt, 10)).toBe("low");
    expect(computeConfidence("temporary", updatedAt, 0)).toBe("low");
  });
});

describe("getNoteProvenance", () => {
  it("returns provenance when git has a commit for the file", async () => {
    mockGit.getLastCommit.mockResolvedValueOnce({
      hash: "abc123",
      message: "feat: add test note",
      timestamp: "2026-03-20T10:00:00Z",
    });

    const result = await getNoteProvenance(mockGit, "notes/test.md", "2026-03-20T12:00:00Z");

    expect(result).toEqual({
      lastUpdatedAt: "2026-03-20T10:00:00Z",
      lastCommitHash: "abc123",
      lastCommitMessage: "feat: add test note",
      recentlyChanged: true,
    });
    expect(mockGit.getLastCommit).toHaveBeenCalledWith("notes/test.md");
  });

  it("returns undefined when git has no commit for the file", async () => {
    mockGit.getLastCommit.mockResolvedValueOnce(null);

    const result = await getNoteProvenance(mockGit, "notes/new.md", "2026-03-20T12:00:00Z");

    expect(result).toBeUndefined();
  });

  it("marks recentlyChanged=false when commit is older than 5 days", async () => {
    const oldCommit = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    mockGit.getLastCommit.mockResolvedValueOnce({
      hash: "def456",
      message: "old commit",
      timestamp: oldCommit.toISOString(),
    });

    // Pass recent updatedAt to prove recentlyChanged depends on commit date, not updatedAt
    const recentUpdatedAt = new Date().toISOString();
    const result = await getNoteProvenance(mockGit, "notes/old.md", recentUpdatedAt);

    expect(result?.recentlyChanged).toBe(false);
  });

  it("marks recentlyChanged=true when commit is within 5 days", async () => {
    const recentCommit = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    mockGit.getLastCommit.mockResolvedValueOnce({
      hash: "ghi789",
      message: "recent commit",
      timestamp: recentCommit.toISOString(),
    });

    // Pass old updatedAt to prove recentlyChanged depends on commit date, not updatedAt
    const oldUpdatedAt = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const result = await getNoteProvenance(mockGit, "notes/recent.md", oldUpdatedAt);

    expect(result?.recentlyChanged).toBe(true);
  });
});
