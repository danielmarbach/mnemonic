import { describe, expect, it } from "vitest";
import { mkdtemp, stat, readFile } from "fs/promises";
import os from "os";
import path from "path";
import matter from "gray-matter";

import {
  callLocalMcp,
  callLocalMcpResponse,
  extractRememberedId,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

describe("role parameter and role-based lifecycle defaults", () => {
  it("remember with role: research creates note with role in frontmatter", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Research note on API patterns",
        content: "Investigated three REST patterns for the service layer.",
        tags: ["research"],
        role: "research",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.role).toBe("research");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("remember with role: review creates note with role in frontmatter", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Review of PR 42",
        content: "Found two issues in the handler implementation.",
        tags: ["review"],
        role: "review",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.role).toBe("review");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("remember with role: research defaults lifecycle to temporary", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Research defaults temporary",
        content: "This should be temporary by default.",
        role: "research",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.lifecycle).toBe("temporary");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("remember with role: plan defaults lifecycle to temporary", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Plan for refactoring",
        content: "Step 1: Extract interface. Step 2: Add tests.",
        role: "plan",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.lifecycle).toBe("temporary");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("remember with role: decision defaults lifecycle to permanent", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Decision: use Protobuf for serialization",
        content: "After evaluating three options, Protobuf was selected.",
        role: "decision",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.lifecycle).toBe("permanent");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("remember with role: research and explicit lifecycle: permanent overrides the default", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Research with permanent override",
        content: "This research should stay permanent despite the role default.",
        role: "research",
        lifecycle: "permanent",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.lifecycle).toBe("permanent");
      expect(data.role).toBe("research");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("update with role: review changes role on existing note", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Note to update role",
        content: "Starts without explicit role.",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      const updateText = await callLocalMcp(vaultDir, "update", {
        id: noteId,
        role: "review",
      }, embeddingServer.url);

      expect(updateText).toContain("Updated");

      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.role).toBe("review");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("update with role change does not implicitly change lifecycle", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Permanent note for role change",
        content: "Starts as permanent.",
        lifecycle: "permanent",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);

      await callLocalMcp(vaultDir, "update", {
        id: noteId,
        role: "research",
      }, embeddingServer.url);

      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.role).toBe("research");
      expect(data.lifecycle).toBe("permanent");
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("remember without role does not write role to frontmatter", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-role-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const text = await callLocalMcp(vaultDir, "remember", {
        title: "Note without explicit role",
        content: "Role should not appear in frontmatter.",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(text);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);
      const fileContent = await readFile(notePath, "utf-8");
      const { data } = matter(fileContent);

      expect(data.role).toBeUndefined();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);
});