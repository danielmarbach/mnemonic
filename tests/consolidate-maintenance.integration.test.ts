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

import { ConsolidateResultSchema } from "../src/structured-content.js";

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

describe("consolidate maintenance warnings and classification", () => {
  it("dry-run includes maintenance warnings for stale temporaries and superseded notes", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const stalePlanId = extractRememberedId(
        await callLocalMcp(
          vaultDir,
          "remember",
          {
            title: "Stale integration plan",
            content: "Plan with checklist items that are old and stale.",
            tags: ["workflow", "integration"],
            summary: "Create stale plan note",
            cwd: repoDir,
            scope: "project",
            lifecycle: "temporary",
            role: "plan",
          },
          embeddingServer.url,
        ),
      );

      const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      await updateProjectNoteFrontmatter(repoDir, stalePlanId, {
        updatedAt: old,
        createdAt: old,
        role: "plan",
      });

      const replacementId = extractRememberedId(
        await callLocalMcp(
          vaultDir,
          "remember",
          {
            title: "Replacement decision",
            content: "The newer decision that supersedes old context.",
            tags: ["decisions", "integration"],
            summary: "Create replacement decision",
            cwd: repoDir,
            scope: "project",
            lifecycle: "permanent",
            role: "decision",
          },
          embeddingServer.url,
        ),
      );

      const supersededId = extractRememberedId(
        await callLocalMcp(
          vaultDir,
          "remember",
          {
            title: "Superseded decision",
            content: "Old decision kept for traceability until pruned.",
            tags: ["decisions", "integration"],
            summary: "Create superseded decision",
            cwd: repoDir,
            scope: "project",
            lifecycle: "permanent",
            role: "decision",
          },
          embeddingServer.url,
        ),
      );

      const oldSuperseded = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      await updateProjectNoteFrontmatter(repoDir, supersededId, {
        updatedAt: oldSuperseded,
        createdAt: oldSuperseded,
        role: "decision",
        relatedTo: [{ id: replacementId, type: "supersedes" }],
      });

      const dryRun = await callLocalMcpResponse(
        vaultDir,
        "consolidate",
        {
          cwd: repoDir,
          strategy: "dry-run",
        },
        embeddingServer.url,
      );

      const parsed = ConsolidateResultSchema.parse(dryRun.structuredContent);

      expect(parsed.maintenanceWarnings).toBeDefined();
      expect(parsed.maintenanceWarnings!.length).toBeGreaterThanOrEqual(1);

      const staleWarning = parsed.maintenanceWarnings!.find(
        (w) => w.code === "stale-temporary-notes",
      );
      expect(staleWarning).toBeDefined();
      expect(staleWarning!.count).toBeGreaterThanOrEqual(1);
      expect(staleWarning!.suggestedAction).toContain("consolidate");

      const pruneWarning = parsed.maintenanceWarnings!.find(
        (w) => w.code === "superseded-prune-candidates",
      );
      expect(pruneWarning).toBeDefined();
      expect(pruneWarning!.count).toBeGreaterThanOrEqual(1);

      expect(dryRun.text).toContain("Maintenance:");
      expect(dryRun.text).toContain("stale temporary note");
    } finally {
      await embeddingServer.close();
    }
  }, 30000);

  it("detect-duplicates with evidence includes classification in text output", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Decision: Use PostgreSQL for storage",
          content:
            "We decided to use PostgreSQL as our primary database for all persistence needs.",
          tags: ["decisions", "architecture"],
          summary: "Create first decision",
          cwd: repoDir,
          scope: "project",
          lifecycle: "permanent",
          role: "decision",
        },
        embeddingServer.url,
      );

      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Decision: Use PostgreSQL for storage",
          content:
            "We decided to use PostgreSQL as our primary database for all persistence needs. Similar content to trigger duplicate detection.",
          tags: ["decisions", "architecture"],
          summary: "Create second decision (duplicate)",
          cwd: repoDir,
          scope: "project",
          lifecycle: "permanent",
          role: "decision",
        },
        embeddingServer.url,
      );

      const duplicates = await callLocalMcpResponse(
        vaultDir,
        "consolidate",
        {
          cwd: repoDir,
          strategy: "detect-duplicates",
          evidence: true,
        },
        embeddingServer.url,
      );

      const parsed = ConsolidateResultSchema.parse(duplicates.structuredContent);

      if (parsed.duplicatePairs && parsed.duplicatePairs.length > 0) {
        expect(duplicates.text).toContain("duplicate-pressure");
      }
    } finally {
      await embeddingServer.close();
    }
  }, 30000);

  it("dry-run on well-maintained vault has no maintenance warnings", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Fresh design decision",
          content: "A recent well-maintained decision with no staleness.",
          tags: ["decisions"],
          summary: "Create fresh decision",
          cwd: repoDir,
          scope: "project",
          lifecycle: "permanent",
          role: "decision",
          alwaysLoad: true,
        },
        embeddingServer.url,
      );

      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Fresh summary",
          content: "A recent summary of project status.",
          tags: ["summary"],
          summary: "Create fresh summary",
          cwd: repoDir,
          scope: "project",
          lifecycle: "permanent",
          role: "summary",
        },
        embeddingServer.url,
      );

      const dryRun = await callLocalMcpResponse(
        vaultDir,
        "consolidate",
        {
          cwd: repoDir,
          strategy: "dry-run",
        },
        embeddingServer.url,
      );

      const parsed = ConsolidateResultSchema.parse(dryRun.structuredContent);

      expect(parsed.maintenanceWarnings).toBeUndefined();

      expect(dryRun.text).not.toContain("Maintenance:");
    } finally {
      await embeddingServer.close();
    }
  }, 30000);
});
