import { describe, expect, it, beforeAll } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  createPersistentMcpSession,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
  ensureBuiltEntryPointReady,
} from "./helpers/mcp.js";

async function createAttachmentFixture() {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-repo-"));
  const bareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-bare-"));
  const attachedDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-ext-"));
  const projectBareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-proj-bare-"));

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
tags: [integration, attached]
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

  return { vaultDir, repoDir, bareDir, attachedDir };
}

describe("attached vault integration", () => {
  beforeAll(async () => {
    await ensureBuiltEntryPointReady();
  }, 120000);

  describe("add_attachment", () => {
    it("registers an attached vault with auto-detected branch", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
      const embeddingServer = await startFakeEmbeddingServer();

      try {
        const result = await callLocalMcpResponse(
          vaultDir,
          "add_attachment",
          {
            cwd: repoDir,
            localPath: attachedDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(result.text).toContain("Attachment added");
      } finally {
        await embeddingServer.close();
      }
    }, 60000);

    it("registers an attached vault with explicit branch", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
      const embeddingServer = await startFakeEmbeddingServer();

      try {
        const result = await callLocalMcpResponse(
          vaultDir,
          "add_attachment",
          {
            cwd: repoDir,
            localPath: attachedDir,
            branch: "main",
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(result.text).toContain("Attachment added");
      } finally {
        await embeddingServer.close();
      }
    }, 60000);

    it("rejects a path with no notes directory", async () => {
      const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-vault-"));
      const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-repo-"));
      const badDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-att-bad-"));
      tempDirs.push(vaultDir, repoDir, badDir);

      await initTestVaultRepo(vaultDir);
      await initTestRepo(repoDir);

      const embeddingServer = await startFakeEmbeddingServer();
      try {
        const result = await callLocalMcpResponse(
          vaultDir,
          "add_attachment",
          {
            cwd: repoDir,
            localPath: badDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(result.text).toMatch(/Cannot attach|notes directory/i);
      } finally {
        await embeddingServer.close();
      }
    }, 60000);

    it("supports tilde expansion in localPath", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
      const homeRelativePath = attachedDir.replace(process.env.HOME || "", "~");
      const embeddingServer = await startFakeEmbeddingServer();

      try {
        const result = await callLocalMcpResponse(
          vaultDir,
          "add_attachment",
          {
            cwd: repoDir,
            localPath: homeRelativePath,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(result.text).toContain("Attachment added");
      } finally {
        await embeddingServer.close();
      }
    }, 60000);
  });

  describe("list_attachments", () => {
    it("shows attached vault with status and branch", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
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

        const result = await callLocalMcpResponse(
          vaultDir,
          "list_attachments",
          {
            cwd: repoDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(result.text).toContain("active");
        expect(result.text).toContain("main");
      } finally {
        await embeddingServer.close();
      }
    }, 60000);
  });

  describe("remove_attachment", () => {
    it("removes an attached vault", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
      const embeddingServer = await startFakeEmbeddingServer();

      try {
        const addResult = await callLocalMcpResponse(
          vaultDir,
          "add_attachment",
          {
            cwd: repoDir,
            localPath: attachedDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        const structuredContent = addResult.structuredContent as any;
        const slug = structuredContent?.attachment?.projectSlug;
        expect(slug).toBeDefined();

        const removeResult = await callLocalMcpResponse(
          vaultDir,
          "remove_attachment",
          {
            cwd: repoDir,
            projectSlug: slug,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(removeResult.text).toContain("Attachment removed");
      } finally {
        await embeddingServer.close();
      }
    }, 60000);
  });

  describe("set_attachment_enabled", () => {
    it("toggles attachment enabled status", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
      const embeddingServer = await startFakeEmbeddingServer();

      try {
        const addResult = await callLocalMcpResponse(
          vaultDir,
          "add_attachment",
          {
            cwd: repoDir,
            localPath: attachedDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        const structuredContent = addResult.structuredContent as any;
        const slug = structuredContent?.attachment?.projectSlug;

        const disableResult = await callLocalMcpResponse(
          vaultDir,
          "set_attachment_enabled",
          {
            cwd: repoDir,
            projectSlug: slug,
            enabled: false,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(disableResult.text).toContain("disabled");
      } finally {
        await embeddingServer.close();
      }
    }, 60000);
  });

  describe("mutation guards", () => {
    it("update on attached note returns read-only error", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
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

        const updateResult = await callLocalMcpResponse(
          vaultDir,
          "update",
          {
            id: "attached-note",
            content: "Attempted update.",
            cwd: repoDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(updateResult.text).toMatch(/attached vault|cannot be modified|read-only|not found/i);
      } finally {
        await embeddingServer.close();
      }
    }, 60000);

    it("forget on attached note returns read-only error", async () => {
      const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
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

        const forgetResult = await callLocalMcpResponse(
          vaultDir,
          "forget",
          {
            id: "attached-note",
            cwd: repoDir,
          },
          { ollamaUrl: embeddingServer.url, disableGit: false },
        );

        expect(forgetResult.text).toMatch(/attached vault|cannot be modified|read-only|not found/i);
      } finally {
        await embeddingServer.close();
      }
    }, 60000);
  });
});
