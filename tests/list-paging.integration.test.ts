import { describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpMethod,
  callLocalMcpResponse,
  execFileAsync,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";
import { ListResultSchema } from "../src/structured-content.js";

const NOTE_COUNT = 7;

describe("list paging", () => {
  it("pages through every note exactly once, in title order, with a stable total", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-list-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-list-repo-"));
    tempDirs.push(vaultDir, repoDir);
    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/paging.git"], {
      cwd: repoDir,
    });
    const embeddingServer = await startFakeEmbeddingServer();
    const options = { ollamaUrl: embeddingServer.url };

    try {
      for (let index = 0; index < NOTE_COUNT; index++) {
        await callLocalMcp(
          vaultDir,
          "remember",
          {
            title: `Paging note ${index}`,
            content: `Body of paging note ${index}.`,
            tags: index % 2 === 0 ? ["even"] : ["odd"],
            cwd: repoDir,
            scope: "project",
            summary: "Add paging note",
          },
          options,
        );
      }

      const seen: string[] = [];
      const titles: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const response = await callLocalMcpResponse(
          vaultDir,
          "list",
          { cwd: repoDir, limit: 3, ...(cursor ? { cursor } : {}) },
          options,
        );
        const parsed = ListResultSchema.parse(response.structuredContent);
        expect(parsed.total).toBe(NOTE_COUNT);
        expect(parsed.count).toBe(parsed.notes.length);
        seen.push(...parsed.notes.map((note) => note.id));
        titles.push(...parsed.notes.map((note) => note.title));

        if (pages === 0) {
          expect(response.text).toContain(`${NOTE_COUNT} memories`);
          expect(response.text).toContain(`showing 1-3 of ${NOTE_COUNT}`);
          expect(response.text).toContain(`cursor: "${parsed.nextCursor}"`);
        }
        cursor = parsed.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(pages).toBe(3);
      expect(new Set(seen).size).toBe(NOTE_COUNT);
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));

      const filtered = await callLocalMcpResponse(
        vaultDir,
        "list",
        { cwd: repoDir, tags: ["even"], limit: 2 },
        options,
      );
      const filteredParsed = ListResultSchema.parse(filtered.structuredContent);
      expect(filteredParsed.total).toBe(4);
      expect(filteredParsed.count).toBe(2);
      expect(filteredParsed.nextCursor).toBeDefined();

      const everything = await callLocalMcpResponse(vaultDir, "list", { cwd: repoDir }, options);
      const everythingParsed = ListResultSchema.parse(everything.structuredContent);
      expect(everythingParsed.count).toBe(NOTE_COUNT);
      expect(everythingParsed.nextCursor).toBeUndefined();
      expect(everything.text).not.toContain("showing");
      expect(everything.text).not.toContain("cursor:");
    } finally {
      await embeddingServer.close();
    }
  }, 60_000);

  it("rejects an invalid cursor with an actionable error", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-list-vault-"));
    tempDirs.push(vaultDir);

    const response = await callLocalMcpMethod(vaultDir, 1, "tools/call", {
      name: "list",
      arguments: { cursor: "not-a-cursor" },
    });
    const content = response.result?.["content"] as Array<{ text?: string }> | undefined;

    expect(response.result?.["isError"]).toBe(true);
    expect(content?.[0]?.text).toContain("Call list again without cursor");
  }, 30_000);

  it("defaults to 50 notes per page", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-list-vault-"));
    tempDirs.push(vaultDir);

    const response = await callLocalMcpMethod(vaultDir, 1, "tools/list", {});
    const tools = response.result?.["tools"] as
      | Array<{
          name: string;
          inputSchema?: { properties?: Record<string, { default?: unknown }> };
        }>
      | undefined;
    const limit = tools?.find((tool) => tool.name === "list")?.inputSchema?.properties?.["limit"];

    expect(limit?.default).toBe(50);
  }, 30_000);
});
