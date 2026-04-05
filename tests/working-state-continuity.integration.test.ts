import { describe, it, expect, afterAll } from "vitest";
import os from "os";
import path from "path";
import { mkdtemp } from "fs/promises";
import {
  callLocalMcp,
  callLocalMcpResponse,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";
import { ProjectSummaryResultSchema, RecallResultSchema, RecentResultSchema } from "../src/structured-content.js";

afterAll(async () => {
  // Cleanup via tempDirs in mcp helpers
});

describe("working-state continuity", () => {
  it("recall filters by lifecycle temporary", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-lifecycle-filter-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);

      // Create a temporary note
      await callLocalMcp(vaultDir, "remember", {
        title: "Temporary plan",
        content: "This is a temporary plan for implementation.",
        tags: ["plan", "wip"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Temporary note",
      }, { ollamaUrl: embeddingServer.url, disableGit: true });

      // Create a permanent note
      await callLocalMcp(vaultDir, "remember", {
        title: "Permanent decision",
        content: "This is a permanent decision about architecture.",
        tags: ["decision", "architecture"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Permanent note",
      }, { ollamaUrl: embeddingServer.url, disableGit: true });

      // Test filtering temporary only
      const tempResponse = await callLocalMcpResponse(vaultDir, "recall", {
        query: "plan",
        lifecycle: "temporary",
      }, embeddingServer.url);

      const tempResults = RecallResultSchema.parse(tempResponse.structuredContent);
      expect(tempResults.results).toHaveLength(1);
      expect(tempResults.results[0]?.title).toBe("Temporary plan");
      expect(tempResults.results[0]?.lifecycle).toBe("temporary");

      // Test filtering permanent only
      const permResponse = await callLocalMcpResponse(vaultDir, "recall", {
        query: "decision",
        lifecycle: "permanent",
      }, embeddingServer.url);

      const permResults = RecallResultSchema.parse(permResponse.structuredContent);
      expect(permResults.results).toHaveLength(1);
      expect(permResults.results[0]?.title).toBe("Permanent decision");
      expect(permResults.results[0]?.lifecycle).toBe("permanent");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("recent_memories filters by lifecycle temporary", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recent-lifecycle-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);

      // Create a temporary note
      await callLocalMcp(vaultDir, "remember", {
        title: "Recent temporary note",
        content: "Recent temporary work in progress.",
        tags: ["wip"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Recent temporary",
      }, { ollamaUrl: embeddingServer.url, disableGit: true });

      // Create a permanent note
      await callLocalMcp(vaultDir, "remember", {
        title: "Recent permanent note",
        content: "Recent permanent knowledge.",
        tags: ["knowledge"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Recent permanent",
      }, { ollamaUrl: embeddingServer.url, disableGit: true });

      // Test filtering temporary
      const tempResponse = await callLocalMcpResponse(vaultDir, "recent_memories", {
        lifecycle: "temporary",
        limit: 5,
      }, embeddingServer.url);

      const tempResults = RecentResultSchema.parse(tempResponse.structuredContent);
      expect(tempResults.notes.every(n => n.lifecycle === "temporary")).toBe(true);
      expect(tempResults.notes.length).toBeGreaterThan(0);

      // Test filtering permanent
      const permResponse = await callLocalMcpResponse(vaultDir, "recent_memories", {
        lifecycle: "permanent",
        limit: 5,
      }, embeddingServer.url);

      const permResults = RecentResultSchema.parse(permResponse.structuredContent);
      expect(permResults.notes.every(n => n.lifecycle === "permanent")).toBe(true);
      expect(permResults.notes.length).toBeGreaterThan(0);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("recovery workflow: orientation then temporary recall", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recovery-flow-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recovery-project-"));
    tempDirs.push(vaultDir, repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);
      await initTestRepo(repoDir);

      // Create a mix of notes
      await callLocalMcp(vaultDir, "remember", {
        title: "Project overview",
        content: "This is the permanent project overview.",
        tags: ["overview"],
        lifecycle: "permanent",
        scope: "project",
        cwd: repoDir,
        summary: "Overview note",
      }, { ollamaUrl: embeddingServer.url, disableGit: true });

      await callLocalMcp(vaultDir, "remember", {
        title: "WIP plan",
        content: "This is a work in progress plan.",
        tags: ["plan", "wip"],
        lifecycle: "temporary",
        scope: "project",
        cwd: repoDir,
        summary: "WIP note",
      }, { ollamaUrl: embeddingServer.url, disableGit: true });

      // Step 1: Orientation must go through project_memory_summary first
      const orientationResponse = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const orientationResults = ProjectSummaryResultSchema.parse(orientationResponse.structuredContent);
      expect(orientationResults.orientation.primaryEntry.title).toBe("Project overview");

      // Step 2: Recovery of working state
      const recoveryResponse = await callLocalMcpResponse(vaultDir, "recall", {
        query: "plan",
        lifecycle: "temporary",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);

      const recoveryResults = RecallResultSchema.parse(recoveryResponse.structuredContent);
      expect(recoveryResults.results).toHaveLength(1);
      expect(recoveryResults.results[0]?.title).toBe("WIP plan");
      expect(recoveryResults.results[0]?.lifecycle).toBe("temporary");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
