import { describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import {
  builtEntryPoint,
  callLocalMcp,
  callLocalMcpResponse,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

describe("mutation errors on attached vault notes", () => {
  it.skip("update on attached note returns specific error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-repo-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-remote-"));
    tempDirs.push(vaultDir, repoDir, remoteDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await initTestRepo(repoDir);
    await initTestVaultRepo(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Attached vault note for update error test",
        content: "This note lives in an attached vault and should reject update attempts.",
        tags: ["integration", "mutation-error"],
        summary: "Create attached vault note for update error test",
        scope: "project",
        cwd: repoDir,
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const response = await callLocalMcpResponse(vaultDir, "update", {
        id: noteId,
        content: "Attempted update on attached vault note.",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  });

  it.skip("forget on attached note returns specific error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-repo-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-remote-"));
    tempDirs.push(vaultDir, repoDir, remoteDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await initTestRepo(repoDir);
    await initTestVaultRepo(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Attached vault note for forget error test",
        content: "This note lives in an attached vault and should reject forget attempts.",
        tags: ["integration", "mutation-error"],
        summary: "Create attached vault note for forget error test",
        scope: "project",
        cwd: repoDir,
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const response = await callLocalMcpResponse(vaultDir, "forget", {
        id: noteId,
        cwd: repoDir,
      }, embeddingServer.url);

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  });

  it.skip("move_memory from attached vault returns specific error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-repo-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-remote-"));
    tempDirs.push(vaultDir, repoDir, remoteDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await initTestRepo(repoDir);
    await initTestVaultRepo(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Attached vault note for move error test",
        content: "This note lives in an attached vault and should reject move attempts.",
        tags: ["integration", "mutation-error"],
        summary: "Create attached vault note for move error test",
        scope: "project",
        cwd: repoDir,
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const response = await callLocalMcpResponse(vaultDir, "move_memory", {
        id: noteId,
        target: "main-vault",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be moved");
    } finally {
      await embeddingServer.close();
    }
  });

  it.skip("relate with attached note returns specific error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-repo-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-remote-"));
    tempDirs.push(vaultDir, repoDir, remoteDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await initTestRepo(repoDir);
    await initTestVaultRepo(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Attached vault note A for relate error test",
        content: "This note lives in an attached vault and should reject relate attempts.",
        tags: ["integration", "mutation-error"],
        summary: "Create attached vault note A for relate error test",
        scope: "project",
        cwd: repoDir,
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Writable note B for relate error test",
        content: "This note is in a writable vault to serve as the relate target.",
        tags: ["integration", "mutation-error"],
        summary: "Create writable note B for relate error test",
        scope: "global",
      }, embeddingServer.url);

      const attachedId = extractRememberedId(firstRemember);
      const writableId = extractRememberedId(secondRemember);

      const response = await callLocalMcpResponse(vaultDir, "relate", {
        fromId: attachedId,
        toId: writableId,
        cwd: repoDir,
      }, embeddingServer.url);

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  });

  it.skip("unrelate with attached note returns specific error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-repo-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-remote-"));
    tempDirs.push(vaultDir, repoDir, remoteDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await initTestRepo(repoDir);
    await initTestVaultRepo(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Attached vault note A for unrelate error test",
        content: "This note lives in an attached vault and should reject unrelate attempts.",
        tags: ["integration", "mutation-error"],
        summary: "Create attached vault note A for unrelate error test",
        scope: "project",
        cwd: repoDir,
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Writable note B for unrelate error test",
        content: "This note is in a writable vault to serve as the unrelate target.",
        tags: ["integration", "mutation-error"],
        summary: "Create writable note B for unrelate error test",
        scope: "global",
      }, embeddingServer.url);

      const attachedId = extractRememberedId(firstRemember);
      const writableId = extractRememberedId(secondRemember);

      const response = await callLocalMcpResponse(vaultDir, "unrelate", {
        fromId: attachedId,
        toId: writableId,
        cwd: repoDir,
      }, embeddingServer.url);

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  });

  it.skip("consolidate with attached note returns specific error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-repo-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mutation-error-remote-"));
    tempDirs.push(vaultDir, repoDir, remoteDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await initTestRepo(repoDir);
    await initTestVaultRepo(vaultDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Attached vault note for consolidate error test",
        content: "This note lives in an attached vault and should reject consolidate attempts.",
        tags: ["integration", "mutation-error"],
        summary: "Create attached vault note for consolidate error test",
        scope: "project",
        cwd: repoDir,
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Writable note for consolidate error test",
        content: "This note is in a writable vault to serve as a consolidation source.",
        tags: ["integration", "mutation-error"],
        summary: "Create writable note for consolidate error test",
        scope: "global",
      }, embeddingServer.url);

      const attachedId = extractRememberedId(firstRemember);
      const writableId = extractRememberedId(secondRemember);

      const response = await callLocalMcpResponse(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [attachedId, writableId],
          targetTitle: "Attempted consolidation with attached vault note",
        },
      }, embeddingServer.url);

      expect(response.text).toContain("attached vault");
      expect(response.text).toContain("cannot be modified");
    } finally {
      await embeddingServer.close();
    }
  });
});