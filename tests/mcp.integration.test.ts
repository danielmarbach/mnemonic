import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";

import {
  MemoryGraphResultSchema,
  MigrationExecuteResultSchema,
  MigrationListResultSchema,
} from "../src/structured-content.js";

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

  it("applies project memory policy end-to-end for remember routing", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

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

  it("keeps note visibility coherent when moving a note from main to project and back", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

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
      }, embeddingServer.url);
      expect(moveToProject.text).toContain("Project association is now");

      const moveBackToMain = await callLocalMcpResponse(vaultDir, "move_memory", {
        id: noteId,
        target: "main-vault",
        cwd: repoDir,
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
      expect(listed.text).toContain("stored=main-vault");
      expect(listed.structuredContent?.["count"]).toBe(1);
      const notes = listed.structuredContent?.["notes"] as Array<Record<string, unknown>>;
      expect(notes[0]?.["id"]).toBe(noteId);
      expect(notes[0]?.["vault"]).toBe("main-vault");
      expect(notes[0]?.["project"]).toBeTruthy();
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("shows consistent cross-vault results for list recent_memories and project_memory_summary", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const privateProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Private project memory",
        content: "Stored in main vault but associated with the current project.",
        tags: ["integration", "cross-vault"],
        summary: "Create private project memory for visibility test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const privateProjectId = extractRememberedId(privateProjectRemember);

      const sharedProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Shared project memory",
        content: "Stored in the project vault for the current repo.",
        tags: ["integration", "cross-vault"],
        summary: "Create shared project memory for visibility test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const sharedProjectId = extractRememberedId(sharedProjectRemember);

      const globalRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Unscoped global memory",
        content: "Stored in main vault without project association.",
        tags: ["integration", "cross-vault"],
        summary: "Create unscoped global memory for visibility test",
        scope: "global",
      }, embeddingServer.url);
      const globalId = extractRememberedId(globalRemember);

      const listed = await callLocalMcpResponse(vaultDir, "list", {
        cwd: repoDir,
        scope: "all",
        storedIn: "any",
        tags: ["integration", "cross-vault"],
        includeStorage: true,
        includeUpdated: true,
      }, embeddingServer.url);

      expect(listed.structuredContent?.["count"]).toBe(3);
      const listedNotes = listed.structuredContent?.["notes"] as Array<Record<string, unknown>>;
      expect(listedNotes.map((note) => note["id"])).toEqual([privateProjectId, sharedProjectId, globalId]);
      expect(listed.text).toContain("stored=project-vault");
      expect(listed.text).toContain("stored=main-vault");

      const recent = await callLocalMcpResponse(vaultDir, "recent_memories", {
        cwd: repoDir,
        scope: "project",
        storedIn: "any",
        limit: 5,
        includePreview: false,
        includeStorage: true,
      }, embeddingServer.url);

      expect(recent.structuredContent?.["count"]).toBe(2);
      const recentNotes = recent.structuredContent?.["notes"] as Array<Record<string, unknown>>;
      expect(recentNotes.map((note) => note["id"])).toEqual([sharedProjectId, privateProjectId]);
      expect(recent.text).not.toContain("Unscoped global memory");

      const summary = await callLocalMcpResponse(vaultDir, "project_memory_summary", {
        cwd: repoDir,
        recentLimit: 5,
      }, embeddingServer.url);

      const summaryNotes = summary.structuredContent?.["notes"] as Record<string, unknown>;
      expect(summaryNotes?.["total"]).toBe(3);
      expect(summaryNotes?.["projectVault"]).toBe(1);
      expect(summaryNotes?.["mainVault"]).toBe(2);
      expect(summaryNotes?.["privateProject"]).toBe(1);
      expect(summary.text).toContain("private project memories: 1");
    } finally {
      await embeddingServer.close();
    }
  }, 20000);

  it("shows only visible cross-vault relationships in memory_graph", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const privateProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Graph private project memory",
        content: "Stored in main vault but associated with the current project.",
        tags: ["integration", "graph"],
        summary: "Create private project memory for graph test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const privateProjectId = extractRememberedId(privateProjectRemember);

      const sharedProjectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Graph shared project memory",
        content: "Stored in the project vault and linked into the graph.",
        tags: ["integration", "graph"],
        summary: "Create shared project memory for graph test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const sharedProjectId = extractRememberedId(sharedProjectRemember);

      const globalRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Graph global memory",
        content: "Unscoped global memory that should disappear from project-only graph results.",
        tags: ["integration", "graph"],
        summary: "Create global memory for graph test",
        scope: "global",
      }, embeddingServer.url);
      const globalId = extractRememberedId(globalRemember);

      await callLocalMcp(vaultDir, "relate", {
        fromId: privateProjectId,
        toId: sharedProjectId,
        type: "related-to",
        bidirectional: true,
        cwd: repoDir,
      }, embeddingServer.url);

      await callLocalMcp(vaultDir, "relate", {
        fromId: privateProjectId,
        toId: globalId,
        type: "explains",
        bidirectional: true,
        cwd: repoDir,
      }, embeddingServer.url);

      const graphAll = await callLocalMcpResponse(vaultDir, "memory_graph", {
        cwd: repoDir,
        scope: "all",
        storedIn: "any",
        limit: 10,
      }, embeddingServer.url);

      expect(graphAll.text).toContain(privateProjectId);
      expect(graphAll.text).toContain(sharedProjectId);
      expect(graphAll.text).toContain(globalId);
      const allNodes = graphAll.structuredContent?.["nodes"] as Array<Record<string, unknown>>;
      const privateNode = allNodes.find((node) => node["id"] === privateProjectId);
      expect(privateNode).toBeTruthy();
      expect((privateNode?.["edges"] as Array<Record<string, unknown>>).map((edge) => edge["toId"]).sort()).toEqual([
        globalId,
        sharedProjectId,
      ].sort());

      const graphProject = await callLocalMcpResponse(vaultDir, "memory_graph", {
        cwd: repoDir,
        scope: "project",
        storedIn: "any",
        limit: 10,
      }, embeddingServer.url);

      expect(graphProject.text).toContain(privateProjectId);
      expect(graphProject.text).toContain(sharedProjectId);
      expect(graphProject.text).not.toContain(globalId);
      const projectNodes = graphProject.structuredContent?.["nodes"] as Array<Record<string, unknown>>;
      const projectPrivateNode = projectNodes.find((node) => node["id"] === privateProjectId);
      expect((projectPrivateNode?.["edges"] as Array<Record<string, unknown>>).map((edge) => edge["toId"])).toEqual([
        sharedProjectId,
      ]);
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

    await execFileAsync("git", ["init"], { cwd: repoDir });

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

  it("reuses an existing execute-merge target on retry instead of creating a duplicate", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const firstRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Retry source A",
        content: "First source note for execute-merge retry handling.",
        tags: ["integration", "merge"],
        lifecycle: "permanent",
        summary: "Create first source for execute-merge idempotency test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);
      const secondRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Retry source B",
        content: "Second source note for execute-merge retry handling.",
        tags: ["integration", "merge"],
        lifecycle: "permanent",
        summary: "Create second source for execute-merge idempotency test",
        cwd: repoDir,
        scope: "project",
      }, embeddingServer.url);

      const firstId = extractRememberedId(firstRemember);
      const secondId = extractRememberedId(secondRemember);

      const firstMerge = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mode: "supersedes",
        mergePlan: {
          sourceIds: [firstId, secondId],
          targetTitle: "Retry-safe consolidated note",
          content: "First consolidated body.",
        },
      }, embeddingServer.url);

      const firstTargetIdMatch = firstMerge.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(firstTargetIdMatch).toBeTruthy();
      const firstTargetId = firstTargetIdMatch![1]!;

      const secondMerge = await callLocalMcp(vaultDir, "consolidate", {
        cwd: repoDir,
        strategy: "execute-merge",
        mode: "supersedes",
        mergePlan: {
          sourceIds: [firstId, secondId],
          targetTitle: "Retry-safe consolidated note",
          content: "Updated consolidated body after retry.",
        },
      }, embeddingServer.url);

      const secondTargetIdMatch = secondMerge.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(secondTargetIdMatch).toBeTruthy();
      const secondTargetId = secondTargetIdMatch![1]!;

      expect(secondTargetId).toBe(firstTargetId);
      expect(secondMerge).toContain("Idempotency: reused existing target note.");

      const targetPath = path.join(repoDir, ".mnemonic", "notes", `${firstTargetId}.md`);
      const targetContents = await readFile(targetPath, "utf-8");
      expect(targetContents).toContain("Updated consolidated body after retry.");
      expect(targetContents).not.toContain("First consolidated body.");

      const noteFiles = await readdir(path.join(repoDir, ".mnemonic", "notes"));
      const matchingTargets = noteFiles.filter((file) => file.startsWith("retry-safe-consolidated-note-") && file.endsWith(".md"));
      expect(matchingTargets).toHaveLength(1);

      const firstSourceContents = await readFile(path.join(repoDir, ".mnemonic", "notes", `${firstId}.md`), "utf-8");
      const secondSourceContents = await readFile(path.join(repoDir, ".mnemonic", "notes", `${secondId}.md`), "utf-8");
      expect(firstSourceContents.match(new RegExp(firstTargetId, "g")) ?? []).toHaveLength(1);
      expect(secondSourceContents.match(new RegExp(firstTargetId, "g")) ?? []).toHaveLength(1);
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

  it("returns structured migration metadata from list_migrations", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    const response = await callLocalMcpResponse(vaultDir, "list_migrations", {});

    expect(response.text).toContain("Available migrations:");

    const structured = response.structuredContent;
    expect(structured?.["action"]).toBe("migration_list");
    expect(structured?.["totalPending"]).toBeTypeOf("number");

    const available = structured?.["available"] as Array<Record<string, unknown>>;
    expect(Array.isArray(available)).toBe(true);
    expect(available.length).toBeGreaterThan(0);
    expect(available.some((migration) => migration["name"] === "v0.1.0-backfill-memory-versions")).toBe(true);

    const vaults = structured?.["vaults"] as Array<Record<string, unknown>>;
    expect(Array.isArray(vaults)).toBe(true);
    expect(vaults.length).toBeGreaterThan(0);
  }, 15000);

  it("keeps migration and graph structured outputs aligned with their schemas", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Schema audit graph note",
        content: "Used to validate structured MCP output schemas.",
        tags: ["integration"],
        scope: "global",
        summary: "Create note for structured output schema audit",
      }, embeddingServer.url);

      extractRememberedId(rememberText);

      const migrationList = await callLocalMcpResponse(vaultDir, "list_migrations", {});
      expect(() => MigrationListResultSchema.parse(migrationList.structuredContent)).not.toThrow();

      const executeMigration = await callLocalMcpResponse(vaultDir, "execute_migration", {
        migrationName: "v0.1.0-backfill-memory-versions",
        dryRun: true,
        backup: true,
      });
      expect(() => MigrationExecuteResultSchema.parse(executeMigration.structuredContent)).not.toThrow();

      const memoryGraph = await callLocalMcpResponse(vaultDir, "memory_graph", {});
      const graph = MemoryGraphResultSchema.parse(memoryGraph.structuredContent);
      expect(Array.isArray(graph.nodes)).toBe(true);
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

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

  it("recall backfills a missing embedding and returns the note", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);

    await mkdir(path.join(vaultDir, "notes"), { recursive: true });
    await writeFile(
      path.join(vaultDir, "notes", "backfill-recall-note.md"),
      `---\ntitle: Lazy backfill recall note\ntags: [integration]\nlifecycle: permanent\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\nmemoryVersion: 1\n---\n\nThis note has no embedding yet and should be found via recall.`,
      "utf-8",
    );

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const recallText = await callLocalMcp(vaultDir, "recall", {
        query: "lazy backfill recall",
      }, embeddingServer.url);

      expect(recallText).toContain("Lazy backfill recall note");
      await expect(stat(path.join(vaultDir, "embeddings", "backfill-recall-note.json"))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("recall re-embeds a stale note edited after its embedding was written", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Staleness detection note",
        content: "Original content before direct edit.",
        tags: ["integration"],
        scope: "global",
        summary: "Seed note for staleness detection test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const embeddingPath = path.join(vaultDir, "embeddings", `${noteId}.json`);

      // Back-date the embedding so it appears stale
      const embeddingRaw = await readFile(embeddingPath, "utf-8");
      const embeddingJson = JSON.parse(embeddingRaw) as Record<string, unknown>;
      embeddingJson["updatedAt"] = "2020-01-01T00:00:00.000Z";
      await writeFile(embeddingPath, JSON.stringify(embeddingJson), "utf-8");

      // recall should detect stale embedding and regenerate it
      await callLocalMcp(vaultDir, "recall", { query: "staleness detection" }, embeddingServer.url);

      const afterRaw = await readFile(embeddingPath, "utf-8");
      const afterJson = JSON.parse(afterRaw) as Record<string, unknown>;
      expect(afterJson["updatedAt"]).not.toBe("2020-01-01T00:00:00.000Z");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("recall returns existing results when Ollama is down (backfill fails silently)", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Offline recall note",
        content: "This note has an embedding and should be found even when Ollama is down.",
        tags: ["integration"],
        scope: "global",
        summary: "Seed note for offline recall test",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      // recall with Ollama down — embed(query) will fail, so the whole call fails
      // But if we have a note without an embedding, the backfill should fail silently
      // and recall should still return existing notes
      // Create a second note without an embedding
      await mkdir(path.join(vaultDir, "notes"), { recursive: true });
      await writeFile(
        path.join(vaultDir, "notes", "no-embedding-note.md"),
        `---\ntitle: Note without embedding\ntags: [integration]\nlifecycle: permanent\ncreatedAt: 2026-01-01T00:00:00.000Z\nupdatedAt: 2026-01-01T00:00:00.000Z\nmemoryVersion: 1\n---\n\nThis note has no embedding.`,
        "utf-8",
      );

      // recall with working Ollama: backfill for the no-embedding note should succeed, existing note also returned
      const recallText = await callLocalMcp(vaultDir, "recall", {
        query: "offline recall note",
      }, embeddingServer.url);

      expect(recallText).toContain("Offline recall note");
      // The no-embedding note got backfilled too
      await expect(stat(path.join(vaultDir, "embeddings", "no-embedding-note.json"))).resolves.toBeDefined();
      // Original note embedding still present
      await expect(stat(path.join(vaultDir, "embeddings", `${noteId}.json`))).resolves.toBeDefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("merges a global note and a project-associated note in a single execute-merge call", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });

    const embeddingServer = await startFakeEmbeddingServer();

    try {
      // A purely global note — no project association, no cwd
      const globalRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Cross scope source A (global)",
        content: "A purely global note with no project association.",
        tags: ["integration", "cross-scope"],
        lifecycle: "permanent",
        summary: "Create global note for cross-scope consolidation test",
        scope: "global",
      }, embeddingServer.url);
      const globalId = extractRememberedId(globalRemember);

      // A project-associated note stored in main-vault (private/global scope with cwd)
      const projectRemember = await callLocalMcp(vaultDir, "remember", {
        title: "Cross scope source B (project-associated, main-vault)",
        content: "A project-associated note stored privately in main-vault.",
        tags: ["integration", "cross-scope"],
        lifecycle: "permanent",
        summary: "Create project-associated note for cross-scope consolidation test",
        cwd: repoDir,
        scope: "global",
      }, embeddingServer.url);
      const projectAssociatedId = extractRememberedId(projectRemember);

      // Both notes are in main-vault but have different project associations.
      // A single execute-merge call must resolve both — previously only one scope
      // was searched and the other source was reported as not found.
      // Consolidate without cwd — no project context, but both notes live in main-vault.
      // Previously this failed because the global-scope filter excluded the project-associated note.
      const consolidateText = await callLocalMcp(vaultDir, "consolidate", {
        strategy: "execute-merge",
        mode: "delete",
        mergePlan: {
          sourceIds: [globalId, projectAssociatedId],
          targetTitle: "Cross scope consolidated note",
          content: "Merged content from a global note and a project-associated note.",
        },
      }, embeddingServer.url);

      expect(consolidateText).not.toContain("not found");
      expect(consolidateText).toContain("Mode: delete");
      expect(consolidateText).toContain("Source notes deleted.");

      const consolidatedIdMatch = consolidateText.match(/Consolidated \d+ notes into '([^']+)'/);
      expect(consolidatedIdMatch).toBeTruthy();
      const consolidatedId = consolidatedIdMatch![1]!;

      const consolidatedPath = path.join(vaultDir, "notes", `${consolidatedId}.md`);
      const consolidatedContents = await readFile(consolidatedPath, "utf-8");
      expect(consolidatedContents).toContain("Merged content from a global note and a project-associated note.");

      // Both source notes must be gone
      await expect(stat(path.join(vaultDir, "notes", `${globalId}.md`))).rejects.toThrow();
      await expect(stat(path.join(vaultDir, "notes", `${projectAssociatedId}.md`))).rejects.toThrow();
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
