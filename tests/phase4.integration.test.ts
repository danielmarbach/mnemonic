import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

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

async function callLocalMcpMethod(
  vaultDir: string,
  id: number,
  method: string,
  params: Record<string, unknown>,
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
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}: ${stderrData}`));
      } else {
        resolve(stdoutData);
      }
    });

    messages.forEach((msg) => {
      child.stdin.write(JSON.stringify(msg) + "\n");
    });
    child.stdin.end();
  });

  const lines = stdout.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  return JSON.parse(lastLine);
}

async function callLocalMcpTool(
  vaultDir: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ text: string; structuredContent?: Record<string, unknown> }> {
  const response = await callLocalMcpMethod(vaultDir, 1, "tools/call", {
    name: toolName,
    arguments: args,
  });
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

      // Create anchor note
      const anchor = await callLocalMcpTool(vaultDir, "remember", {
        title: "Anchor Note",
        content: "Anchor content",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
        tags: ["anchor"],
      });

      // Create related note
      const related = await callLocalMcpTool(vaultDir, "remember", {
        title: "Related to Anchor",
        content: "Related content",
        cwd: vaultDir,
        scope: "project",
        lifecycle: "permanent",
      });

      // Relate
      await callLocalMcpTool(vaultDir, "relate", {
        fromId: related.structuredContent?.id,
        toId: anchor.structuredContent?.id,
        type: "related-to",
        cwd: vaultDir,
      });

      // Recall
      const result = await callLocalMcpTool(vaultDir, "recall", {
        query: "anchor",
        cwd: vaultDir,
        limit: 1,
      });

      const parsed = RecallResultSchema.parse(result.structuredContent);
      expect(parsed.results).toHaveLength(1);
      // Top result should have relationships if it has any
      expect(parsed.results[0].relationships).toBeDefined();
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
});
