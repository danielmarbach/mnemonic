import { describe, expect, it } from "vitest";
import { mkdtemp, stat, readFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  initTestVaultRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

import { writeFile } from "fs/promises";

describe("memory-lifecycle", () => {
  it("supports global remember and forget with git disabled", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Integration dogfood note",
        content: "Temporary integration-test note created through the local MCP script.",
        tags: ["integration", "dogfood"],
        summary: "Create integration dogfood note with git disabled",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);

      await expect(stat(notePath)).resolves.toBeDefined();
      await expect(readFile(notePath, "utf-8")).resolves.toContain("Integration dogfood note");

      const forgetText = await callLocalMcp(vaultDir, "forget", { id: noteId }, embeddingServer.url);
      expect(forgetText).toContain(`Forgotten '${noteId}'`);
      await expect(stat(notePath)).rejects.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("returns structured persistence details for remember without extra verification calls", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const response = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Persistence status remember test",
        content: "Verify remember returns persistence metadata.",
        tags: ["integration"],
        scope: "global",
        summary: "Create note and inspect persistence result",
      }, embeddingServer.url);

      const noteId = extractRememberedId(response.text);
      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("remembered");
      const persistence = structured?.["persistence"] as Record<string, unknown>;
      expect(persistence?.["notePath"]).toBe(path.join(vaultDir, "notes", `${noteId}.md`));
      expect(persistence?.["embeddingPath"]).toBe(path.join(vaultDir, "embeddings", `${noteId}.json`));
      expect((persistence?.["embedding"] as Record<string, unknown>)?.["status"]).toBe("written");
      const git = persistence?.["git"] as Record<string, unknown>;
      expect(git?.["commit"]).toBe("skipped");
      expect(git?.["push"]).toBe("skipped");
      expect(git?.["commitMessage"]).toBe("remember: Persistence status remember test");
      expect(String(git?.["commitBody"] ?? "")).toContain("Create note and inspect persistence result");
      expect(persistence?.["durability"]).toBe("local-only");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("reports embedding skip reasons in structured persistence when Ollama is unavailable", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const response = await callLocalMcpResponse(vaultDir, "remember", {
      title: "Persistence status embedding failure",
      content: "This note should survive even if embedding fails.",
      tags: ["integration"],
      scope: "global",
      summary: "Create note with embedding failure",
    }, { ollamaUrl: "http://127.0.0.1:9" });

    const structured = response.structuredContent;
    expect(structured?.["action"]).toBe("remembered");
    const persistence = structured?.["persistence"] as Record<string, unknown>;
    const embedding = persistence?.["embedding"] as Record<string, unknown>;
    expect(embedding?.["status"]).toBe("skipped");
    expect(String(embedding?.["reason"] ?? "")).not.toBe("");
    expect(persistence?.["durability"]).toBe("local-only");
  }, 15000);

  it("returns deterministic retry metadata when git.add fails after remember mutation", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await execFileAsync("git", ["init"], { cwd: vaultDir });
      await writeFile(path.join(vaultDir, ".git", "index.lock"), "locked\n", "utf-8");

      const response = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Retry contract remember test",
        content: "This should write the note even if commit fails.",
        tags: ["integration", "retry"],
        scope: "global",
        summary: "Capture deterministic retry metadata after commit failure",
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const noteId = extractRememberedId(response.text);
      await expect(stat(path.join(vaultDir, "notes", `${noteId}.md`))).resolves.toBeDefined();

      const persistence = response.structuredContent?.["persistence"] as Record<string, unknown>;
      const git = persistence?.["git"] as Record<string, unknown>;
      expect(git?.["commit"]).toBe("failed");
      expect(git?.["commitOperation"]).toBe("add");
      expect(git?.["push"]).toBe("skipped");
      expect(String(git?.["commitError"] ?? "")).toContain("index.lock");
      expect(response.text).toContain("Recovery: manual exact git recovery allowed");
      expect(response.text).toContain("Use only the exact values below.");
      expect(response.text).toContain("Commit subject:");
      expect(response.text).toContain("remember: Retry contract remember test");
      expect(response.text).toContain("Git failure:");
      expect(response.text).not.toContain("Retry: safe");

      const retry = persistence?.["retry"] as Record<string, unknown>;
      expect(retry?.["mutationApplied"]).toBe(true);
      expect(retry?.["retrySafe"]).toBe(true);
      const recovery = retry?.["recovery"] as Record<string, unknown>;
      expect(recovery?.["kind"]).toBe("manual-exact-git-recovery");
      expect(recovery?.["allowed"]).toBe(true);
      const attemptedCommit = retry?.["attemptedCommit"] as Record<string, unknown>;
      expect(attemptedCommit?.["subject"]).toBe("remember: Retry contract remember test");
      expect(attemptedCommit?.["vault"]).toBe("main-vault");
      expect(attemptedCommit?.["operation"]).toBe("add");
      expect((attemptedCommit?.["files"] as string[])).toHaveLength(1);
      expect(String(attemptedCommit?.["error"] ?? "")).toContain("index.lock");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("returns retry metadata when policy commit fails after config mutation", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["init"], { cwd: vaultDir });
    await writeFile(path.join(vaultDir, ".git", "index.lock"), "locked\n", "utf-8");

    const response = await callLocalMcpResponse(vaultDir, "set_project_memory_policy", {
      cwd: repoDir,
      defaultScope: "global",
    }, { disableGit: false });

    expect(response.text).toContain("defaultScope=global");
    expect(response.text).toContain("Recovery: manual exact git recovery allowed");
    const retry = response.structuredContent?.["retry"] as Record<string, unknown>;
    expect(retry?.["mutationApplied"]).toBe(true);
    const attempted = retry?.["attemptedCommit"] as Record<string, unknown>;
    expect(attempted?.["subject"]).toContain("policy:");
    expect(attempted?.["vault"]).toBe("main-vault");
    expect(String(attempted?.["error"] ?? "")).toContain("index.lock");
  }, 15000);

  it("surfaces retry guidance in text when relate commit fails", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      await initTestVaultRepo(vaultDir);

      const first = await callLocalMcp(vaultDir, "remember", {
        title: "Relate retry first",
        content: "First note for relate retry test.",
        tags: ["integration", "retry"],
        scope: "global",
        summary: "Create first note for relate retry test",
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const second = await callLocalMcp(vaultDir, "remember", {
        title: "Relate retry second",
        content: "Second note for relate retry test.",
        tags: ["integration", "retry"],
        scope: "global",
        summary: "Create second note for relate retry test",
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      const firstId = extractRememberedId(first);
      const secondId = extractRememberedId(second);

      await writeFile(path.join(vaultDir, ".git", "index.lock"), "locked\n", "utf-8");

      const response = await callLocalMcpResponse(vaultDir, "relate", {
        fromId: firstId,
        toId: secondId,
      }, { ollamaUrl: embeddingServer.url, disableGit: false });

      expect(response.text).toContain(`Linked \`${firstId}\` ↔ \`${secondId}\` (related-to)`);
      expect(response.text).toContain("Recovery: rerun same tool call serially");
      expect(response.text).toContain("Do not replay same-vault mutations in parallel.");
      expect(response.text).not.toContain("Recovery: manual exact git recovery allowed");

      const retry = response.structuredContent?.["retry"] as Record<string, unknown>;
      expect(retry?.["mutationApplied"]).toBe(true);
      expect(retry?.["retrySafe"]).toBe(true);
      const recovery = retry?.["recovery"] as Record<string, unknown>;
      expect(recovery?.["kind"]).toBe("rerun-tool-call-serial");
      expect(recovery?.["allowed"]).toBe(true);
      const attempted = retry?.["attemptedCommit"] as Record<string, unknown>;
      expect(attempted?.["subject"]).toContain("relate:");
      expect(attempted?.["vault"]).toBe("main-vault");
      expect(String(attempted?.["error"] ?? "")).toContain("index.lock");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("updates an existing memory through the MCP and persists the edited content", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Initial integration note",
        content: "Original content for update flow.",
        tags: ["integration", "original"],
        summary: "Create note for MCP update test",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const updateText = await callLocalMcp(vaultDir, "update", {
        id: noteId,
        title: "Updated integration note",
        content: "Updated content for update flow.",
        tags: ["integration", "updated"],
        summary: "Verify MCP update persists content changes",
      }, embeddingServer.url);

      expect(updateText).toContain(`Updated memory '${noteId}'`);

      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const embeddingPath = path.join(vaultDir, "embeddings", `${noteId}.json`);
      const noteContents = await readFile(notePath, "utf-8");

      expect(noteContents).toContain("title: Updated integration note");
      expect(noteContents).toContain("Updated content for update flow.");
      expect(noteContents).toContain("- integration");
      expect(noteContents).toContain("- updated");
      await expect(stat(embeddingPath)).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("preserves lifecycle on update unless explicitly changed", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Temporary integration lifecycle note",
        content: "Initial temporary plan note.",
        tags: ["integration", "plan"],
        lifecycle: "temporary",
        summary: "Create temporary note for lifecycle update test",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);

      let noteContents = await readFile(notePath, "utf-8");
      expect(noteContents).toContain("lifecycle: temporary");

      await callLocalMcp(vaultDir, "update", {
        id: noteId,
        content: "Still temporary after a regular update.",
        summary: "Verify lifecycle is preserved when omitted",
      }, embeddingServer.url);

      noteContents = await readFile(notePath, "utf-8");
      expect(noteContents).toContain("lifecycle: temporary");

      await callLocalMcp(vaultDir, "update", {
        id: noteId,
        lifecycle: "permanent",
        summary: "Promote lifecycle to permanent explicitly",
      }, embeddingServer.url);

      noteContents = await readFile(notePath, "utf-8");
      expect(noteContents).toContain("lifecycle: permanent");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("persists alwaysLoad to note frontmatter via remember and update", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      // Test remember with alwaysLoad: true
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "AlwaysLoad remember test",
        content: "Note created with alwaysLoad true.",
        tags: ["integration", "alwaysLoad"],
        alwaysLoad: true,
        summary: "Create note with alwaysLoad via remember",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);

      let noteContents = await readFile(notePath, "utf-8");
      expect(noteContents).toContain("alwaysLoad: true");

      // Test update with alwaysLoad: false
      await callLocalMcp(vaultDir, "update", {
        id: noteId,
        content: "Note updated with alwaysLoad false.",
        alwaysLoad: false,
        summary: "Update note to set alwaysLoad false",
      }, embeddingServer.url);

      noteContents = await readFile(notePath, "utf-8");
      expect(noteContents).toContain("alwaysLoad: false");

      // Test update without alwaysLoad preserves existing value
      await callLocalMcp(vaultDir, "update", {
        id: noteId,
        content: "Note updated without changing alwaysLoad.",
        summary: "Update note without alwaysLoad param",
      }, embeddingServer.url);

      noteContents = await readFile(notePath, "utf-8");
      expect(noteContents).toContain("alwaysLoad: false");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("cleans related notes when forgetting a linked memory", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "First linked note",
        content: "First note in relation test.",
        tags: ["integration"],
        summary: "Create first note for relate and forget test",
        scope: "global",
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Second linked note",
        content: "Second note in relation test.",
        tags: ["integration"],
        summary: "Create second note for relate and forget test",
        scope: "global",
      }, embeddingServer.url);

      const firstId = extractRememberedId(firstRemember);
      const secondId = extractRememberedId(secondRemember);

      const relateText = await callLocalMcp(vaultDir, "relate", {
        fromId: firstId,
        toId: secondId,
        type: "related-to",
      }, embeddingServer.url);
      expect(relateText).toContain(`Linked \`${firstId}\` ↔ \`${secondId}\` (related-to)`);

      const beforeForget = await readFile(path.join(vaultDir, "notes", `${secondId}.md`), "utf-8");
      expect(beforeForget).toContain(firstId);

      const forgetText = await callLocalMcp(vaultDir, "forget", { id: firstId }, embeddingServer.url);
      expect(forgetText).toContain(`Forgotten '${firstId}'`);

      await expect(stat(path.join(vaultDir, "notes", `${firstId}.md`))).rejects.toThrow();
      const survivor = await readFile(path.join(vaultDir, "notes", `${secondId}.md`), "utf-8");
      expect(survivor).not.toContain(firstId);
      expect(survivor).toContain("Second linked note");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("removes bidirectional cross-vault relationships via unrelate", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const mainRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Cross vault main note",
        content: "Stored privately in main but tied to the current project.",
        tags: ["integration", "relations"],
        summary: "Create main-vault note for unrelate test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const mainId = extractRememberedId(mainRemember);

      const projectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Cross vault project note",
        content: "Stored in the project vault and linked to the main-vault note.",
        tags: ["integration", "relations"],
        summary: "Create project-vault note for unrelate test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const projectId = extractRememberedId(projectRemember);

      const relateText = await callLocalMcp(vaultDir, "relate", {
        fromId: mainId,
        toId: projectId,
        type: "related-to",
        bidirectional: true,
        cwd: repoDir,
      }, embeddingServer.url);
      expect(relateText).toContain(`Linked \`${mainId}\` ↔ \`${projectId}\``);

      const unrelated = await callLocalMcpResponse(vaultDir, "unrelate", {
        fromId: mainId,
        toId: projectId,
        bidirectional: true,
        cwd: repoDir,
      }, embeddingServer.url);

      expect(unrelated.text).toContain(`Removed relationship between \`${mainId}\` and \`${projectId}\``);
      const modified = unrelated.structuredContent?.["notesModified"] as string[];
      expect(modified.sort()).toEqual([mainId, projectId].sort());

      const mainContents = await readFile(path.join(vaultDir, "notes", `${mainId}.md`), "utf-8");
      const projectContents = await readFile(path.join(repoDir, ".mnemonic", "notes", `${projectId}.md`), "utf-8");
      expect(mainContents).not.toContain(projectId);
      expect(projectContents).not.toContain(mainId);
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("deletes temporary source notes and creates a permanent target on consolidation", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Temporary plan A",
        content: "Temporary implementation plan A.",
        tags: ["integration", "plan"],
        lifecycle: "temporary",
        summary: "Create first temporary plan note",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Temporary plan B",
        content: "Temporary implementation plan B.",
        tags: ["integration", "plan"],
        lifecycle: "temporary",
        summary: "Create second temporary plan note",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);

      const firstId = extractRememberedId(firstRemember);
      const secondId = extractRememberedId(secondRemember);

      const consolidateText = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [firstId, secondId],
          targetTitle: "Consolidated implementation plan",
        },
        allowProtectedBranch: true,
      }, embeddingServer.url);

      expect(consolidateText).toContain("Mode: delete");
      expect(consolidateText).toContain("Source notes deleted.");

      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${firstId}.md`))).rejects.toThrow();
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${secondId}.md`))).rejects.toThrow();

      const consolidatedIdMatch = consolidateText.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(consolidatedIdMatch).toBeTruthy();
      const consolidatedId = consolidatedIdMatch![1]!;
      const consolidatedPath = path.join(repoDir, ".mnemonic", "notes", `${consolidatedId}.md`);
      const consolidatedContents = await readFile(consolidatedPath, "utf-8");
      expect(consolidatedContents).toContain("lifecycle: permanent");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("uses custom content body when mergePlan.content is provided", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Source A",
        content: "Content A.",
        tags: ["integration", "custom-merge"],
        summary: "Create source A",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Source B",
        content: "Content B.",
        tags: ["integration", "custom-merge"],
        summary: "Create source B",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);

      const firstId = extractRememberedId(firstRemember);
      const secondId = extractRememberedId(secondRemember);

      const consolidateText = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [firstId, secondId],
          targetTitle: "Custom consolidated note",
          content: "This is custom consolidated content.",
        },
        allowProtectedBranch: true,
      }, embeddingServer.url);

      const consolidatedIdMatch = consolidateText.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(consolidatedIdMatch).toBeTruthy();
      const consolidatedId = consolidatedIdMatch![1]!;

      const consolidatedPath = path.join(repoDir, ".mnemonic", "notes", `${consolidatedId}.md`);
      const consolidatedContents = await readFile(consolidatedPath, "utf-8");
      expect(consolidatedContents).toContain("This is custom consolidated content.");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("reuses an existing execute-merge target on retry instead of creating a duplicate", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Idempotent source A",
        content: "Content A.",
        tags: ["integration", "idempotent"],
        summary: "Create idempotent source A",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Idempotent source B",
        content: "Content B.",
        tags: ["integration", "idempotent"],
        summary: "Create idempotent source B",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);

      const firstId = extractRememberedId(firstRemember);
      const secondId = extractRememberedId(secondRemember);

      const firstMerge = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [firstId, secondId],
          targetTitle: "Merge target",
          content: "Merged content.",
        },
        allowProtectedBranch: true,
      }, embeddingServer.url);

      expect(firstMerge).toContain("Consolidated 2 notes");
      expect(firstMerge).toContain("Mode: supersedes");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("applies project memory policy end-to-end for remember routing", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const setGlobal = await callLocalMcpResponse(vaultDir, "set_project_memory_policy", {
        cwd: repoDir,
        defaultScope: "global",
      }, embeddingServer.url);
      expect(setGlobal.text).toContain("defaultScope=global");

      const getGlobal = await callLocalMcpResponse(vaultDir, "get_project_memory_policy", { cwd: repoDir }, embeddingServer.url);
      expect(getGlobal.text).toContain("defaultScope=global");
      expect(getGlobal.structuredContent?.["defaultScope"]).toBe("global");

      const rememberedGlobal = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Policy global default note",
        content: "Should land in the main vault while keeping project association.",
        tags: ["integration", "policy"],
        summary: "Use global policy default for remember routing",
        cwd: repoDir,
      }, embeddingServer.url);

      const globalId = extractRememberedId(rememberedGlobal.text);
      expect(rememberedGlobal.structuredContent?.["scope"]).toBe("global");
      expect(rememberedGlobal.structuredContent?.["vault"]).toBe("main-vault");
      await expect(stat(path.join(vaultDir, "notes", `${globalId}.md`))).resolves.toBeDefined();

      const setProject = await callLocalMcpResponse(vaultDir, "set_project_memory_policy", {
        cwd: repoDir,
        defaultScope: "project",
      }, embeddingServer.url);
      expect(setProject.text).toContain("defaultScope=project");

      const rememberedProject = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Policy project default note",
        content: "Should land in the project vault when scope is omitted.",
        tags: ["integration", "policy"],
        summary: "Use project policy default for remember routing",
        cwd: repoDir,
      }, embeddingServer.url);

      const projectId = extractRememberedId(rememberedProject.text);
      expect(rememberedProject.structuredContent?.["scope"]).toBe("project");
      expect(rememberedProject.structuredContent?.["vault"]).toBe("project-vault");
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${projectId}.md`))).resolves.toBeDefined();

      const setAsk = await callLocalMcpResponse(vaultDir, "set_project_memory_policy", {
        cwd: repoDir,
        defaultScope: "ask",
      }, embeddingServer.url);
      expect(setAsk.text).toContain("defaultScope=ask");

      const askRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Policy ask note",
        content: "Should not be written until scope is explicit.",
        tags: ["integration", "policy"],
        summary: "Require explicit scope when policy is ask",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(askRemember).toContain("always ask");
      expect(askRemember).toContain("scope: \"project\"");
      expect(askRemember).toContain("scope: \"global\"");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("applies protected branch policy for project-vault remember writes", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
    await execFileAsync("git", ["checkout", "-B", "main"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const explicitScopeBlocked = await callLocalMcp(vaultDir, "remember", {
        title: "Protected branch explicit scope blocked note",
        content: "Explicit project scope should still respect protected-branch policy.",
        tags: ["integration", "protected-branch"],
        summary: "Block explicit project scope remember on protected branch",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);

      expect(explicitScopeBlocked).toContain("Protected branch check");
      expect(explicitScopeBlocked).toContain("allowProtectedBranch: true");

      const bootstrapRemember = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch bootstrap note",
        content: "Bootstraps project vault adoption with explicit scope.",
        tags: ["integration", "protected-branch"],
        summary: "Bootstrap project vault for protected branch policy test",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      const bootstrapId = extractRememberedId(bootstrapRemember.text);
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${bootstrapId}.md`))).resolves.toBeDefined();

      const protectedAsk = await callLocalMcp(vaultDir, "remember", {
        title: "Protected branch ask note",
        content: "Should prompt for branch policy before writing.",
        tags: ["integration", "protected-branch"],
        summary: "Prompt for protected branch commit behavior",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(protectedAsk).toContain("Protected branch check");
      expect(protectedAsk).toContain("allowProtectedBranch: true");
      expect(protectedAsk).toContain("protectedBranchBehavior");

      const setAllow = await callLocalMcpResponse(vaultDir, "set_project_memory_policy", {
        cwd: repoDir,
        protectedBranchBehavior: "allow",
      }, embeddingServer.url);
      expect(setAllow.text).toContain("protectedBranchBehavior=allow");
      expect(setAllow.structuredContent?.["protectedBranchBehavior"]).toBe("allow");

      const allowedRemember = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch allowed note",
        content: "Should write and commit on protected branch after allow policy.",
        tags: ["integration", "protected-branch"],
        summary: "Allow protected branch remember commits for this project",
        cwd: repoDir,
      }, embeddingServer.url);

      const allowedId = extractRememberedId(allowedRemember.text);
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${allowedId}.md`))).resolves.toBeDefined();

      const setBlock = await callLocalMcpResponse(vaultDir, "set_project_memory_policy", {
        cwd: repoDir,
        protectedBranchBehavior: "block",
      }, embeddingServer.url);
      expect(setBlock.text).toContain("protectedBranchBehavior=block");

      const protectedBlock = await callLocalMcp(vaultDir, "remember", {
        title: "Protected branch blocked note",
        content: "Should be blocked when policy says block.",
        tags: ["integration", "protected-branch"],
        summary: "Block protected branch remember commits for this project",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(protectedBlock).toContain("Auto-commit blocked");

      const overrideRemember = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch override note",
        content: "One-time override should bypass block policy.",
        tags: ["integration", "protected-branch"],
        summary: "Use one-time protected branch override for remember",
        cwd: repoDir,
        allowProtectedBranch: true,
      }, embeddingServer.url);

      const overrideId = extractRememberedId(overrideRemember.text);
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${overrideId}.md`))).resolves.toBeDefined();

      const protectedUpdateAsk = await callLocalMcp(vaultDir, "update", {
        id: overrideId,
        content: "Update should ask for protected-branch override.",
        cwd: repoDir,
      }, embeddingServer.url);
      expect(protectedUpdateAsk).toContain("Auto-commit blocked");
      expect(protectedUpdateAsk).toContain("`update`");

      const protectedUpdateOverride = await callLocalMcp(vaultDir, "update", {
        id: overrideId,
        content: "Update with one-time override should proceed.",
        cwd: repoDir,
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(protectedUpdateOverride).toContain(`Updated memory '${overrideId}'`);

      const projectForgetRemember = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch forget note",
        content: "Used to verify protected branch checks for forget.",
        tags: ["integration", "protected-branch"],
        summary: "Create note for protected branch forget test",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      const forgetId = extractRememberedId(projectForgetRemember.text);

      const protectedForgetAsk = await callLocalMcp(vaultDir, "forget", {
        id: forgetId,
        cwd: repoDir,
      }, embeddingServer.url);
      expect(protectedForgetAsk).toContain("Auto-commit blocked");
      expect(protectedForgetAsk).toContain("`forget`");

      const protectedForgetOverride = await callLocalMcp(vaultDir, "forget", {
        id: forgetId,
        cwd: repoDir,
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(protectedForgetOverride).toContain(`Forgotten '${forgetId}'`);

      const moveRemember = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch move source",
        content: "Created as global note for move protected-branch test.",
        tags: ["integration", "protected-branch"],
        summary: "Create global note for protected branch move test",
        scope: "global",
      }, embeddingServer.url);
      const moveId = extractRememberedId(moveRemember.text);

      const protectedMoveAsk = await callLocalMcp(vaultDir, "move_memory", {
        id: moveId,
        target: "project-vault",
        cwd: repoDir,
      }, embeddingServer.url);
      expect(protectedMoveAsk).toContain("Auto-commit blocked");
      expect(protectedMoveAsk).toContain("`move_memory`");

      const protectedMoveOverride = await callLocalMcp(vaultDir, "move_memory", {
        id: moveId,
        target: "project-vault",
        cwd: repoDir,
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(protectedMoveOverride).toContain(`Moved '${moveId}'`);

      const consolidateA = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch consolidate A",
        content: "First note for consolidate policy coverage.",
        tags: ["integration", "protected-branch", "consolidate"],
        summary: "Create first consolidate source note",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      const consolidateAId = extractRememberedId(consolidateA.text);

      const consolidateB = await callLocalMcpResponse(vaultDir, "remember", {
        title: "Protected branch consolidate B",
        content: "Second note for consolidate policy coverage.",
        tags: ["integration", "protected-branch", "consolidate"],
        summary: "Create second consolidate source note",
        cwd: repoDir,
        scope: "project",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      const consolidateBId = extractRememberedId(consolidateB.text);

      const protectedConsolidateAsk = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [consolidateAId, consolidateBId],
          targetTitle: "Protected branch consolidate target",
        },
      }, embeddingServer.url);
      expect(protectedConsolidateAsk).toContain("Auto-commit blocked");
      expect(protectedConsolidateAsk).toContain("`consolidate`");

      const protectedConsolidateOverride = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [consolidateAId, consolidateBId],
          targetTitle: "Protected branch consolidate target",
        },
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(protectedConsolidateOverride).toContain("Consolidated 2 notes");

      const protectedPruneAsk = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "prune-superseded",
        mode: "delete",
      }, embeddingServer.url);
      expect(protectedPruneAsk).toContain("Auto-commit blocked");
      expect(protectedPruneAsk).toContain("`consolidate`");

      const protectedPruneOverride = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "prune-superseded",
        mode: "delete",
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(protectedPruneOverride).toContain("Pruned");
    } finally {
      await embeddingServer.close();
    }
  }, 35000);
});
