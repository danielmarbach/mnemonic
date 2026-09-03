import { describe, expect, it } from "vitest";
import { mkdtemp, readdir, stat } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcpResponse,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

/**
 * Guard behavior when an explicitly passed `scope` contradicts the project's
 * saved write-scope policy (the kimi/NServiceBus incident): the write must be
 * blocked with actionable guidance unless the caller acknowledges the
 * deviation with `scopePolicyOverride`.
 */
describe("scope policy guard (legacy client)", () => {
  it("blocks the write when explicit scope contradicts the saved policy", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcpResponse(
        vaultDir,
        "set_project_memory_policy",
        { cwd: repoDir, defaultScope: "global" },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      const response = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Guard conflict note",
          content: "Must not be stored while the conflict is unresolved.",
          tags: ["integration", "guard"],
          summary: "Guard conflict test",
          cwd: repoDir,
          scope: "project",
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(response.text).toContain("contradicts the saved project memory policy");
      expect(response.text).toContain('defaultScope="global"');
      expect(response.text).toContain("The note was NOT stored");
      expect(response.text).toContain("scopePolicyOverride");

      // Nothing landed in either vault.
      await expect(readdir(path.join(repoDir, ".mnemonic", "notes"))).rejects.toThrow();
      await expect(readdir(path.join(vaultDir, "notes"))).resolves.toEqual([]);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("stores with scopePolicyOverride and records the override", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcpResponse(
        vaultDir,
        "set_project_memory_policy",
        { cwd: repoDir, defaultScope: "global" },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      const response = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Guard override note",
          content: "Stored in the project vault because the user asked for it.",
          tags: ["integration", "guard"],
          summary: "Guard override test",
          cwd: repoDir,
          scope: "project",
          scopePolicyOverride: true,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(response.text).toContain("stored=project");
      expect(response.text).toContain("[policy=global→project, override]");
      expect(response.structuredContent?.["policyScope"]).toBe("global");

      const noteId = extractRememberedId(response.text);
      await expect(
        stat(path.join(repoDir, ".mnemonic", "notes", `${noteId}.md`)),
      ).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("follows the saved policy when scope is omitted and records it", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await callLocalMcpResponse(
        vaultDir,
        "set_project_memory_policy",
        { cwd: repoDir, defaultScope: "global" },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      const response = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Guard policy-follow note",
          content: "Stored in the main vault following the saved policy.",
          tags: ["integration", "guard"],
          summary: "Guard policy-follow test",
          cwd: repoDir,
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(response.text).toContain("stored=global");
      expect(response.text).toContain("[policy=global]");

      const noteId = extractRememberedId(response.text);
      await expect(stat(path.join(vaultDir, "notes", `${noteId}.md`))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("accepts remember's scope vocabulary on move_memory", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-guard-repo-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestVaultRepo(vaultDir);
    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberResponse = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Alias move source note",
          content: "Stored in the project vault, then moved with the scope alias.",
          tags: ["integration", "guard"],
          summary: "Alias move test",
          cwd: repoDir,
          scope: "project",
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );
      expect(rememberResponse.text).toContain("stored=project");
      const noteId = extractRememberedId(rememberResponse.text);

      const moveResponse = await callLocalMcpResponse(
        vaultDir,
        "move_memory",
        { id: noteId, scope: "global", cwd: repoDir },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(moveResponse.text).toContain("Moved");
      expect(moveResponse.text).toContain("main-vault");
      await expect(stat(path.join(vaultDir, "notes", `${noteId}.md`))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
