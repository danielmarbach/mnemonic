import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import matter from "gray-matter";

import {
  callLocalMcp,
  callLocalMcpResponse,
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import { MemoryGraphResultSchema, ProjectSummaryResultSchema } from "../src/structured-content.js";

async function updateProjectNoteFrontmatter(
  repoDir: string,
  noteId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const notePath = path.join(repoDir, ".mnemonic", "notes", `${noteId}.md`);
  await stat(notePath);
  const raw = await readFile(notePath, "utf8");
  const parsed = matter(raw);
  await writeFile(notePath, matter.stringify(parsed.content, { ...parsed.data, ...updates }));
}

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

  it("uses explicit metadata to break otherwise comparable anchor ties", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const alphaRemember = await callLocalMcp(vaultDir, "remember", {
        title: "AAA Plain Anchor",
        content: "Alphabetically first but lower centrality.",
        tags: ["integration"],
        summary: "Create alphabetically first plain anchor",
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
        lifecycle: "temporary",
      }, embeddingServer.url);
      const note1Id = extractRememberedId(note1);

      const betaRemember = await callLocalMcp(vaultDir, "remember", {
        title: "ZZZ Metadata Anchor",
        content: "Alphabetically last but boosted by explicit metadata.",
        tags: ["integration"],
        summary: "Create alphabetically last metadata anchor",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const betaId = extractRememberedId(betaRemember);

      const note2 = await callLocalMcp(vaultDir, "remember", {
        title: "Second note to link",
        content: "Another note.",
        tags: ["integration"],
        summary: "Create second note to link",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url);
      const note2Id = extractRememberedId(note2);

      const sharedTimestamp = "2026-03-20T10:00:00.000Z";
      await updateProjectNoteFrontmatter(repoDir, alphaId, { updatedAt: sharedTimestamp, createdAt: sharedTimestamp });
      await updateProjectNoteFrontmatter(repoDir, betaId, {
        updatedAt: sharedTimestamp,
        createdAt: sharedTimestamp,
        role: "summary",
        importance: "high",
        alwaysLoad: true,
      });

      await callLocalMcp(vaultDir, "relate", {
        fromId: alphaId,
        toId: note2Id,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);

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

      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      const primaryEntry = orientation?.["primaryEntry"] as Record<string, unknown>;
      expect(primaryEntry?.["id"]).toBe(betaId);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("keeps explicit standalone summary notes eligible for anchors and orientation", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const summaryRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Project Overview",
        content: "A hand-authored overview note with no graph links yet.",
        tags: ["integration"],
        summary: "Create explicit summary note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const summaryId = extractRememberedId(summaryRemember);

      await updateProjectNoteFrontmatter(repoDir, summaryId, {
        role: "summary",
        importance: "high",
        updatedAt: "2026-03-20T10:00:00.000Z",
        createdAt: "2026-03-20T10:00:00.000Z",
      });

      await callLocalMcp(vaultDir, "remember", {
        title: "Plain Context Note",
        content: "A regular project note without metadata.",
        tags: ["integration"],
        summary: "Create plain project note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      expect(anchors.some((anchor) => anchor["id"] === summaryId)).toBe(true);

      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      const primaryEntry = orientation?.["primaryEntry"] as Record<string, unknown>;
      expect(primaryEntry?.["id"]).toBe(summaryId);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("lets suggested metadata lightly improve orientation when explicit metadata is absent", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const plainId = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "AAA Plain Anchor",
        content: "Plain hub note without explicit or strongly suggestive structure.",
        tags: ["integration", "suggested-orientation", "overview"],
        summary: "Create plain anchor for suggested metadata test",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const suggestedId = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "ZZZ Suggested Decision Anchor",
        content: [
          "## Decision",
          "We use a lightweight metadata hint in orientation scoring.",
          "## Why",
          "This note explains two implementation leaves and stays permanent.",
          "- Tradeoff: keep graph and recency primary.",
          "- Rollout: add only a light metadata bonus.",
        ].join("\n\n"),
        tags: ["integration", "suggested-orientation", "overview"],
        summary: "Create suggested-metadata anchor for orientation test",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const decisionLeafA = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Decision leaf A",
        content: "Implementation detail A.",
        tags: ["integration", "suggested-orientation", "decisions"],
        summary: "Create decision leaf A",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const decisionLeafB = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Decision leaf B",
        content: "Implementation detail B.",
        tags: ["integration", "suggested-orientation", "architecture"],
        summary: "Create decision leaf B",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const plainLeafA = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Plain leaf A",
        content: "Plain detail A.",
        tags: ["integration", "suggested-orientation", "decisions"],
        summary: "Create plain leaf A",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const plainLeafB = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Plain leaf B",
        content: "Plain detail B.",
        tags: ["integration", "suggested-orientation", "architecture"],
        summary: "Create plain leaf B",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const sharedTimestamp = "2026-03-20T10:00:00.000Z";
      await updateProjectNoteFrontmatter(repoDir, plainId, { updatedAt: sharedTimestamp, createdAt: sharedTimestamp });
      await updateProjectNoteFrontmatter(repoDir, suggestedId, { updatedAt: sharedTimestamp, createdAt: sharedTimestamp });

      await callLocalMcp(vaultDir, "relate", {
        fromId: suggestedId,
        toId: decisionLeafA,
        type: "explains",
        cwd: repoDir,
      }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", {
        fromId: suggestedId,
        toId: decisionLeafB,
        type: "explains",
        cwd: repoDir,
      }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", {
        fromId: plainId,
        toId: plainLeafA,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", {
        fromId: plainId,
        toId: plainLeafB,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      const suggestedIndex = anchors.findIndex((anchor) => anchor["id"] === suggestedId);
      const plainIndex = anchors.findIndex((anchor) => anchor["id"] === plainId);

      expect(suggestedIndex).toBeGreaterThanOrEqual(0);
      expect(plainIndex).toBeGreaterThanOrEqual(0);
      expect(suggestedIndex).toBeLessThan(plainIndex);

      const orientation = summary.structuredContent?.["orientation"] as Record<string, unknown>;
      const primaryEntry = orientation?.["primaryEntry"] as Record<string, unknown>;
      expect(primaryEntry?.["id"]).toBe(suggestedId);
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

  it("keeps inbound-only permanent notes eligible as anchors", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const hubId = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Inbound Hub",
        content: "Permanent note linked only by other project notes.",
        tags: ["integration", "inbound-anchor", "overview"],
        summary: "Create inbound-only hub",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const leaf1Id = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Inbound leaf 1",
        content: "Leaf note one.",
        tags: ["integration", "inbound-anchor", "decisions"],
        summary: "Create inbound leaf 1",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const leaf2Id = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "Inbound leaf 2",
        content: "Leaf note two.",
        tags: ["integration", "inbound-anchor", "architecture"],
        summary: "Create inbound leaf 2",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      await callLocalMcp(vaultDir, "relate", {
        fromId: leaf1Id,
        toId: hubId,
        type: "related-to",
        bidirectional: false,
        cwd: repoDir,
      }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", {
        fromId: leaf2Id,
        toId: hubId,
        type: "related-to",
        bidirectional: false,
        cwd: repoDir,
      }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      expect(anchors.map((anchor) => anchor["id"])) .toContain(hubId);

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

  it("uses the same graduated theme system for anchor diversity and theme caps", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const postgresA = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "PostgreSQL operations hub",
        content: "Central PostgreSQL operations note.",
        tags: ["integration", "graduated-theme"],
        summary: "Create PostgreSQL operations hub",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const postgresB = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "PostgreSQL tuning hub",
        content: "Central PostgreSQL tuning note.",
        tags: ["integration", "graduated-theme"],
        summary: "Create PostgreSQL tuning hub",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const postgresC = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "PostgreSQL failover hub",
        content: "Central PostgreSQL failover note.",
        tags: ["integration", "graduated-theme"],
        summary: "Create PostgreSQL failover hub",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url));

      const leaf1 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "PostgreSQL leaf 1",
        content: "Leaf one.",
        tags: ["integration", "graduated-theme"],
        summary: "Create PostgreSQL leaf 1",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const leaf2 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "PostgreSQL leaf 2",
        content: "Leaf two.",
        tags: ["integration", "graduated-theme"],
        summary: "Create PostgreSQL leaf 2",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      const leaf3 = extractRememberedId(await callLocalMcp(vaultDir, "remember", {
        title: "PostgreSQL leaf 3",
        content: "Leaf three.",
        tags: ["integration", "graduated-theme"],
        summary: "Create PostgreSQL leaf 3",
        cwd: repoDir,
        scope: "project",
        lifecycle: "temporary",
      }, embeddingServer.url));

      await callLocalMcp(vaultDir, "relate", { fromId: postgresA, toId: leaf1, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: postgresA, toId: leaf2, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: postgresB, toId: leaf1, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: postgresB, toId: leaf3, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: postgresC, toId: leaf2, type: "related-to", cwd: repoDir }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", { fromId: postgresC, toId: leaf3, type: "related-to", cwd: repoDir }, embeddingServer.url);

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const anchors = summary.structuredContent?.["anchors"] as Array<Record<string, unknown>>;
      const postgresAnchors = anchors.filter((anchor) => String(anchor["title"]).includes("PostgreSQL"));
      expect(postgresAnchors).toHaveLength(2);
      for (const anchor of postgresAnchors) {
        expect(anchor["connectionDiversity"]).toBe(1);
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
        { title: "Miscellaneous alpha", tags: ["unique-tag-alpha"], content: "Alpha miscellaneous content xyz.", summary: "Record alpha note" },
        { title: "Miscellaneous beta", tags: ["unique-tag-beta"], content: "Beta miscellaneous content abc.", summary: "Record beta note" },
        { title: "Decision note", tags: ["decisions"], content: "Decision about architecture.", summary: "Record decision note" },
        { title: "Tool note", tags: ["tools"], content: "Tool setup information.", summary: "Record tool note" },
      ];

      for (const note of notes) {
        await callLocalMcp(vaultDir, "remember", {
          title: note.title,
          content: note.content,
          tags: note.tags,
          summary: note.summary,
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

      // Add more categorized notes to bring "other" below 30%
      await callLocalMcp(vaultDir, "remember", {
        title: "Architecture note",
        content: "Architecture content details here.",
        tags: ["architecture"],
        summary: "Create architecture note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Quality note",
        content: "Quality content specifics here.",
        tags: ["tests"],
        summary: "Create quality note",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Overview note",
        content: "Overview content summary here.",
        tags: ["overview"],
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
