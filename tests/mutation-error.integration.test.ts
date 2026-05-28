import { describe, expect, it, beforeAll } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  createPersistentMcpSession,
  ensureBuiltEntryPointReady,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

async function setupAttachedVaultFixture() {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-repo-"));
  const bareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-bare-"));
  const attachedDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-attached-"));
  const projectBareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-proj-bare-"));

  tempDirs.push(vaultDir, repoDir, bareDir, attachedDir, projectBareDir);

  await initTestVaultRepo(vaultDir);
  await initTestRepo(repoDir);

  await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: projectBareDir });
  await execFileAsync("git", ["remote", "add", "origin", projectBareDir], { cwd: repoDir });

  await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: bareDir });
  await execFileAsync("git", ["init", "-b", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: attachedDir });

  const notesDir = path.join(attachedDir, ".mnemonic", "notes");
  await mkdir(notesDir, { recursive: true });

  const noteContent = `---
title: Attached vault note
tags: [integration, mutation-error]
lifecycle: permanent
createdAt: "2025-01-01T00:00:00.000Z"
updatedAt: "2025-01-01T00:00:00.000Z"
---
Content from the attached vault.`;
  await writeFile(path.join(notesDir, "attached-note.md"), noteContent, "utf-8");

  await execFileAsync("git", ["add", ".mnemonic/"], { cwd: attachedDir });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test User",
      "commit",
      "-m",
      "chore: add mnemonic notes",
    ],
    { cwd: attachedDir },
  );
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: attachedDir });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["remote", "set-head", "origin", "--auto"], { cwd: attachedDir });

  return { vaultDir, repoDir, attachedDir };
}

describe("mutation errors on attached vault notes", () => {
  beforeAll(async () => {
    await ensureBuiltEntryPointReady();
  }, 120000);

  it("update on attached note returns specific error", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(
        vaultDir,
        "add_attachment",
        {
          cwd: repoDir,
          localPath: attachedDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      const response = await callLocalMcpResponse(
        vaultDir,
        "update",
        {
          id: "attached-note",
          content: "Attempted update on attached vault note.",
          cwd: repoDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  }, 60000);

  it("forget on attached note returns specific error", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcp(
        vaultDir,
        "add_attachment",
        {
          cwd: repoDir,
          localPath: attachedDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      const response = await callLocalMcpResponse(
        vaultDir,
        "forget",
        {
          id: "attached-note",
          cwd: repoDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  }, 60000);

  it("move_memory from attached vault returns specific error", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const response = await session.callTool("move_memory", {
        id: "attached-note",
        target: "main-vault",
        cwd: repoDir,
      });

      expect(response.text).toMatch(/attached vault|cannot be moved|No memory found/i);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("relate with attached note returns specific error", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const writableResult = await session.callTool("remember", {
        title: "Writable note for relate error test",
        content: "This note is in a writable vault to serve as the relate target.",
        tags: ["integration", "mutation-error"],
        summary: "Create writable note for relate error test",
        scope: "global",
      });

      const writableId = extractRememberedId(writableResult.text);

      const response = await session.callTool("relate", {
        fromId: "attached-note",
        toId: writableId,
        cwd: repoDir,
      });

      expect(response.text).toMatch(/attached vault|cannot be modified|No memory found/i);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("unrelate with attached note returns specific error", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const writableResult = await session.callTool("remember", {
        title: "Writable note for unrelate error test",
        content: "This note is in a writable vault to serve as the unrelate target.",
        tags: ["integration", "mutation-error"],
        summary: "Create writable note for unrelate error test",
        scope: "global",
      });

      const writableId = extractRememberedId(writableResult.text);

      const response = await session.callTool("unrelate", {
        fromId: "attached-note",
        toId: writableId,
        cwd: repoDir,
      });

      expect(response.text).toMatch(/attached vault|cannot be modified|no relationship/i);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("consolidate with attached note returns specific error", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const writableResult = await session.callTool("remember", {
        title: "Writable note for consolidate error test",
        content: "This note is in a writable vault to serve as a consolidation source.",
        tags: ["integration", "mutation-error"],
        summary: "Create writable note for consolidate error test",
        scope: "global",
      });

      const writableId = extractRememberedId(writableResult.text);

      const response = await session.callTool("consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: ["attached-note", writableId],
          targetTitle: "Attempted consolidation with attached vault note",
        },
      });

      expect(response.text).toMatch(/attached vault|cannot be modified|no memories/i);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);
});
