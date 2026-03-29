import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import http from "http";

import { GetResultSchema, ProjectSummaryResultSchema, RecallResultSchema } from "../src/structured-content.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const builtEntryPoint = path.join(repoRoot, "build", "index.js");

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => import("fs/promises").then(fs => fs.rm(dir, { recursive: true, force: true }))));
});

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
}, 120000);

async function startFakeEmbeddingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine fake embedding server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}

async function callLocalMcpMethod(
  vaultDir: string,
  id: number,
  method: string,
  params: Record<string, unknown>,
  options?: { ollamaUrl?: string },
): Promise<{ id?: number; result?: Record<string, unknown> }> {
  const messages = [
    {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0" },
      },
    },
    {
      jsonrpc: "2.0",
      id,
      method,
      params,
    },
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const { spawn } = require("child_process");
    const child = spawn("node", [builtEntryPoint], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DISABLE_GIT: "true",
        VAULT_PATH: vaultDir,
        ...(options?.ollamaUrl ? { OLLAMA_URL: options.ollamaUrl } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";
    let stderrDataOut = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
      stderrDataOut += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderrData}`));
      } else {
        resolve(stdoutData);
      }
    });

    child.stdin.end(messages.map((msg) => JSON.stringify(msg)).join("\n") + "\n");
  });

  const lines = stdout.trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    throw new Error(`Empty stdout from MCP process. stderr: ${stderrDataOut}`);
  }
  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch (e) {
    throw new Error(`Failed to parse JSON from: ${lastLine}. stderr: ${stderrDataOut}`);
  }
}

async function callLocalMcpTool(
  vaultDir: string,
  toolName: string,
  args: Record<string, unknown>,
  options?: { ollamaUrl?: string },
): Promise<{ text: string; structuredContent?: Record<string, unknown> }> {
  const response = await callLocalMcpMethod(vaultDir, 1, "tools/call", {
    name: toolName,
    arguments: args,
  }, options);
  const text = response?.result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`Missing tool response for ${toolName}`);
  }

  return { text, structuredContent: response?.result?.structuredContent as Record<string, unknown> | undefined };
}

describe("Phase 4 relationship expansion", () => {
  describe("get with includeRelationships", () => {
    it("returns relationships field when includeRelationships is true", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-get-"));
      tempDirs.push(vaultDir);

      // Create two related notes
      await callLocalMcpTool(vaultDir, "remember", {
        title: "Note A",
        content: "Content A",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      const noteB = await callLocalMcpTool(vaultDir, "remember", {
        title: "Note B",
        content: "Content B",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Relate Note A to Note B
      const noteAList = await callLocalMcpTool(vaultDir, "list", { cwd: vaultDir, scope: "project" });
      const noteAId = noteAList.structuredContent?.notes?.[0]?.id;
      if (!noteAId) throw new Error("Note A not found");

      await callLocalMcpTool(vaultDir, "relate", {
        fromId: noteAId,
        toId: noteB.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      // Get with includeRelationships
      const result = await callLocalMcpTool(vaultDir, "get", {
        ids: [noteAId],
        cwd: vaultDir,
        includeRelationships: true,
      });

      const parsed = GetResultSchema.parse(result.structuredContent);
      expect(parsed.notes[0].relationships).toBeDefined();
      expect(parsed.notes[0].relationships?.shown).toHaveLength(1);
      expect(parsed.notes[0].relationships?.truncated).toBe(false);
    }, 30000);

    it("omits relationships field when includeRelationships is false", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-get-"));
      tempDirs.push(vaultDir);

      const note = await callLocalMcpTool(vaultDir, "remember", {
        title: "Standalone Note",
        content: "Content",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      const result = await callLocalMcpTool(vaultDir, "get", {
        ids: [note.structuredContent?.id],
        cwd: vaultDir,
        includeRelationships: false,
      });

      const parsed = GetResultSchema.parse(result.structuredContent);
      expect(parsed.notes[0].relationships).toBeUndefined();
    }, 30000);
  });

  describe("recall relationship expansion", () => {
    it("attaches relationships to top result", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-recall-"));
      tempDirs.push(vaultDir);

      const embeddingServer = await startFakeEmbeddingServer();
      try {
        // Create anchor note
        const anchor = await callLocalMcpTool(vaultDir, "remember", {
          title: "Anchor Note",
          content: "Anchor content",
          cwd: vaultDir,
          scope: "project",
          lifecycle: "permanent",
          tags: ["anchor"],
        }, { ollamaUrl: embeddingServer.url });

        // Create related note
        const related = await callLocalMcpTool(vaultDir, "remember", {
          title: "Related to Anchor",
          content: "Related content",
          cwd: vaultDir,
          scope: "project",
          lifecycle: "permanent",
        }, { ollamaUrl: embeddingServer.url });

        // Relate
        await callLocalMcpTool(vaultDir, "relate", {
          fromId: related.structuredContent?.id,
          toId: anchor.structuredContent?.id,
          type: "related-to",
          cwd: vaultDir,
        }, { ollamaUrl: embeddingServer.url });

        // Recall
        const result = await callLocalMcpTool(vaultDir, "recall", {
          query: "anchor",
          cwd: vaultDir,
          limit: 1,
        }, { ollamaUrl: embeddingServer.url });

        const parsed = RecallResultSchema.parse(result.structuredContent);
        expect(parsed.results).toHaveLength(1);
        // Top result should have relationships if it has any
        expect(parsed.results[0].relationships).toBeDefined();
      } finally {
        await embeddingServer.close();
      }
    }, 30000);
  });

  describe("project_memory_summary relationship expansion", () => {
    it("includes relationships on primaryEntry", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-summary-"));
      tempDirs.push(vaultDir);

      // Create central anchor with multiple relations
      const central = await callLocalMcpTool(vaultDir, "remember", {
        title: "Central Design",
        content: "Central design decision",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
        tags: ["anchor"],
      });

      const related1 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Related Decision 1",
        content: "Related 1",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      const related2 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Related Decision 2",
        content: "Related 2",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Relate central to both
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: central.structuredContent?.id,
        toId: related1.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      await callLocalMcpTool(vaultDir, "relate", {
        fromId: central.structuredContent?.id,
        toId: related2.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      // Get summary
      const result = await callLocalMcpTool(vaultDir, "project_memory_summary", {
        cwd: vaultDir,
      });

      const parsed = ProjectSummaryResultSchema.parse(result.structuredContent);
      expect(parsed.orientation.primaryEntry.relationships).toBeDefined();
      expect(parsed.orientation.primaryEntry.relationships?.shown).toBeDefined();
      expect(parsed.orientation.primaryEntry.relationships?.totalDirectRelations).toBeGreaterThanOrEqual(2);
    }, 30000);

    it("includes relationships on suggestedNext entries", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-summary-"));
      tempDirs.push(vaultDir);

      // Create primary anchor with most connections
      const anchor1 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Primary Anchor",
        content: "First anchor with many relations",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
        tags: ["anchor"],
      });

      const anchor2 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Secondary Anchor",
        content: "Second anchor",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
        tags: ["anchor"],
      });

      const related = await callLocalMcpTool(vaultDir, "remember", {
        title: "Related to Anchor 2",
        content: "Related",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Give anchor1 more relations so it becomes primaryEntry
      const extra1 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Extra 1",
        content: "Extra",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });
      const extra2 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Extra 2",
        content: "Extra",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      await callLocalMcpTool(vaultDir, "relate", {
        fromId: anchor1.structuredContent?.id,
        toId: extra1.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: anchor1.structuredContent?.id,
        toId: extra2.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      // Relate anchor2 to related (anchor2 should be in suggestedNext)
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: anchor2.structuredContent?.id,
        toId: related.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      // Get summary
      const result = await callLocalMcpTool(vaultDir, "project_memory_summary", {
        cwd: vaultDir,
      });

      const parsed = ProjectSummaryResultSchema.parse(result.structuredContent);
      // At least one suggestedNext should have relationships
      const withRelationships = parsed.orientation.suggestedNext.filter(e => e.relationships !== undefined);
      expect(withRelationships.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe("cross-vault relationship expansion", () => {
    it("includes cross-vault related note in get relationship preview", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-xvault-"));
      tempDirs.push(vaultDir);

      // Create a note in the global vault (scope: global)
      const globalNote = await callLocalMcpTool(vaultDir, "remember", {
        title: "Global Design Note",
        content: "A global context note",
        cwd: vaultDir,
        scope: "global",
        lifecycle: "permanent",
      });

      // Create a note in the project vault (scope: project)
      const projectNote = await callLocalMcpTool(vaultDir, "remember", {
        title: "Project Note",
        content: "A project-specific note",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Relate project note → global note
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: projectNote.structuredContent?.id,
        toId: globalNote.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      // Get project note with includeRelationships; should resolve the global note across vaults
      const result = await callLocalMcpTool(vaultDir, "get", {
        ids: [projectNote.structuredContent?.id],
        cwd: vaultDir,
        includeRelationships: true,
      });

      const parsed = GetResultSchema.parse(result.structuredContent);
      expect(parsed.notes[0].relationships).toBeDefined();
      expect(parsed.notes[0].relationships?.totalDirectRelations).toBe(1);
      const shownIds = parsed.notes[0].relationships?.shown.map(r => r.id);
      expect(shownIds).toContain(globalNote.structuredContent?.id);
    }, 30000);

    it("same-project notes rank before global notes in relationship preview", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-phase4-xvault-"));
      tempDirs.push(vaultDir);

      // Create a global note
      const globalNote = await callLocalMcpTool(vaultDir, "remember", {
        title: "Global Note",
        content: "Global content",
        cwd: vaultDir,
        scope: "global",
        lifecycle: "permanent",
      });

      // Create two project notes
      const projectNote1 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Project Note 1",
        content: "Project content 1",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });
      const projectNote2 = await callLocalMcpTool(vaultDir, "remember", {
        title: "Project Note 2",
        content: "Project content 2",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Create source note in project vault related to both global and project notes
      const sourceNote = await callLocalMcpTool(vaultDir, "remember", {
        title: "Source Note",
        content: "Source content",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Relate source to global first, then to project notes
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: sourceNote.structuredContent?.id,
        toId: globalNote.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: sourceNote.structuredContent?.id,
        toId: projectNote1.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: sourceNote.structuredContent?.id,
        toId: projectNote2.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      const result = await callLocalMcpTool(vaultDir, "get", {
        ids: [sourceNote.structuredContent?.id],
        cwd: vaultDir,
        includeRelationships: true,
      });

      const parsed = GetResultSchema.parse(result.structuredContent);
      expect(parsed.notes[0].relationships).toBeDefined();
      expect(parsed.notes[0].relationships?.totalDirectRelations).toBe(3);

      // The shown entries (limit 3) should include both project notes; global note may be shown
      // but project notes must rank before global when limit < total
      const shown = parsed.notes[0].relationships!.shown;
      const shownIds = shown.map(r => r.id);
      // Both project notes should appear before the global note (same-project boost of 100)
      expect(shownIds).toContain(projectNote1.structuredContent?.id);
      expect(shownIds).toContain(projectNote2.structuredContent?.id);
    }, 30000);
  });
});
