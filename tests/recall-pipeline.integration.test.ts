import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

import { RecallResultSchema } from "../src/structured-content.js";
import { embedModel } from "../src/embeddings.js";
import {
  callLocalMcp,
  callLocalMcpResponse,
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => import("fs/promises").then((fs) => fs.rm(dir, { recursive: true, force: true }))));
});

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
}, 120000);

async function writeSeedNote(vaultDir: string, note: {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  lifecycle?: "temporary" | "permanent";
  updatedAt?: string;
  relatedTo?: Array<{ id: string; type: string }>;
}, projectDir?: string): Promise<void> {
  const baseDir = projectDir ? path.join(projectDir, ".mnemonic") : vaultDir;
  await mkdir(path.join(baseDir, "notes"), { recursive: true });
  const relatedToYaml = note.relatedTo?.length
    ? `\nrelatedTo: [${note.relatedTo.map((r) => `{id: ${r.id}, type: ${r.type}}`).join(", ")}]`
    : "";
  await writeFile(
    path.join(baseDir, "notes", `${note.id}.md`),
    `---
title: ${note.title}
tags: [${(note.tags ?? []).join(", ")}]
lifecycle: ${note.lifecycle ?? "permanent"}
createdAt: 2026-01-01T00:00:00.000Z
updatedAt: ${note.updatedAt ?? "2026-01-01T00:00:00.000Z"}
memoryVersion: 1${relatedToYaml}
---

${note.content}`,
    "utf-8",
  );
}

async function writeSeedEmbedding(vaultDir: string, id: string, embedding: number[], projectDir?: string): Promise<void> {
  const baseDir = projectDir ? path.join(projectDir, ".mnemonic") : vaultDir;
  await mkdir(path.join(baseDir, "embeddings"), { recursive: true });
  await writeFile(
    path.join(baseDir, "embeddings", `${id}.json`),
    JSON.stringify({
      id,
      model: embedModel,
      embedding,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }, null, 2),
    "utf-8",
  );
}

describe("recall pipeline integration", () => {
  it("graph-discovered cross-vault candidate appears in recall results", async () => {
    const mainVaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-pipeline-main-"));
    tempDirs.push(mainVaultDir);
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-pipeline-repo-"));
    tempDirs.push(repoDir);
    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const globalNote = await callLocalMcp(mainVaultDir, "remember", {
        title: "Global Architecture Decision",
        content: "A global note describing architecture decisions, design patterns, and system structure.",
        tags: ["integration", "architecture"],
        scope: "global",
        lifecycle: "permanent",
        summary: "Global architecture decision note",
        cwd: repoDir,
      }, embeddingServer.url);

      const globalId = extractRememberedId(globalNote);

      const projectNote = await callLocalMcp(mainVaultDir, "remember", {
        title: "Project Entry Point",
        content: "A project note serving as an entry point for graph spreading to discover the global architecture note.",
        tags: ["integration", "pipeline"],
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
        summary: "Project entry point for cross-vault graph spreading test",
      }, embeddingServer.url);

      const projectId = extractRememberedId(projectNote);

      await callLocalMcp(mainVaultDir, "relate", {
        fromId: projectId,
        toId: globalId,
        type: "explains",
        cwd: repoDir,
      }, embeddingServer.url);

      const projectEmbeddingPath = path.join(repoDir, ".mnemonic", "embeddings", `${projectId}.json`);
      const highScoreEmbedding = Array(384).fill(0).map((_, i) => i === 0 ? 0.9 : 0.01);
      const projectEmbeddingRaw = await readFile(projectEmbeddingPath, "utf-8");
      const projectEmbeddingJson = JSON.parse(projectEmbeddingRaw) as Record<string, unknown>;
      projectEmbeddingJson["embedding"] = highScoreEmbedding;
      await writeFile(projectEmbeddingPath, JSON.stringify(projectEmbeddingJson), "utf-8");

      const globalEmbeddingPath = path.join(mainVaultDir, "embeddings", `${globalId}.json`);
      const lowEmbedding = Array(384).fill(0).map((_, i) => i === 0 ? 0.01 : 0.01);
      const globalEmbeddingRaw = await readFile(globalEmbeddingPath, "utf-8");
      const globalEmbeddingJson = JSON.parse(globalEmbeddingRaw) as Record<string, unknown>;
      globalEmbeddingJson["embedding"] = lowEmbedding;
      await writeFile(globalEmbeddingPath, JSON.stringify(globalEmbeddingJson), "utf-8");

      const response = await callLocalMcpResponse(mainVaultDir, "recall", {
        query: "Project Entry Point architecture",
        cwd: repoDir,
        limit: 10,
        scope: "all",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((r) => r.id);

      expect(ids).toContain(projectId);

      const globalResult = parsed.results.find((r) => r.id === globalId);
      expect(globalResult).toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("rescue candidates with coverage and phrase scores are not systematically depressed", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-pipeline-rescue-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await writeSeedNote(vaultDir, {
        id: "rescue-lexical-match",
        title: "Rescue Candidate Coverage Scoring",
        content: "Rescue candidate scoring should include coverage and phrase scores to avoid double penalty against semantic candidates. When a rescue candidate has strong lexical overlap, it should not be systematically depressed by zero coverage and phrase scores.",
        tags: ["integration", "pipeline"],
      });

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "rescue candidate scoring coverage phrase scores lexical rank",
        limit: 10,
        scope: "global",
        minSimilarity: 0.01,
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((r) => r.id);

      expect(ids).toContain("rescue-lexical-match");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("temporal filter does not over-exclude for explicit window queries", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-pipeline-temporal-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const now = Date.now();
      const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

      await writeSeedNote(vaultDir, {
        id: "recent-temporal-note",
        title: "Recent Pipeline Temporal Note",
        content: "A note with a recent timestamp that should survive explicit temporal filtering in the pipeline.",
        tags: ["integration", "pipeline"],
        updatedAt: twoDaysAgo,
      });
      await writeSeedEmbedding(vaultDir, "recent-temporal-note", [0.1, 0.2, 0.3]);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "show recent pipeline changes from the last 7 days",
        limit: 10,
        scope: "global",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((r) => r.id);

      expect(ids).toContain("recent-temporal-note");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});