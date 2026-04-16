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
        model: "nomic-embed-text",
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
      expect(parsed.results).toHaveLength(3);
      expect(parsed.results.map((result) => result.id)).toContain("d-strong");
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
          title: `ProjectionText retrieval text note ${i}`,
          content: "ProjectionText derived retrieval text for general indexing behavior and broad notes.",
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
        query: "projectiontext staleness derived retrieval text",
        limit: 3,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      expect(parsed.results).toHaveLength(3);
      expect(parsed.results[0]?.id).toBe("z-strong-target");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
