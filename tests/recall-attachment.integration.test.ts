import { beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { ATTACHMENT_BOOST, PROJECT_SCOPE_BOOST } from "../src/tools/recall-helpers.js";
import {
  createPersistentMcpSession,
  initTestRepo,
  initTestVaultRepo,
  execFileAsync,
  startFakeEmbeddingServer,
  tempDirs,
  ensureBuiltEntryPointReady,
} from "./helpers/mcp.js";

describe("Attachment boost constants", () => {
  it("ATTACHMENT_BOOST is half of PROJECT_SCOPE_BOOST", () => {
    expect(ATTACHMENT_BOOST).toBe(PROJECT_SCOPE_BOOST / 2);
    expect(ATTACHMENT_BOOST).toBe(0.0025);
  });
});

async function createAttachmentFixture() {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-att-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-att-repo-"));
  const bareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-att-bare-"));
  const attachedDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-att-ext-"));
  const projectBareDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-att-proj-bare-"));

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

describe("recall attachment integration", () => {
  beforeAll(async () => {
    await ensureBuiltEntryPointReady();
  }, 120000);

  it("attached vault notes receive ATTACHMENT_BOOST scoring, between project-local and global", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("recall", {
        cwd: repoDir,
        query: "attached vault",
        scope: "project",
      });

      expect(result.text).toContain("Attached vault note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("scope project includes attached vault notes even when note.project differs", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("recall", {
        cwd: repoDir,
        query: "attached vault",
        scope: "project",
      });

      expect(result.text).toContain("attached-note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("scope global excludes attached vault notes", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("list", { cwd: repoDir, scope: "global" });

      expect(result.text).not.toContain("attached-note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("storedIn attached in list returns only attached vault notes", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("list", {
        cwd: repoDir,
        scope: "project",
        storedIn: "attached",
      });

      expect(result.text).toContain("attached-note");
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);
});

describe("attached vault output rendering", () => {
  beforeAll(async () => {
    await ensureBuiltEntryPointReady();
  }, 120000);

  it("list with includeStorage renders attached: prefix for attached vault notes", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("list", {
        cwd: repoDir,
        scope: "project",
        storedIn: "attached",
        includeStorage: true,
      });

      expect(result.text).toMatch(/attached:/);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("project_memory_summary counts attached vault notes", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("project_memory_summary", { cwd: repoDir });

      expect(result.text).toMatch(/attached:\s*[1-9]/);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);

  it("recall structured output contains attached: vault label", async () => {
    const { vaultDir, repoDir, attachedDir } = await createAttachmentFixture();
    const embeddingServer = await startFakeEmbeddingServer();
    const session = await createPersistentMcpSession(vaultDir, {
      ollamaUrl: embeddingServer.url,
      disableGit: false,
    });

    try {
      await session.callTool("add_attachment", { cwd: repoDir, localPath: attachedDir });

      const result = await session.callTool("recall", {
        cwd: repoDir,
        query: "attached vault",
        scope: "project",
      });

      expect(result.structuredContent).toBeDefined();
      const results = (result.structuredContent as Record<string, unknown>)?.results as Array<
        Record<string, unknown>
      >;
      expect(results).toBeDefined();
      const attachedResult = results?.find((r) => String(r.id).includes("attached-note"));
      expect(attachedResult).toBeDefined();
      expect(String(attachedResult?.vault)).toMatch(/^attached:/);
    } finally {
      await session.close();
      await embeddingServer.close();
    }
  }, 60000);
});
