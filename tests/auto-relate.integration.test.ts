import { afterAll, describe, expect, it } from "vitest";
import os from "os";
import path from "path";
import { mkdtemp } from "fs/promises";

import {
  createPersistentMcpSession,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

afterAll(async () => {
  // Cleanup via tempDirs in mcp helpers
});

describe("auto relationships from session context", () => {
  it("relates a new memory to a recently inspected durable note it explicitly mentions", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-auto-relate-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-auto-relate-project-"));
    tempDirs.push(vaultDir, repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);
      await initTestRepo(repoDir);

      const session = await createPersistentMcpSession(vaultDir, { ollamaUrl: embeddingServer.url, disableGit: true });
      try {
        const architectureId = extractRememberedId((await session.callTool("remember", {
          title: "Architecture anchor",
          content: "Canonical architecture guidance for the project.",
          tags: ["architecture", "design"],
          lifecycle: "permanent",
          scope: "project",
          cwd: repoDir,
          summary: "Create architecture anchor",
        })).text);

        await session.callTool("get", {
          ids: [architectureId],
          cwd: repoDir,
          includeRelationships: true,
        });

        const resultId = extractRememberedId((await session.callTool("remember", {
          title: "Investigation results",
          content: "Follow-up on Architecture anchor. This result validates the earlier design and captures what changed.",
          tags: ["investigation", "results"],
          lifecycle: "permanent",
          scope: "project",
          cwd: repoDir,
          summary: "Capture investigation results",
        })).text);

        const result = await session.callTool("get", {
          ids: [resultId],
          cwd: repoDir,
          includeRelationships: false,
        });

        const notes = (result.structuredContent?.notes ?? []) as Array<{ relatedTo?: Array<{ id: string; type: string }> }>;
        const relatedTo = notes[0]?.relatedTo ?? [];
        expect(relatedTo).toContainEqual({ id: architectureId, type: "related-to" });
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("preserves inspected context across unrelated mutations in the same session", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-auto-relate-preserve-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-auto-relate-preserve-project-"));
    tempDirs.push(vaultDir, repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);
      await initTestRepo(repoDir);

      const session = await createPersistentMcpSession(vaultDir, { ollamaUrl: embeddingServer.url, disableGit: true });
      try {
        const architectureId = extractRememberedId((await session.callTool("remember", {
          title: "Architecture anchor",
          content: "Canonical architecture guidance for the project.",
          tags: ["architecture", "design"],
          lifecycle: "permanent",
          scope: "project",
          cwd: repoDir,
          summary: "Create architecture anchor",
        })).text);

        await session.callTool("get", {
          ids: [architectureId],
          cwd: repoDir,
          includeRelationships: true,
        });

        await session.callTool("remember", {
          title: "Temporary checkpoint",
          content: "Short-lived working state.",
          tags: ["checkpoint"],
          lifecycle: "temporary",
          scope: "project",
          cwd: repoDir,
          summary: "Create temporary checkpoint",
        });

        const resultId = extractRememberedId((await session.callTool("remember", {
          title: "Investigation results after checkpoint",
          content: "Follow-up on Architecture anchor. This result still builds on the earlier design.",
          tags: ["investigation", "results"],
          lifecycle: "permanent",
          scope: "project",
          cwd: repoDir,
          summary: "Capture investigation results after checkpoint",
        })).text);

        const result = await session.callTool("get", {
          ids: [resultId],
          cwd: repoDir,
          includeRelationships: false,
        });

        const notes = (result.structuredContent?.notes ?? []) as Array<{ relatedTo?: Array<{ id: string; type: string }> }>;
        const relatedTo = notes[0]?.relatedTo ?? [];
        expect(relatedTo).toContainEqual({ id: architectureId, type: "related-to" });
      } finally {
        await session.close();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 20000);
});
