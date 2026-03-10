import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);
const builtEntryPoint = path.join(repoRoot, "build", "index.js");

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

beforeAll(async () => {
  await execFileAsync("npm", ["run", "build"], { cwd: repoRoot });
}, 120000);

describe("local MCP script", () => {
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

  it("supports overriding project identity to use upstream", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:user/myapp-fork.git"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "add", "upstream", "git@github.com:acme/myapp.git"], { cwd: repoDir });

    const before = await callLocalMcp(vaultDir, "get_project_identity", { cwd: repoDir });
    expect(before).toContain("`github-com-user-myapp-fork`");
    expect(before).toContain("**remote:** origin");

    const setResult = await callLocalMcp(vaultDir, "set_project_identity", {
      cwd: repoDir,
      remoteName: "upstream",
    });
    expect(setResult).toContain("default=`github-com-user-myapp-fork`");
    expect(setResult).toContain("effective=`github-com-acme-myapp`");

    const after = await callLocalMcp(vaultDir, "get_project_identity", { cwd: repoDir });
    expect(after).toContain("`github-com-acme-myapp`");
    expect(after).toContain("**remote:** upstream");
    expect(after).toContain("**default id:** `github-com-user-myapp-fork`");
  }, 15000);

  it("skips auto-push for project-vault mutations by default", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-remote-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, remoteDir, repoDir);

    await execFileAsync("git", ["init", "--bare"], { cwd: remoteDir });
    await execFileAsync("git", ["init"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const response = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Project mutation push mode test",
          content: "Project-vault writes should commit locally without pushing unpublished branches by default.",
          tags: ["integration"],
          summary: "Avoid auto-push for unpublished project branches",
          cwd: repoDir,
          scope: "project",
        },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(response.text).toContain("Persistence: embedding written | git committed");
      const structured = response.structuredContent as Record<string, unknown>;
      const persistence = structured?.["persistence"] as Record<string, unknown>;
      const git = persistence?.["git"] as Record<string, unknown>;
      expect(persistence?.["durability"]).toBe("committed");
      expect(git?.["push"]).toBe("skipped");
      expect(git?.["pushReason"]).toBe("auto-push-disabled");

      const noteId = structured?.["id"] as string;
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${noteId}.md`))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("rewrites project metadata when moving a global note into a project vault", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Unscoped move test",
        content: "Created without project context so it starts as a global note.",
        tags: ["integration"],
        summary: "Create unscoped note for move metadata rewrite test",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const moveText = await callLocalMcp(vaultDir, "move_memory", {
        id: noteId,
        target: "project-vault",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(moveText).toContain("Project association is now");
      expect(moveText).toContain("(");

      const movedNote = await readFile(path.join(repoDir, ".mnemonic", "notes", `${noteId}.md`), "utf-8");
      expect(movedNote).toContain("projectName:");
      expect(movedNote).toContain("project:");
      expect(movedNote).toContain("mnemonic-mcp-project-");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("preserves project association when moving a project note into the main vault", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Project move out test",
        content: "Created with project context so it should remain project-associated when moved to the main vault.",
        tags: ["integration"],
        summary: "Create project note for move-out behavior test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const moveText = await callLocalMcp(vaultDir, "move_memory", {
        id: noteId,
        target: "main-vault",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(moveText).toContain("Project association remains");
      expect(moveText).toContain("(");

      const movedNote = await readFile(path.join(vaultDir, "notes", `${noteId}.md`), "utf-8");
      expect(movedNote).toContain("projectName:");
      expect(movedNote).toContain("project:");
      expect(movedNote).toContain("mnemonic-mcp-project-");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

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

  it("deletes temporary source notes and creates a permanent target on consolidation", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

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

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const planRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Implementation plan",
        content: "Plan: do X, Y, Z.",
        tags: ["plan"],
        lifecycle: "temporary",
        summary: "Create temporary plan note",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const outcomeRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Implementation outcome",
        content: "Outcome: X, Y, Z done. Changed A and B.",
        tags: ["outcome"],
        lifecycle: "temporary",
        summary: "Create temporary outcome note",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);

      const planId = extractRememberedId(planRemember);
      const outcomeId = extractRememberedId(outcomeRemember);

      const distilledContent = "Implemented persistence-status reporting. Changed A and B. Pattern: return structured status from all mutating tools.";
      const consolidateText = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [planId, outcomeId],
          targetTitle: "Persistence status reporting",
          content: distilledContent,
        },
      }, embeddingServer.url);

      expect(consolidateText).toContain("Mode: delete");

      const consolidatedIdMatch = consolidateText.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(consolidatedIdMatch).toBeTruthy();
      const consolidatedId = consolidatedIdMatch![1]!;
      const consolidatedPath = path.join(repoDir, ".mnemonic", "notes", `${consolidatedId}.md`);
      const consolidatedContents = await readFile(consolidatedPath, "utf-8");

      expect(consolidatedContents).toContain(distilledContent);
      expect(consolidatedContents).not.toContain("## Consolidated from:");
      expect(consolidatedContents).not.toContain("Plan: do X, Y, Z.");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("reports sync status cleanly when git syncing is disabled", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Sync no remote note",
        content: "Created in main vault with embedding unavailable so sync can backfill it.",
        scope: "global",
        summary: "Seed main-vault note without embedding for sync test",
      }, { ollamaUrl: "http://127.0.0.1:9" });

      const noteId = extractRememberedId(rememberText);
      await expect(stat(path.join(vaultDir, "embeddings", `${noteId}.json`))).rejects.toThrow();

      const syncText = await callLocalMcp(vaultDir, "sync", { cwd: repoDir }, embeddingServer.url);

      expect(syncText).toContain("main vault: no remote configured — git sync skipped.");
      expect(syncText).toContain("main vault: embedded 1 note(s) (including any missing local embeddings).");
      expect(syncText).toContain("project vault: no .mnemonic/ found — skipped.");
      await expect(stat(path.join(vaultDir, "embeddings", `${noteId}.json`))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("backfills missing project embeddings during sync on a fresh clone", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const remoteDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-remote-"));
    const sourceDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-source-"));
    const cloneDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-clone-"));
    tempDirs.push(vaultDir, remoteDir, sourceDir, cloneDir);

    await execFileAsync("git", ["init", "--bare", remoteDir]);
    await execFileAsync("git", ["init", "-b", "main"], { cwd: sourceDir });
    await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd: sourceDir });

    await mkdir(path.join(sourceDir, ".mnemonic", "notes"), { recursive: true });
    await writeFile(path.join(sourceDir, ".mnemonic", ".gitignore"), "embeddings/\n", "utf-8");
    await writeFile(
      path.join(sourceDir, ".mnemonic", "notes", "fresh-clone-note.md"),
      `---\ntitle: Fresh clone note\ntags: []\nlifecycle: permanent\ncreatedAt: 2026-03-09T00:00:00.000Z\nupdatedAt: 2026-03-09T00:00:00.000Z\nmemoryVersion: 1\n---\n\nThis note should be embedded during sync on a fresh machine.`,
      "utf-8",
    );

    await execFileAsync("git", ["add", "."], { cwd: sourceDir });
    await execFileAsync(
      "git",
      ["-c", "user.name=Test User", "-c", "user.email=test@example.com", "commit", "-m", "seed project mnemonic notes"],
      { cwd: sourceDir },
    );
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: sourceDir });

    await execFileAsync("git", ["clone", "--branch", "main", remoteDir, cloneDir]);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const beforeEmbedding = path.join(cloneDir, ".mnemonic", "embeddings", "fresh-clone-note.json");
      await expect(stat(beforeEmbedding)).rejects.toThrow();

      const syncText = await callLocalMcp(
        vaultDir,
        "sync",
        { cwd: cloneDir },
        { ollamaUrl: embeddingServer.url, disableGit: false },
      );

      expect(syncText).toContain("project vault: ↓ no new notes from remote.");
      expect(syncText).toContain("project vault: embedded 1 note(s) (including any missing local embeddings).");
      await expect(stat(beforeEmbedding)).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("fetches full note content via get by exact id", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Get tool test note",
        content: "Content only accessible via get.",
        tags: ["get-test"],
        scope: "global",
        summary: "Seed note for get tool test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const response = await callLocalMcpResponse(vaultDir, "get", {
        ids: [noteId],
      }, embeddingServer.url);

      expect(response.text).toContain("Get tool test note");
      expect(response.text).toContain("Content only accessible via get.");

      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("got");
      expect(structured?.["count"]).toBe(1);
      const notes = structured?.["notes"] as Array<Record<string, unknown>>;
      expect(notes).toHaveLength(1);
      expect(notes[0]?.["id"]).toBe(noteId);
      expect(notes[0]?.["title"]).toBe("Get tool test note");
      expect(notes[0]?.["content"]).toContain("Content only accessible via get.");
      expect(notes[0]?.["vault"]).toBe("main-vault");
      expect(structured?.["notFound"]).toEqual([]);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("reports not found ids from get", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const response = await callLocalMcpResponse(vaultDir, "get", {
      ids: ["nonexistent-id-abc123"],
    });

    const structured = response.structuredContent;
    expect(structured?.["action"]).toBe("got");
    expect(structured?.["count"]).toBe(0);
    expect(structured?.["notFound"]).toEqual(["nonexistent-id-abc123"]);
  }, 15000);

  it("locates a memory via where_is_memory", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Where is memory test",
        content: "A note to locate.",
        scope: "global",
        summary: "Seed note for where_is_memory test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const response = await callLocalMcpResponse(vaultDir, "where_is_memory", {
        id: noteId,
      }, embeddingServer.url);

      expect(response.text).toContain("Where is memory test");
      expect(response.text).toContain("main-vault");

      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("located");
      expect(structured?.["id"]).toBe(noteId);
      expect(structured?.["title"]).toBe("Where is memory test");
      expect(structured?.["vault"]).toBe("main-vault");
      expect(structured?.["relatedCount"]).toBe(0);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("rebuilds all embeddings during sync when force=true", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Sync force rebuild note",
        content: "This note will have its embedding rebuilt by sync force mode.",
        scope: "global",
        summary: "Seed note for sync force rebuild test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const embeddingPath = path.join(vaultDir, "embeddings", `${noteId}.json`);
      const before = await readFile(embeddingPath, "utf-8");

      const response = await callLocalMcpResponse(vaultDir, "sync", { force: true }, embeddingServer.url);

      expect(response.text).toContain("main vault: no remote configured — git sync skipped.");
      expect(response.text).toContain("main vault: embedded 1 note(s) (force rebuild).");
      const structured = response.structuredContent;
      expect(structured?.["action"]).toBe("synced");
      const vaults = structured?.["vaults"] as Array<Record<string, unknown>>;
      expect(vaults).toHaveLength(1);
      expect(vaults[0]?.["vault"]).toBe("main");
      expect(vaults[0]?.["embedded"]).toBe(1);
      expect(vaults[0]?.["failed"]).toEqual([]);
      await expect(stat(embeddingPath)).resolves.toBeDefined();
      const after = await readFile(embeddingPath, "utf-8");
      expect(after).not.toBe("");
      expect(before).not.toBe("");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});

async function callLocalMcp(
  vaultDir: string,
  toolName: string,
  arguments_: Record<string, unknown>,
  options?: string | { ollamaUrl?: string; disableGit?: boolean },
): Promise<string> {
  const response = await callLocalMcpResponse(vaultDir, toolName, arguments_, options);
  return response.text;
}

async function callLocalMcpResponse(
  vaultDir: string,
  toolName: string,
  arguments_: Record<string, unknown>,
  options?: string | { ollamaUrl?: string; disableGit?: boolean },
): Promise<{ text: string; structuredContent?: Record<string, unknown> }> {
  const resolvedOptions = typeof options === "string" ? { ollamaUrl: options } : options;
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
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: arguments_,
      },
    },
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("node", [builtEntryPoint], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DISABLE_GIT: resolvedOptions?.disableGit === false ? "false" : "true",
        VAULT_PATH: vaultDir,
        ...(resolvedOptions?.ollamaUrl ? { OLLAMA_URL: resolvedOptions.ollamaUrl } : {}),
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
        reject(new Error(`MCP script exited with ${code}: ${stderrData}`));
        return;
      }
      resolve(stdoutData);
    });

    child.stdin.end(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
  });

  const lines = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
    id?: number;
    result?: { content?: Array<{ text?: string }>; structuredContent?: Record<string, unknown> };
  });
  const response = lines.find((line) => line.id === 1);
  const text = response?.result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`Missing tool response for ${toolName}`);
  }

  return { text, structuredContent: response?.result?.structuredContent };
}

function extractRememberedId(text: string): string {
  const match = text.match(/`([^`]+)`/);
  if (!match) {
    throw new Error(`Could not parse remembered id from: ${text}`);
  }

  return match[1];
}

async function startFakeEmbeddingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine fake embedding server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}
