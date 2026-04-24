import { describe, expect, it } from "vitest";
import { mkdtemp, stat, readFile } from "fs/promises";
import os from "os";
import path from "path";

import {
  builtEntryPoint,
  callLocalMcp,
  callLocalMcpResponse,
  execFileAsync,
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

describe("vault-routing", () => {
  it("supports overriding project identity to use upstream", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);
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
    await initTestRepo(repoDir);
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

    await initTestRepo(repoDir);

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
        allowProtectedBranch: true,
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

    await initTestRepo(repoDir);

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
        allowProtectedBranch: true,
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

  it("keeps note visibility coherent when moving a note from main to project and back", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await initTestRepo(repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Round trip move test",
        content: "Start in the main vault and move through both storage locations.",
        tags: ["integration", "move"],
        summary: "Create note for move round-trip visibility test",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const moveToProject = await callLocalMcpResponse(vaultDir, "move_memory", {
        id: noteId,
        target: "project-vault",
        cwd: repoDir,
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(moveToProject.text).toContain("Project association is now");

      const moveBackToMain = await callLocalMcpResponse(vaultDir, "move_memory", {
        id: noteId,
        target: "main-vault",
        cwd: repoDir,
        allowProtectedBranch: true,
      }, embeddingServer.url);
      expect(moveBackToMain.text).toContain("Project association remains");

      await expect(stat(path.join(vaultDir, "notes", `${noteId}.md`))).resolves.toBeDefined();
      await expect(stat(path.join(repoDir, ".mnemonic", "notes", `${noteId}.md`))).rejects.toThrow();

      const listed = await callLocalMcpResponse(vaultDir, "list", {
        cwd: repoDir,
        scope: "project",
        storedIn: "main-vault",
        includeStorage: true,
        includeUpdated: true,
      }, embeddingServer.url);

      expect(listed.text).toContain("Round trip move test");
      expect(listed.text).toContain("stored: main-vault");
      expect(listed.structuredContent?.["count"]).toBe(1);
      const notes = listed.structuredContent?.["notes"] as Array<Record<string, unknown>>;
      expect(notes[0]?.["id"]).toBe(noteId);
      expect(notes[0]?.["vault"]).toBe("main-vault");
      expect(notes[0]?.["project"]).toBeTruthy();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("does not create a project vault when updating a main-vault note with cwd pointing to unadopted project", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Main vault note",
        content: "Created in main vault without project association.",
        tags: ["integration"],
        summary: "Create main vault note for unadopted project update test",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const updateText = await callLocalMcp(vaultDir, "update", {
        id: noteId,
        content: "Updated content while cwd points to unadopted project.",
        summary: "Update main vault note with unadopted cwd",
        cwd: repoDir,
      }, embeddingServer.url);

      expect(updateText).toContain(`Updated memory '${noteId}'`);

      await expect(stat(path.join(repoDir, ".mnemonic"))).rejects.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("does not create a project vault when consolidating main-vault notes with cwd pointing to unadopted project", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Global note A",
        content: "First global note for consolidation.",
        tags: ["global-merge"],
        lifecycle: "temporary",
        summary: "Create first global note",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Global note B",
        content: "Second global note for consolidation.",
        tags: ["global-merge"],
        lifecycle: "temporary",
        summary: "Create second global note",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);

      const firstId = extractRememberedId(firstRemember);
      const secondId = extractRememberedId(secondRemember);

      await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mergePlan: {
          sourceIds: [firstId, secondId],
          targetTitle: "Merged global note",
        },
      }, embeddingServer.url);

      await expect(stat(path.join(repoDir, ".mnemonic"))).rejects.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});
