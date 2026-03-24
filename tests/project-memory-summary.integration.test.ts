import { describe, expect, it } from "vitest";
import { mkdtemp, stat } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import { MemoryGraphResultSchema, ProjectSummaryResultSchema } from "../src/structured-content.js";

describe("project-memory-summary", () => {
  it("shows consistent cross-vault results for list recent_memories and project_memory_summary", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const privateProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Private project memory",
        content: "Stored in main vault but associated with the current project.",
        tags: ["integration", "cross-vault"],
        summary: "Create private project memory for visibility test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const privateProjectId = extractRememberedId(privateProjectRemember);

      const sharedProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Shared project memory",
        content: "Stored in the project vault for the current repo.",
        tags: ["integration", "cross-vault"],
        summary: "Create shared project memory for visibility test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const sharedProjectId = extractRememberedId(sharedProjectRemember);

      const globalRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Unscoped global memory",
        content: "Stored in main vault without project association.",
        tags: ["integration", "cross-vault"],
        summary: "Create unscoped global memory for visibility test",
        scope: "global",
      }, embeddingServer.url);
      const globalId = extractRememberedId(globalRemember);

      const listed = await callLocalMcpResponse(vaultDir, "list", {
        cwd: repoDir,
        scope: "all",
        storedIn: "any",
        tags: ["integration", "cross-vault"],
        includeStorage: true,
        includeUpdated: true,
      }, embeddingServer.url);

      expect(listed.structuredContent?.["count"]).toBe(3);
      const listedNotes = listed.structuredContent?.["notes"] as Array<Record<string, unknown>>;
      expect(listedNotes.map((note) => note["id"])).toEqual([privateProjectId, sharedProjectId, globalId]);
      expect(listed.text).toContain("stored=project-vault");
      expect(listed.text).toContain("stored=main-vault");

      const recent = await callLocalMcpResponse(vaultDir, "recent_memories", {
        cwd: repoDir,
        scope: "project",
        storedIn: "any",
        limit: 5,
        includePreview: false,
        includeStorage: true,
      }, embeddingServer.url);

      expect(recent.structuredContent?.["count"]).toBe(2);
      const recentNotes = recent.structuredContent?.["notes"] as Array<Record<string, unknown>>;
      expect(recentNotes.map((note) => note["id"])).toEqual([sharedProjectId, privateProjectId]);
      expect(recent.text).not.toContain("Unscoped global memory");

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
        recentLimit: 5,
      }, embeddingServer.url);

      const summaryNotes = summary.structuredContent?.["notes"] as Record<string, unknown>;
      expect(summaryNotes?.["total"]).toBe(2);
      expect(summaryNotes?.["projectVault"]).toBe(1);
      expect(summaryNotes?.["mainVault"]).toBe(1);
      expect(summaryNotes?.["privateProject"]).toBe(1);
      expect(summary.text).toContain("private project memories: 1");
      expect(summary.text).not.toContain("Unscoped global memory");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("returns empty result when project has no memories but global vault does", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Unscoped global memory",
        content: "Stored in main vault without project association.",
        tags: ["integration", "empty-project"],
        summary: "Create unscoped global memory",
        scope: "global",
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      expect(summary.text).toContain("No memories found");
      const summaryNotes = summary.structuredContent?.["notes"] as Record<string, unknown>;
      expect(summaryNotes?.["total"]).toBe(0);
      expect(summaryNotes?.["projectVault"]).toBe(0);
      expect(summaryNotes?.["mainVault"]).toBe(0);

      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      expect(orientation?.["primaryEntry"]).toEqual({
        id: "",
        title: "No notes",
        rationale: "Empty project vault",
      });
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("ranks tagged anchors by score not alphabetical order", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const alphaRemember = await callLocalMcp(vaultDir, "remember", {
        title: "AAA Tagged Anchor",
        content: "Alphabetically first but lower centrality.",
        tags: ["anchor", "integration"],
        summary: "Create alphabetically first tagged anchor",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const alphaId = extractRememberedId(alphaRemember);

      const note1 = await callLocalMcp(vaultDir, "remember", {
        title: "Note to link",
        content: "A note.",
        tags: ["integration"],
        summary: "Create note to link",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const note1Id = extractRememberedId(note1);

      const betaRemember = await callLocalMcp(vaultDir, "remember", {
        title: "ZZZ Tagged Anchor",
        content: "Alphabetically last but higher centrality.",
        tags: ["anchor", "integration"],
        summary: "Create alphabetically last tagged anchor with more connections",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const betaId = extractRememberedId(betaRemember);

      await callLocalMcp(vaultDir, "relate", {
        fromId: betaId,
        toId: note1Id,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      expect(anchors.length).toBeGreaterThan(0);

      const betaIndex = anchors.findIndex(a => a["id"] === betaId);
      const alphaIndex = anchors.findIndex(a => a["id"] === alphaId);

      expect(betaIndex).toBeGreaterThanOrEqual(0);
      expect(alphaIndex).toBeGreaterThanOrEqual(0);

      expect(betaIndex).toBeLessThan(alphaIndex);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("orientation primaryEntry is best anchor by score", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const hubRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Hub Note",
        content: "Central hub with many connections.",
        tags: ["integration"],
        summary: "Create hub note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const hubId = extractRememberedId(hubRemember);

      const periph1 = await callLocalMcp(vaultDir, "remember", {
        title: "Peripheral 1",
        content: "A peripheral note.",
        tags: ["integration"],
        summary: "Create peripheral note 1",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const periph1Id = extractRememberedId(periph1);

      const periph2 = await callLocalMcp(vaultDir, "remember", {
        title: "Peripheral 2",
        content: "Another peripheral note.",
        tags: ["integration"],
        summary: "Create peripheral note 2",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const periph2Id = extractRememberedId(periph2);

      await callLocalMcp(vaultDir, "relate", {
        fromId: hubId,
        toId: periph1Id,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", {
        fromId: hubId,
        toId: periph2Id,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      const primaryEntry = orientation?.["primaryEntry"] as Record<string, unknown>;

      expect(anchors!.length).toBeGreaterThan(0);
      expect(primaryEntry?.["id"]).toBe(hubId);
      expect(primaryEntry?.["rationale"]).toContain("Centrality");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("falls back to the most recent project note when no anchors exist", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Older project note",
        content: "First project note with no relationships.",
        tags: ["integration", "fallback"],
        summary: "Create older project note without anchors",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      const recentRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Most recent project note",
        content: "Most recent project note with no relationships.",
        tags: ["integration", "fallback"],
        summary: "Create most recent project note without anchors",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const recentId = extractRememberedId(recentRemember);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      expect(anchors).toEqual([]);

      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      const primaryEntry = orientation?.["primaryEntry"] as Record<string, unknown>;
      expect(primaryEntry?.["id"]).toBe(recentId);
      expect(primaryEntry?.["title"]).toBe("Most recent project note");
      expect(primaryEntry?.["rationale"]).toBe("Most recent note — no high-centrality anchors found");
      expect(primaryEntry).toHaveProperty("confidence");
      expect(orientation?.["suggestedNext"]).toEqual([]);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("returns ranked suggestedNext entries with orientation rationale", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const anchorA = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Anchor A",
        content: "Highest-centrality anchor.",
        tags: ["integration", "orientation", "overview"],
        summary: "Create anchor A",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const anchorB = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Anchor B",
        content: "Second-best anchor.",
        tags: ["integration", "orientation", "decisions"],
        summary: "Create anchor B",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const anchorC = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Anchor C",
        content: "Third-best anchor.",
        tags: ["integration", "orientation", "architecture"],
        summary: "Create anchor C",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const anchorD = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Anchor D",
        content: "Fourth-best anchor.",
        tags: ["integration", "orientation", "tools"],
        summary: "Create anchor D",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const leaf1 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Leaf 1",
        content: "Leaf note 1.",
        tags: ["integration", "orientation", "decisions"],
        summary: "Create leaf 1",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const leaf2 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Leaf 2",
        content: "Leaf note 2.",
        tags: ["integration", "orientation", "architecture"],
        summary: "Create leaf 2",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const leaf3 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Leaf 3",
        content: "Leaf note 3.",
        tags: ["integration", "orientation", "tooling"],
        summary: "Create leaf 3",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const leaf4 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Leaf 4",
        content: "Leaf note 4.",
        tags: ["integration", "orientation", "bugs"],
        summary: "Create leaf 4",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      await callLocalMcp(vaultDir, "relate", { fromId: anchorA, toId: leaf1, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: anchorA, toId: leaf2, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: anchorA, toId: leaf3, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: anchorB, toId: leaf1, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: anchorB, toId: leaf2, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: anchorC, toId: leaf1, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: anchorD, toId: leaf4, type: "related-to", cwd: repoDir }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      const primaryEntry = orientation?.["primaryEntry"] as Record<string, unknown>;
      const suggestedNext = orientation?.["suggestedNext"] as Array<Record<string, unknown>>;

      expect(primaryEntry?.["id"]).toBe(anchorA);
      expect(anchors.map((entry) => entry["id"])).toEqual([anchorA, ...suggestedNext.map((entry) => entry["id"])]);
      expect(suggestedNext).toHaveLength(3);
      expect(suggestedNext.map((entry) => entry["id"])).toEqual(anchors.slice(1, 4).map((entry) => entry["id"]));
      expect(suggestedNext.map((entry) => entry["id"])).toEqual(expect.arrayContaining([anchorB, anchorC, anchorD]));
      for (const entry of suggestedNext) {
        expect(String(entry["rationale"] ?? "")).toContain("Centrality");
        expect(String(entry["rationale"] ?? "")).toContain("connects");
      }
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("emits taxonomy dilution warnings only when other exceeds thirty percent", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const notes = [
        { title: "Random note 1", tags: ["integration", "warning-check"] },
        { title: "Random note 2", tags: ["integration", "warning-check"] },
        { title: "Decision note", tags: ["integration", "warning-check", "decisions"] },
        { title: "Tool note", tags: ["integration", "warning-check", "tools"] },
      ];

      for (const note of notes) {
        await callLocalMcp(vaultDir, "remember", {
          title: note.title,
          content: `${note.title} content.`,
          tags: note.tags,
          summary: `Create ${note.title}`,
          cwd: repoDir,
          scope: "project",
          lifecycle: "permanent",
        }, embeddingServer.url);
      }

      const warningSummary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const warningOrientation = warningSummary.structuredContent?.["orientation"] as Record<string, unknown>;
      const warnings = warningOrientation?.["warnings"] as string[] | undefined;
      expect(warnings).toBeDefined();
      expect(warnings?.[0]).toContain('50% of notes in "other" bucket');

      await callLocalMcp(vaultDir, "remember", {
        title: "Architecture note",
        content: "Architecture content.",
        tags: ["integration", "warning-check", "architecture"],
        summary: "Create architecture note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Quality note",
        content: "Quality content.",
        tags: ["integration", "warning-check", "tests"],
        summary: "Create quality note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Overview note",
        content: "Overview content.",
        tags: ["integration", "warning-check", "overview"],
        summary: "Create overview note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      const noWarningSummary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const noWarningOrientation = noWarningSummary.structuredContent?.["orientation"] as Record<string, unknown>;
      expect(noWarningOrientation?.["warnings"]).toBeUndefined();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("does not include relatedGlobal unless explicitly requested", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const hubId = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Project hub",
        content: "Project hub note.",
        tags: ["integration", "related-global"],
        summary: "Create project hub",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const leafId = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Project leaf",
        content: "Project leaf note.",
        tags: ["integration", "related-global", "decisions"],
        summary: "Create project leaf",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      await callLocalMcp(vaultDir, "remember", {
        title: "Global note candidate",
        content: "Unscoped global note that should only appear in relatedGlobal when requested.",
        tags: ["integration", "related-global"],
        summary: "Create related-global candidate",
        scope: "global",
        lifecycle: "permanent",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "relate", {
        fromId: hubId,
        toId: leafId,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      expect(summary.structuredContent?.["relatedGlobal"]).toBeUndefined();
      expect(summary.text).not.toContain("Related Global:");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("shows only visible cross-vault relationships in memory_graph", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const privateProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Graph private project memory",
        content: "Stored in main vault but associated with the current project.",
        tags: ["integration", "graph"],
        summary: "Create private project memory for graph test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const privateProjectId = extractRememberedId(privateProjectRemember);

      const sharedProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Graph shared project memory",
        content: "Stored in the project vault and linked into the graph.",
        tags: ["integration", "graph"],
        summary: "Create shared project memory for graph test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const sharedProjectId = extractRememberedId(sharedProjectRemember);

      const globalRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Graph global memory",
        content: "Unscoped global memory that should disappear from project-only graph results.",
        tags: ["integration", "graph"],
        summary: "Create global memory for graph test",
        scope: "global",
      }, embeddingServer.url);
      const globalId = extractRememberedId(globalRemember);

      await callLocalMcp(vaultDir, "relate", {
        fromId: privateProjectId,
        toId: sharedProjectId,
        type: "related-to",
        bidirectional: true,
        cwd: repoDir,
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "relate", {
        fromId: privateProjectId,
        toId: globalId,
        type: "explains",
        bidirectional: true,
        cwd: repoDir,
      }, embeddingServer.url);

      const graphAll = await callLocalMcpResponse(vaultDir, "memory_graph", {
        cwd: repoDir,
        scope: "all",
        storedIn: "any",
        limit: 10,
      }, embeddingServer.url);

      expect(graphAll.text).toContain(privateProjectId);
      expect(graphAll.text).toContain(sharedProjectId);
      expect(graphAll.text).toContain(globalId);
      const allNodes = graphAll.structuredContent?.["nodes"] as Array<Record<string, unknown>>;
      const privateNode = allNodes.find((node) => node["id"] === privateProjectId);
      expect(privateNode).toBeTruthy();
      expect((privateNode?.["edges"] as Array<Record<string, unknown>>).map((edge) => edge["toId"]).sort()).toEqual([
        globalId,
        sharedProjectId,
      ].sort());

      const graphProject = await callLocalMcpResponse(vaultDir, "memory_graph", {
        cwd: repoDir,
        scope: "project",
        storedIn: "any",
        limit: 10,
      }, embeddingServer.url);

      expect(graphProject.text).toContain(privateProjectId);
      expect(graphProject.text).toContain(sharedProjectId);
      expect(graphProject.text).not.toContain(globalId);
      const projectNodes = graphProject.structuredContent?.["nodes"] as Array<Record<string, unknown>>;
      const projectPrivateNode = projectNodes.find((node) => node["id"] === privateProjectId);
      expect((projectPrivateNode?.["edges"] as Array<Record<string, unknown>>).map((edge) => edge["toId"])).toEqual([
        sharedProjectId,
      ]);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});