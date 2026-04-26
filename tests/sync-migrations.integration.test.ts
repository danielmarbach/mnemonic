import { describe, expect, it } from "vitest";
import { mkdtemp, stat, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import {
  ConsolidateResultSchema,
  GetResultSchema,
  ListResultSchema,
  MemoryGraphResultSchema,
  MigrationExecuteResultSchema,
  MigrationListResultSchema,
  RecallResultSchema,
  RecentResultSchema,
  SyncResultSchema,
  WhereIsResultSchema,
} from "../src/structured-content.js";

describe("sync-migrations", () => {
  it("reports sync status cleanly when git syncing is disabled", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Sync disabled test note",
        content: "Test note for sync with git disabled.",
        scope: "global",
        summary: "Seed note for sync disabled test",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "sync", {}, embeddingServer.url);

      expect(response.text).toContain("main vault: no remote configured");
      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("synced");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("backfills missing project embeddings during sync on a fresh clone", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Project note pending embedding",
        content: "This project note needs an embedding.",
        cwd: repoDir,
        scope: "project",
        summary: "Create project note for embedding backfill",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const embeddingPath = path.join(repoDir, ".mnemonic", "embeddings", `${noteId}.json`);

      await expect(stat(embeddingPath)).resolves.toBeDefined();

      const response = await callLocalMcpResponse(vaultDir, "sync", { cwd: repoDir }, embeddingServer.url);

      expect(response.text).toContain("project vault:");
      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("synced");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("returns structured migration metadata from list_migrations", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const response = await callLocalMcpResponse(vaultDir, "list_migrations", {});

    const structured = response.structuredContent;
    expect(structured?.["action"]).toBe("migration_list");
    expect(response.text).toContain("migrations");
  }, 15000);

  it("keeps migration and graph structured outputs aligned with their schemas", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Schema audit note",
        content: "Note for schema alignment test.",
        tags: ["audit"],
        lifecycle: "permanent",
        cwd: repoDir,
        scope: "project",
        summary: "Seed note for schema audit",
      }, embeddingServer.url);

      const migrationResponse = await callLocalMcpResponse(vaultDir, "list_migrations", {});
      expect(() => MigrationListResultSchema.parse(migrationResponse.structuredContent)).not.toThrow();

      const graphResponse = await callLocalMcpResponse(vaultDir, "memory_graph", {
        cwd: repoDir,
        scope: "project",
        storedIn: "any",
        limit: 10,
      }, embeddingServer.url);
      expect(() => MemoryGraphResultSchema.parse(graphResponse.structuredContent)).not.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("uses canonical project objects and exposes alwaysLoad in typed note results", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Canonical project metadata note",
        content: "Project-scoped note used to validate structured project identity and alwaysLoad.",
        tags: ["audit", "structured-content"],
        lifecycle: "permanent",
        alwaysLoad: true,
        cwd: repoDir,
        scope: "project",
        summary: "Create note for structured project metadata audit",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const [listResponse, getResponse, recallResponse, recentResponse, whereIsResponse] = await Promise.all([
        callLocalMcpResponse(vaultDir, "list", { cwd: repoDir, scope: "project" }, embeddingServer.url),
        callLocalMcpResponse(vaultDir, "get", { ids: [noteId], cwd: repoDir }, embeddingServer.url),
        callLocalMcpResponse(vaultDir, "recall", { query: "canonical project metadata", cwd: repoDir, scope: "project" }, embeddingServer.url),
        callLocalMcpResponse(vaultDir, "recent_memories", { cwd: repoDir, scope: "project", limit: 5 }, embeddingServer.url),
        callLocalMcpResponse(vaultDir, "where_is_memory", { id: noteId, cwd: repoDir }, embeddingServer.url),
      ]);

      const listed = ListResultSchema.parse(listResponse.structuredContent);
      expect(listed.project).toBeDefined();
      expect(listed.notes[0]?.project).toEqual(listed.project);

      const got = GetResultSchema.parse(getResponse.structuredContent);
      expect(got.notes[0]?.project).toEqual(listed.project);
      expect(got.notes[0]?.alwaysLoad).toBe(true);

      const recalled = RecallResultSchema.parse(recallResponse.structuredContent);
      expect(recalled.results[0]?.project).toEqual(listed.project);

      const recent = RecentResultSchema.parse(recentResponse.structuredContent);
      expect(recent.project).toEqual(listed.project);
      expect(recent.notes[0]?.project).toEqual(listed.project);

      const located = WhereIsResultSchema.parse(whereIsResponse.structuredContent);
      expect(located.project).toEqual(listed.project);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("does not fabricate project objects for legacy notes missing projectName metadata", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Legacy project metadata note",
        content: "Project-scoped note rewritten to simulate missing projectName metadata.",
        tags: ["audit", "legacy"],
        lifecycle: "permanent",
        cwd: repoDir,
        scope: "project",
        summary: "Create note for legacy project metadata audit",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const notePath = path.join(repoDir, ".mnemonic", "notes", `${noteId}.md`);
      const noteContents = await readFile(notePath, "utf-8");
      await writeFile(notePath, noteContents.replace(/^projectName: .*\n/m, ""), "utf-8");

      const [listResponse, getResponse] = await Promise.all([
        callLocalMcpResponse(vaultDir, "list", { cwd: repoDir, scope: "project" }, embeddingServer.url),
        callLocalMcpResponse(vaultDir, "get", { ids: [noteId], cwd: repoDir }, embeddingServer.url),
      ]);

      const listed = ListResultSchema.parse(listResponse.structuredContent);
      expect(listed.project).toBeDefined();
      expect(listed.notes[0]?.project).toBeUndefined();

      const got = GetResultSchema.parse(getResponse.structuredContent);
      expect(got.notes[0]?.project).toBeUndefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("validates consolidate find-clusters structured output includes themeGroups and relationshipClusters", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Cluster note A",
        content: "First note for clustering.",
        tags: ["audit", "cluster"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create first cluster note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Cluster note B",
        content: "Second note for clustering.",
        tags: ["audit", "cluster"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create second cluster note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "consolidate", {
        strategy: "find-clusters",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(structured?.["action"]).toBeDefined();
      expect(Array.isArray(structured?.["themeGroups"])).toBe(true);
      expect(Array.isArray(structured?.["relationshipClusters"])).toBe(true);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("rebuilds all embeddings during sync when force=true", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Sync force rebuild note",
        content: "This note will have its embedding rebuilt by sync force mode.",
        scope: "global",
        summary: "Seed note for sync force rebuild test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const embeddingPath = path.join(vaultDir, "embeddings", `${noteId}.json`);
      const before = await readFile(embeddingPath, "utf-8");

      const response = await callLocalMcpResponse(vaultDir, "sync", { force: true }, embeddingServer.url);

      expect(response.text).toContain("main vault: no remote configured — git sync skipped.");
      expect(response.text).toContain("main vault: embedded 1 note(s) (force rebuild).");
      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("synced");
      const vaults = structured?.["vaults"] as Array<Record<string, unknown>>;
      expect(vaults).toHaveLength(1);
      expect(vaults[0]?.["vault"]).toBe("main");
      expect(vaults[0]?.["embedded"]).toBe(1);
      expect(vaults[0]?.["failed"]).toEqual([]);
      await expect(stat(embeddingPath)).resolves.toBeDefined();
      const after = await readFile(embeddingPath, "utf-8");
      expect(after).not.toBe("");
      expect(before).not.toBe("");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("returns consolidate evidence payloads for detect-duplicates and suggest-merges", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const noteAText = await callLocalMcp(vaultDir, "remember", {
        title: "Evidence merge note A",
        content: "Merge evidence payload test for duplicate and merge suggestion analysis.",
        tags: ["evidence", "merge"],
        lifecycle: "permanent",
        summary: "Create note A for consolidate evidence",
        scope: "global",
      }, embeddingServer.url);
      const noteAId = extractRememberedId(noteAText);

      const noteBText = await callLocalMcp(vaultDir, "remember", {
        title: "Evidence merge note B",
        content: "Merge evidence payload test for duplicate and merge suggestion analysis.",
        tags: ["evidence", "merge"],
        lifecycle: "temporary",
        role: "research",
        summary: "Create note B for consolidate evidence",
        scope: "global",
      }, embeddingServer.url);
      const noteBId = extractRememberedId(noteBText);

      await callLocalMcp(vaultDir, "relate", {
        fromId: noteAId,
        toId: noteBId,
        type: "supersedes",
        bidirectional: false,
      }, embeddingServer.url);

      const dupResponse = await callLocalMcpResponse(vaultDir, "consolidate", {
        strategy: "detect-duplicates",
        threshold: 0,
        evidence: true,
      }, embeddingServer.url);
      const dupParsed = ConsolidateResultSchema.parse(dupResponse.structuredContent);
      expect(dupParsed.duplicatePairs?.length).toBeGreaterThan(0);
      expect(dupParsed.duplicatePairs?.[0]?.noteA.mergeRisk).toMatch(/low|medium|high/);
      expect(dupParsed.duplicatePairs?.[0]?.mergeRisk).toMatch(/low|medium|high/);
      expect(dupResponse.text).toContain("Merge risk:");

      const suggestResponse = await callLocalMcpResponse(vaultDir, "consolidate", {
        strategy: "suggest-merges",
        threshold: 0,
        evidence: true,
      }, embeddingServer.url);
      const suggestParsed = ConsolidateResultSchema.parse(suggestResponse.structuredContent);
      expect(suggestParsed.mergeSuggestions?.length).toBeGreaterThan(0);
      expect(suggestParsed.mergeSuggestions?.[0]?.notes[0]?.ageDays).toBeTypeOf("number");
      expect(suggestParsed.mergeSuggestions?.[0]?.mergeRisk).toMatch(/low|medium|high/);
      expect(suggestResponse.text).toContain("Evidence:");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("keeps sync structured output aligned with SyncResultSchema", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Schema audit sync note",
        content: "Used to validate SyncResultSchema alignment.",
        scope: "global",
        summary: "Seed note for sync schema audit",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "sync", {}, embeddingServer.url);

      const parsed = SyncResultSchema.parse(response.structuredContent);
      expect(parsed.action).toBe("synced");
      expect(parsed.vaults).toHaveLength(1);
      expect(parsed.vaults[0]?.vault).toBe("main");
      expect(parsed.vaults[0]?.gitError).toBeUndefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("merges a global note and a project-associated note in a single execute-merge call", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const globalRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Cross scope source A (global)",
        content: "A purely global note with no project association.",
        tags: ["integration", "cross-scope"],
        lifecycle: "permanent",
        summary: "Create global note for cross-scope consolidation test",
        scope: "global",
      }, embeddingServer.url);
      const globalId = extractRememberedId(globalRemember);

      const projectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Cross scope source B (project-associated, main-vault)",
        content: "A project-associated note stored privately in main-vault.",
        tags: ["integration", "cross-scope"],
        lifecycle: "permanent",
        summary: "Create project-associated note for cross-scope consolidation test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const projectAssociatedId = extractRememberedId(projectRemember);

      const consolidateText = await callLocalMcp(vaultDir, "consolidate", {
        strategy: "execute-merge",
        mode: "delete",
        mergePlan: {
          sourceIds: [globalId, projectAssociatedId],
          targetTitle: "Cross scope consolidated note",
          content: "Merged content from a global note and a project-associated note.",
        },
      }, embeddingServer.url);

      expect(consolidateText).not.toContain("not found");
      expect(consolidateText).toContain("Mode: delete");
      expect(consolidateText).toContain("Source notes deleted.");

      const consolidatedIdMatch = consolidateText.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(consolidatedIdMatch).toBeTruthy();
      const consolidatedId = consolidatedIdMatch![1]!;

      const consolidatedPath = path.join(vaultDir, "notes", `${consolidatedId}.md`);
      const consolidatedContents = await readFile(consolidatedPath, "utf-8");
      expect(consolidatedContents).toContain("Merged content from a global note and a project-associated note.");

      await expect(stat(path.join(vaultDir, "notes", `${globalId}.md`))).rejects.toThrow();
      await expect(stat(path.join(vaultDir, "notes", `${projectAssociatedId}.md`))).rejects.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
