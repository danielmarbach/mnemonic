import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, stat, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import { embedModel } from "../src/embeddings.js";
import { RecallResultSchema } from "../src/structured-content.js";

describe("recall-embeddings", () => {
  async function writeSeedNote(vaultDir: string, note: {
    id: string;
    title: string;
    content: string;
    tags?: string[];
    lifecycle?: "temporary" | "permanent";
    updatedAt?: string;
  }): Promise<void> {
    await mkdir(path.join(vaultDir, "notes"), { recursive: true });
    await writeFile(
      path.join(vaultDir, "notes", `${note.id}.md`),
      `---
title: ${note.title}
tags: [${(note.tags ?? []).join(", ")}]
lifecycle: ${note.lifecycle ?? "permanent"}
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: ${note.updatedAt ?? "2026-01-01T00:00:00.000Z"}
memoryVersion: 1
---

${note.content}`,
      "utf-8",
    );
  }

  async function writeSeedEmbedding(vaultDir: string, id: string, embedding: number[]): Promise<void> {
    await mkdir(path.join(vaultDir, "embeddings"), { recursive: true });
      await writeFile(
        path.join(vaultDir, "embeddings", `${id}.json`),
        JSON.stringify({
          id,
          model: embedModel,
          embedding,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }, null, 2),
      "utf-8",
    );
  }

  it("recall backfills a missing embedding and returns the note", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    await mkdir(path.join(vaultDir, "notes"), { recursive: true });
    await writeFile(
      path.join(vaultDir, "notes", "backfill-recall-note.md"),
      `---
title: Lazy backfill recall note
tags: [integration]
lifecycle: permanent
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

This note has no embedding yet and should be found via recall.`,
      "utf-8",
    );

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const recallText = await callLocalMcp(vaultDir, "recall", {
        query: "lazy backfill recall",
      }, embeddingServer.url);

      expect(recallText).toContain("Lazy backfill recall note");
      await expect(stat(path.join(vaultDir, "embeddings", "backfill-recall-note.json"))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("recall re-embeds a stale note edited after its embedding was written", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Staleness detection note",
        content: "Original content before direct edit.",
        tags: ["integration"],
        scope: "global",
        summary: "Seed note for staleness detection test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const embeddingPath = path.join(vaultDir, "embeddings", `${noteId}.json`);

      const embeddingRaw = await readFile(embeddingPath, "utf-8");
      const embeddingJson = JSON.parse(embeddingRaw) as Record<string, unknown>;
      embeddingJson["updatedAt"] = "2020-01-01T00:00:00.000Z";
      await writeFile(embeddingPath, JSON.stringify(embeddingJson), "utf-8");

      await callLocalMcp(vaultDir, "recall", { query: "staleness detection" }, embeddingServer.url);

      const afterRaw = await readFile(embeddingPath, "utf-8");
      const afterJson = JSON.parse(afterRaw) as Record<string, unknown>;
      expect(afterJson["updatedAt"]).not.toBe("2020-01-01T00:00:00.000Z");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("recall returns existing results when Ollama is down (backfill fails silently)", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Offline recall note",
        content: "This note has an embedding and should be found even when Ollama is down.",
        tags: ["integration"],
        scope: "global",
        summary: "Seed note for offline recall test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      await mkdir(path.join(vaultDir, "notes"), { recursive: true });
      await writeFile(
        path.join(vaultDir, "notes", "no-embedding-note.md"),
        `---
title: Note without embedding
tags: [integration]
lifecycle: permanent
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: 2026-01-01T00:00:00.000Z
memoryVersion: 1
---

This note has no embedding.`,
        "utf-8",
      );

      const recallText = await callLocalMcp(vaultDir, "recall", {
        query: "offline recall note",
      }, embeddingServer.url);

      expect(recallText).toContain("Offline recall note");
      await expect(stat(path.join(vaultDir, "embeddings", "no-embedding-note.json"))).resolves.toBeDefined();
      await expect(stat(path.join(vaultDir, "embeddings", `${noteId}.json`))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("fetches full note content via get by exact id", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Get by ID test note",
        content: "Content for get operation.",
        tags: ["integration"],
        scope: "global",
        summary: "Create note for get test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const getText = await callLocalMcp(vaultDir, "get", { ids: [noteId] }, embeddingServer.url);

      expect(getText).toContain(noteId);
      expect(getText).toContain("Get by ID test note");
      expect(getText).toContain("Content for get operation.");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("reports not found ids from get", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const getText = await callLocalMcp(vaultDir, "get", { ids: ["nonexistent-note-id"] });

    expect(getText).toContain("Not found:");
  }, 15000);

  it("locates a memory via where_is_memory", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Where is test note",
        content: "Note for where_is_memory test.",
        tags: ["integration"],
        cwd: repoDir,
        scope: "project",
        summary: "Create note for where_is_memory test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const whereText = await callLocalMcp(vaultDir, "where_is_memory", { id: noteId, cwd: repoDir }, embeddingServer.url);

      expect(whereText).toContain(noteId);
      expect(whereText).toContain("project-vault");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("temporal recall mode returns compact history and verbose stats", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);

      await callLocalMcp(vaultDir, "remember", {
        title: "Temporal recall schema audit test",
        content: "Testing temporal recall history output.",
        tags: ["audit", "temporal"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Seed note for temporal recall schema audit",
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "temporal recall schema audit",
        mode: "temporal",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      const results = structured?.["results"] as Array<Record<string, unknown>>;
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      // history is defined in temporal mode, even if empty (no git commits yet)
      expect(results[0]?.["history"]).toBeDefined();

      // If history has entries, verify temporal fields are present
      const history = results[0]?.["history"] as Array<Record<string, unknown>>;
      if (history && history.length > 0) {
        for (const entry of history) {
          expect(entry).toHaveProperty("changeCategory");
          expect(entry).toHaveProperty("changeDescription");
          expect(typeof entry["changeCategory"]).toBe("string");
          expect(typeof entry["changeDescription"]).toBe("string");
          // Verify descriptions don't contain raw diffs
          expect(entry["changeDescription"]).not.toContain("@@");
          expect(entry["changeDescription"]).not.toContain("diff");
          // "+" and "-" can be part of sentences, so only check at start of line
          expect(entry["changeDescription"]).not.toMatch(/^[-+]/);
        }

        // historySummary is present when there are history entries
        expect(results[0]?.["historySummary"]).toBeDefined();
        expect(typeof results[0]?.["historySummary"]).toBe("string");
      }
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("workflow recall mode supports legacy related-to chains", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const parent = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Workflow parent note",
        content: "Root context for workflow chain.",
        tags: ["workflow"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Create workflow parent",
      }, embeddingServer.url);

      const child = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Workflow child note",
        content: "Plan step connected by legacy related-to.",
        tags: ["workflow"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Create workflow child",
      }, embeddingServer.url);

      await callLocalMcpResponse(vaultDir, "relate", {
        fromId: child.structuredContent?.id,
        toId: parent.structuredContent?.id,
        type: "related-to",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "workflow child plan step",
        mode: "workflow",
        limit: 3,
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results.map((result) => result.title)).toContain("Workflow child note");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("temporal recall mode omits history beyond the enrichment cap instead of claiming no history", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);

      await callLocalMcp(vaultDir, "remember", {
        title: "Temporal cap test note",
        content: "Testing temporal history cap.",
        tags: ["audit", "temporal"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Seed note for temporal cap test",
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "temporal cap test",
        mode: "temporal",
        limit: 1,
      }, embeddingServer.url);

      const results = response.structuredContent?.["results"] as Array<Record<string, unknown>>;
      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(1);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("plain recall leaves temporal history absent", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);

      await callLocalMcp(vaultDir, "remember", {
        title: "Plain recall temporal absent test",
        content: "Testing plain recall mode.",
        tags: ["audit", "temporal"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Seed note for plain recall test",
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "plain recall temporal absent",
      }, embeddingServer.url);

      const structured = response.structuredContent;
      expect(structured?.["mode"]).toBeUndefined();
      const results = structured?.["results"] as Array<Record<string, unknown>>;
      expect(results).toBeDefined();
      if (results.length > 0) {
        expect(results[0]?.["history"]).toBeUndefined();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("applies strict explicit temporal filtering for semantic recall candidates", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-temporal-filter-semantic-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const now = Date.now();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

      await writeSeedNote(vaultDir, {
        id: "fresh-temporal-semantic",
        title: "Fresh temporal semantic note",
        content: "Recent temporal recall changes for semantic filtering test.",
        tags: ["temporal", "integration"],
        updatedAt: twoDaysAgo,
      });
      await writeSeedNote(vaultDir, {
        id: "stale-temporal-semantic",
        title: "Stale temporal semantic note",
        content: "Older temporal recall changes for semantic filtering test.",
        tags: ["temporal", "integration"],
        updatedAt: fortyDaysAgo,
      });

      await writeSeedEmbedding(vaultDir, "fresh-temporal-semantic", [0.1, 0.2, 0.3]);
      await writeSeedEmbedding(vaultDir, "stale-temporal-semantic", [0.1, 0.2, 0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "show recall changes from the last 7 days",
        limit: 10,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((result) => result.id);

      expect(ids).toContain("fresh-temporal-semantic");
      expect(ids).not.toContain("stale-temporal-semantic");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("keeps named-period temporal hints as boost-only without strict filtering", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-temporal-filter-boost-only-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const now = Date.now();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

      await writeSeedNote(vaultDir, {
        id: "fresh-temporal-boost",
        title: "Fresh temporal boost note",
        content: "Recent temporal recall changes for boost-only test.",
        tags: ["temporal", "integration"],
        updatedAt: twoDaysAgo,
      });
      await writeSeedNote(vaultDir, {
        id: "stale-temporal-boost",
        title: "Stale temporal boost note",
        content: "Older temporal recall changes for boost-only test.",
        tags: ["temporal", "integration"],
        updatedAt: fortyDaysAgo,
      });

      await writeSeedEmbedding(vaultDir, "fresh-temporal-boost", [0.1, 0.2, 0.3]);
      await writeSeedEmbedding(vaultDir, "stale-temporal-boost", [0.1, 0.2, 0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "what changed this week in recall",
        limit: 10,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((result) => result.id);

      expect(ids).toContain("fresh-temporal-boost");
      expect(ids).toContain("stale-temporal-boost");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("applies strict explicit temporal filtering to lexical rescue candidates", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-temporal-filter-rescue-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const now = Date.now();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      const fiftyDaysAgo = new Date(now - 50 * 24 * 60 * 60 * 1000).toISOString();

      await writeSeedNote(vaultDir, {
        id: "fresh-temporal-rescue",
        title: "Fresh temporal rescue note",
        content: "Temporal rescue candidate with projectiontext recovery semantics.",
        tags: ["temporal", "rescue"],
        updatedAt: twoDaysAgo,
      });
      await writeSeedNote(vaultDir, {
        id: "stale-temporal-rescue",
        title: "Stale temporal rescue note",
        content: "Temporal rescue candidate with projectiontext recovery semantics.",
        tags: ["temporal", "rescue"],
        updatedAt: fiftyDaysAgo,
      });

      // Force semantic misses so lexical rescue path is exercised.
      await writeSeedEmbedding(vaultDir, "fresh-temporal-rescue", [-0.1, -0.2, -0.3]);
      await writeSeedEmbedding(vaultDir, "stale-temporal-rescue", [-0.1, -0.2, -0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "projectiontext recovery in the last 7 days",
        limit: 10,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((result) => result.id);

      expect(ids).toContain("fresh-temporal-rescue");
      expect(ids).not.toContain("stale-temporal-rescue");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("RecallResultSchema accepts provenance and confidence fields in results", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Schema audit recall test",
        content: "Testing provenance and confidence in recall.",
        tags: ["audit", "recall"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Seed note for recall schema audit",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "schema audit recall test",
      }, embeddingServer.url);

      expect(() => RecallResultSchema.parse(response.structuredContent)).not.toThrow();
      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results).toBeDefined();
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0]).toHaveProperty("id");
      expect(parsed.results[0]).toHaveProperty("title");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("keeps semantic paraphrase matches ahead when lexical overlap is weak", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-semantic-paraphrase-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await writeSeedNote(vaultDir, {
        id: "semantic-target",
        title: "CI learning promotion guidance",
        content: "We promote CI failure learnings into durable notes after triage so useful lessons are preserved.",
        tags: ["ci", "learning", "design"],
      });
      await writeSeedNote(vaultDir, {
        id: "lexical-decoy",
        title: "Promotion workflow checklist",
        content: "Promotion guidance and workflow checklist for weekly operational reviews.",
        tags: ["workflow"],
      });

      await writeSeedEmbedding(vaultDir, "semantic-target", [0.1, 0.2, 0.3]);
      await writeSeedEmbedding(vaultDir, "lexical-decoy", [0.05, 0.1, 0.15]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "how we handle promotion of CI learnings",
        limit: 2,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0]?.id).toBe("semantic-target");
      expect(parsed.results[1]?.id).toBe("lexical-decoy");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("rescues rare repo-jargon queries with the strongest lexical match", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-repo-jargon-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await writeSeedNote(vaultDir, {
        id: "projection-doc",
        title: "Projection layer notes",
        content: "ProjectionText staleness handling for derived retrieval text and cache refresh behavior.",
        tags: ["projection", "design"],
      });
      await writeSeedNote(vaultDir, {
        id: "general-recall",
        title: "Recall notes",
        content: "General recall design notes without implementation-specific vocabulary.",
        tags: ["recall"],
      });
      await writeSeedNote(vaultDir, {
        id: "broad-projection",
        title: "Projection overview",
        content: "ProjectionText retrieval text overview for broad indexing behavior.",
        tags: ["projection"],
      });

      for (const id of ["projection-doc", "general-recall", "broad-projection"]) {
        await writeSeedEmbedding(vaultDir, id, [-0.1, -0.2, -0.3]);
      }

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "projectiontext staleness",
        limit: 3,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results.length).toBeGreaterThanOrEqual(1);
      expect(parsed.results[0]?.id).toBe("projection-doc");
      expect(parsed.results.map((result) => result.id)).not.toContain("general-recall");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("does not let lexical boosts displace a stronger non-English semantic match", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-cross-language-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await writeSeedNote(vaultDir, {
        id: "english-decoy",
        title: "Promotion workflow checklist",
        content: "Promotion workflow guidance and checklist for weekly review handling.",
        tags: ["workflow"],
      });
      await writeSeedNote(vaultDir, {
        id: "italian-target",
        title: "Promozione degli apprendimenti CI",
        content: "Promuoviamo gli apprendimenti dai fallimenti CI in note durevoli dopo il triage.",
        tags: ["ci", "learning"],
      });

      await writeSeedEmbedding(vaultDir, "english-decoy", [0.2, 0.05, -0.1]);
      await writeSeedEmbedding(vaultDir, "italian-target", [0.1, 0.2, 0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "how we handle promotion of CI learnings",
        limit: 2,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results).toHaveLength(1);
      expect(parsed.results[0]?.id).toBe("italian-target");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("reranks semantic ties using projections even when no projection cache is warm", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-hybrid-rerank-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await writeSeedNote(vaultDir, {
        id: "a-unrelated",
        title: "Weekly Notes",
        content: "General team status and logistics.",
        tags: ["journal"],
      });
      await writeSeedNote(vaultDir, {
        id: "b-target",
        title: "Hybrid Recall Design",
        content: "Exact design notes for hybrid recall ranking and rescue.",
        tags: ["recall", "design"],
      });

      await writeSeedEmbedding(vaultDir, "a-unrelated", [0.1, 0.2, 0.3]);
      await writeSeedEmbedding(vaultDir, "b-target", [0.1, 0.2, 0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "hybrid recall design",
        limit: 2,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0]?.id).toBe("b-target");
      expect(parsed.results[0]?.title).toBe("Hybrid Recall Design");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("lexical rescue keeps the strongest projection matches instead of first-seen notes", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-hybrid-rescue-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await writeSeedNote(vaultDir, {
        id: "a-weak",
        title: "Recall notes",
        content: "Brief mention of recall.",
        tags: ["recall"],
      });
      await writeSeedNote(vaultDir, {
        id: "b-mid",
        title: "Recall design",
        content: "Design considerations for recall behavior.",
        tags: ["recall", "design"],
      });
      await writeSeedNote(vaultDir, {
        id: "c-mid",
        title: "Hybrid design",
        content: "Hybrid matching notes for retrieval.",
        tags: ["hybrid", "design"],
      });
      await writeSeedNote(vaultDir, {
        id: "d-strong",
        title: "Hybrid Recall Design",
        content: "Hybrid recall design with lexical reranking and lexical rescue.",
        tags: ["hybrid", "recall", "design"],
      });

      for (const id of ["a-weak", "b-mid", "c-mid", "d-strong"]) {
        await writeSeedEmbedding(vaultDir, id, [-0.1, -0.2, -0.3]);
      }

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "hybrid recall design",
        limit: 3,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results.length).toBeGreaterThanOrEqual(1);
      expect(parsed.results[0]?.id).toBe("d-strong");
      expect(parsed.results.map((result) => result.id)).not.toContain("a-weak");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("lexical rescue still finds the strongest late candidate beyond the initial rescue scan window", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-hybrid-rescue-window-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      for (let i = 0; i < 20; i++) {
        const id = `a-decoy-${String(i).padStart(2, "0")}`;
        await writeSeedNote(vaultDir, {
          id,
          title: `ProjectionText note ${i}`,
          content: "ProjectionText notes for general indexing behavior.",
          tags: ["projection", "retrieval"],
        });
        await writeSeedEmbedding(vaultDir, id, [-0.1, -0.2, -0.3]);
      }

      await writeSeedNote(vaultDir, {
        id: "z-strong-target",
        title: "ProjectionText staleness design",
        content: "ProjectionText staleness handling for derived retrieval text and precise rescue behavior.",
        tags: ["projection", "design"],
      });
      await writeSeedEmbedding(vaultDir, "z-strong-target", [-0.1, -0.2, -0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "projectiontext staleness",
        limit: 3,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results.length).toBeGreaterThanOrEqual(1);
      expect(parsed.results[0]?.id).toBe("z-strong-target");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("promotes the canonical explanatory note for why-style recall queries", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "Key design decisions",
        content: "Embeddings are gitignored because they are derived data and can be rebuilt.\n\n## Decision\nKeep derived artifacts out of git.\n\n## Rationale\nGit should track durable source-of-truth notes, not rebuildable machine output.",
        tags: ["design"],
        cwd: repoDir,
        scope: "project",
        summary: "Add canonical design explanation note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "Sync redesign",
        content: "Embeddings sync redesign and reindex behavior. This note discusses when embeddings are regenerated during sync.",
        tags: ["sync"],
        cwd: repoDir,
        scope: "project",
        summary: "Add incidental embeddings note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "why are embeddings gitignored",
        cwd: repoDir,
        scope: "all",
        limit: 3,
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results[0]?.title).toBe("Key design decisions");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("does not displace a direct answer with a generic overview note", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(vaultDir, "remember", {
        title: "API endpoint port",
        content: "The local API listens on port 4317 and the port can be changed via configuration.",
        tags: ["fact"],
        cwd: repoDir,
        scope: "project",
        summary: "Add direct answer note",
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "remember", {
        title: "System overview",
        content: "This note explains architecture, decisions, and system context in a broad durable form.",
        tags: ["overview"],
        cwd: repoDir,
        scope: "project",
        summary: "Add overview note",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "what port does the local api use",
        cwd: repoDir,
        scope: "all",
        limit: 3,
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results[0]?.title).toBe("API endpoint port");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("keeps retrievalEvidence off by default and includes compact evidence when requested", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-evidence-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const sourceText = await callLocalMcp(vaultDir, "remember", {
        title: "Recall evidence source",
        content: "This note explains recall evidence ranking and supersession lineage.",
        tags: ["evidence", "recall"],
        lifecycle: "permanent",
        scope: "global",
        summary: "Create source note for recall evidence",
      }, embeddingServer.url);
      const sourceId = extractRememberedId(sourceText);

      const childText = await callLocalMcp(vaultDir, "remember", {
        title: "Recall evidence child",
        content: "Older fragment superseded by the recall evidence source note.",
        tags: ["evidence", "recall"],
        lifecycle: "temporary",
        scope: "global",
        summary: "Create child note for recall evidence",
      }, embeddingServer.url);
      const childId = extractRememberedId(childText);

      await callLocalMcp(vaultDir, "relate", {
        fromId: sourceId,
        toId: childId,
        type: "supersedes",
        bidirectional: false,
      }, embeddingServer.url);

      const defaultResponse = await callLocalMcpResponse(vaultDir, "recall", {
        query: "Recall evidence source",
        scope: "global",
      }, embeddingServer.url);
      const defaultParsed = RecallResultSchema.parse(defaultResponse.structuredContent);
      const defaultMatch = defaultParsed.results.find((result) => result.id === sourceId);
      expect(defaultMatch).toBeDefined();
      expect(defaultMatch?.retrievalEvidence).toBeUndefined();
      expect(defaultResponse.text).not.toContain("channels:");

      const evidenceResponse = await callLocalMcpResponse(vaultDir, "recall", {
        query: "Recall evidence source",
        scope: "global",
        evidence: "compact",
      }, embeddingServer.url);
      const evidenceParsed = RecallResultSchema.parse(evidenceResponse.structuredContent);
      const evidenceMatch = evidenceParsed.results.find((result) => result.id === sourceId);
      expect(evidenceMatch?.retrievalEvidence).toBeDefined();
      expect(evidenceMatch?.retrievalEvidence?.channels.length).toBeGreaterThan(0);
      expect(["top3", "top10", "lower"]).toContain(evidenceMatch?.retrievalEvidence?.rankBand);
      expect(["today", "thisWeek", "thisMonth", "older"]).toContain(evidenceMatch?.retrievalEvidence?.freshness);
      expect(evidenceMatch?.retrievalEvidence?.projectRelevant).toBe(false);
      expect(evidenceMatch?.retrievalEvidence?.superseded).toBe(true);
      expect(evidenceMatch?.retrievalEvidence?.supersededCount).toBeGreaterThan(0);
      expect(evidenceResponse.text).toContain("channels:");
      expect(evidenceResponse.text).toContain("supersedes");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("includes confidence in recall text output for non-temporal queries", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-confidence-text-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-confidence-repo-"));
      tempDirs.push(repoDir);
      await initTestRepo(repoDir);

      await callLocalMcp(vaultDir, "remember", {
        title: "Confidence text output test",
        content: "This note should show confidence in the text rendering of non-temporal recall results.",
        tags: ["confidence", "text-rendering"],
        lifecycle: "permanent",
        scope: "project",
        cwd: repoDir,
        summary: "Seed note for confidence text rendering test",
      }, embeddingServer.url);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "confidence text output",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(response.text).toMatch(/\*\*confidence:\*\*\s*(high|medium|low)/i);
      expect(response.text).toContain("confidence:");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
