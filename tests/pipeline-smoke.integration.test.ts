import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

import {
  callLocalMcp,
  callLocalMcpResponse,
  callLocalMcpPrompt,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import { RecallResultSchema } from "../src/structured-content.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
}, 120000);

describe("pipeline smoke assertions", () => {
  it("project_memory_summary returns identical orientation on repeated calls (warm session stability)", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);
    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const hubRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Stability Hub Note",
        content: "Central note that should consistently be the primary entry.",
        tags: ["integration", "stability"],
        summary: "Create hub note for stability test",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const hubId = extractRememberedId(hubRemember);

      const leaf1Remember = await callLocalMcp(vaultDir, "remember", {
        title: "Stability Leaf 1",
        content: "Leaf note connected to hub.",
        tags: ["integration", "stability"],
        summary: "Create leaf note 1 for stability test",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const leaf1Id = extractRememberedId(leaf1Remember);

      const leaf2Remember = await callLocalMcp(vaultDir, "remember", {
        title: "Stability Leaf 2",
        content: "Another leaf note connected to hub.",
        tags: ["integration", "stability"],
        summary: "Create leaf note 2 for stability test",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      }, embeddingServer.url);
      const leaf2Id = extractRememberedId(leaf2Remember);

      await callLocalMcp(vaultDir, "relate", {
        fromId: hubId,
        toId: leaf1Id,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);
      await callLocalMcp(vaultDir, "relate", {
        fromId: hubId,
        toId: leaf2Id,
        type: "related-to",
        cwd: repoDir,
      }, embeddingServer.url);

      const summary1 = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const summary2 = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
      }, embeddingServer.url);

      const orientation1 = summary1.structuredContent?.["orientation"] as Record<string, unknown>;
      const orientation2 = summary2.structuredContent?.["orientation"] as Record<string, unknown>;

      expect(orientation1?.primaryEntry).toEqual(orientation2?.primaryEntry);
      expect(orientation1?.suggestedNext).toEqual(orientation2?.suggestedNext);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("recall with temporal mode returns recent results without over-excluding", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Recent temporal decision note",
        content: "A recently created note about design decisions that should appear in temporal recall.",
        tags: ["integration", "temporal"],
        summary: "Create recent note for temporal recall test",
        scope: "global",
        lifecycle: "permanent",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const response = await callLocalMcpResponse(vaultDir, "recall", {
        query: "recent design decisions",
        limit: 5,
        scope: "global",
        mode: "temporal",
      }, embeddingServer.url);

      const parsed = RecallResultSchema.parse(response.structuredContent);
      const ids = parsed.results.map((r: { id: string }) => r.id);

      expect(ids).toContain(noteId);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("mnemonic-workflow-hint prompt includes orientation guidance", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const promptText = await callLocalMcpPrompt(vaultDir, "mnemonic-workflow-hint");

    expect(promptText).toContain("Call `project_memory_summary` first for orientation");
  }, 15000);
});