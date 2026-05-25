import { describe, expect, it, beforeAll } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  createPersistentMcpSession,
  ensureBuiltEntryPointReady,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

async function setupWritableAttachedVaultFixture() {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-writable-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-writable-repo-"));
  const bareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-writable-bare-"));
  const attachedDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-writable-attached-"));

  tempDirs.push(vaultDir, repoDir, bareDir, attachedDir);

  await initTestVaultRepo(vaultDir);
  await initTestRepo(repoDir);

  await execFileAsync("git", ["init", "--bare", "-b", "main"], { cwd: bareDir });
  await execFileAsync("git", ["init", "-b", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: attachedDir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: attachedDir });

  const notesDir = path.join(attachedDir, ".mnemonic", "notes");
  await mkdir(notesDir, { recursive: true });

  const noteContent = `---
title: Writable attached note
tags: [integration, writable-attachment]
lifecycle: permanent
createdAt: "2025-01-01T00:00:00.000Z"
updatedAt: "2025-01-01T00:00:00.000Z"
---
Content from writable attached vault.`;
  await writeFile(path.join(notesDir, "attached-note.md"), noteContent, "utf-8");

  await execFileAsync("git", ["add", ".mnemonic/"], { cwd: attachedDir });
  await execFileAsync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test User", "commit", "-m", "chore: add mnemonic notes"], { cwd: attachedDir });
  await execFileAsync("git", ["remote", "add", "origin", bareDir], { cwd: attachedDir });
  await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: attachedDir });
  await execFileAsync("git", ["remote", "set-head", "origin", "--auto"], { cwd: attachedDir });

  return { vaultDir, repoDir, attachedDir };
}

describe("writable attached vault mutations", () => {
  beforeAll(async () => {
    await ensureBuiltEntryPointReady();
  }, 120000);

  it("relate across writable attached vault succeeds", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupWritableAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, { ollamaUrl: embeddingServer.url, disableGit: false });

    try {
      await session.callTool("add_attachment", {
        cwd: repoDir,
        localPath: attachedDir,
        writable: true,
        pushBranch: "main",
      });

      const writableResult = await session.callTool("remember", {
        title: "Consuming note for relate success test",
        content: "This note is in the consuming repo and should relate to the attached note.",
        tags: ["integration", "writable-attachment"],
        summary: "Create consuming note for relate success test",
        scope: "project",
        cwd: repoDir,
      });

      const consumingId = extractRememberedId(writableResult.text);

      const relateResult = await session.callTool("relate", {
        fromId: consumingId,
        toId: "attached-note",
        type: "explains",
        cwd: repoDir,
      });

      expect(relateResult.text).toContain("Linked");

      // Verify relationship appears in consuming note
      const getResult = await session.callTool("get", {
        ids: [consumingId],
        cwd: repoDir,
        includeRelationships: true,
      });

      expect(getResult.text).toContain("attached-note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("unrelate across writable attached vault succeeds", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupWritableAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, { ollamaUrl: embeddingServer.url, disableGit: false });

    try {
      await session.callTool("add_attachment", {
        cwd: repoDir,
        localPath: attachedDir,
        writable: true,
        pushBranch: "main",
      });

      const writableResult = await session.callTool("remember", {
        title: "Consuming note for unrelate success test",
        content: "This note is in the consuming repo and should unrelate from the attached note.",
        tags: ["integration", "writable-attachment"],
        summary: "Create consuming note for unrelate success test",
        scope: "project",
        cwd: repoDir,
      });

      const consumingId = extractRememberedId(writableResult.text);

      // First relate
      await session.callTool("relate", {
        fromId: consumingId,
        toId: "attached-note",
        type: "explains",
        cwd: repoDir,
      });

      // Then unrelate
      const unrelateResult = await session.callTool("unrelate", {
        fromId: consumingId,
        toId: "attached-note",
        cwd: repoDir,
      });

      expect(unrelateResult.text).toContain("Removed relationship");

      // Verify relationship is gone
      const getResult = await session.callTool("get", {
        ids: [consumingId],
        cwd: repoDir,
      });

      expect(getResult.text).not.toContain("attached-note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("forget on writable attached vault deletes the note", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupWritableAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, { ollamaUrl: embeddingServer.url, disableGit: false });

    try {
      await session.callTool("add_attachment", {
        cwd: repoDir,
        localPath: attachedDir,
        writable: true,
        pushBranch: "main",
      });

      const forgetResult = await session.callTool("forget", {
        id: "attached-note",
        cwd: repoDir,
      });

      expect(forgetResult.text).toContain("Forgotten");
      expect(forgetResult.text).toContain("attached-note");

      // Verify note is no longer found
      const getResult = await session.callTool("get", {
        ids: ["attached-note"],
        cwd: repoDir,
      });

      expect(getResult.text).toContain("Not found");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("update on writable attached vault modifies the note", async () => {
    const { vaultDir, repoDir, attachedDir } = await setupWritableAttachedVaultFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, { ollamaUrl: embeddingServer.url, disableGit: false });

    try {
      await session.callTool("add_attachment", {
        cwd: repoDir,
        localPath: attachedDir,
        writable: true,
        pushBranch: "main",
      });

      const updateResult = await session.callTool("update", {
        id: "attached-note",
        content: "# Updated attached note\n\nThis content was written through a writable attached vault.",
        cwd: repoDir,
      });

      expect(updateResult.text).toContain("Updated");

      // Verify note content changed
      const getResult = await session.callTool("get", {
        ids: ["attached-note"],
        cwd: repoDir,
      });

      expect(getResult.text).toContain("Updated attached note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);
});
