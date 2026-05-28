import { mkdtemp } from "fs/promises";
import { describe, expect, it } from "vitest";
import os from "os";
import path from "path";

import {
  callLocalMcpResponse,
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";

describe("lint error structured output", () => {
  it("returns text and structuredContent for remember and update lint failures", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-lint-structured-"));
    tempDirs.push(vaultDir);
    await initTestRepo(vaultDir, "main");

    const fakeEmbedding = await startFakeEmbeddingServer();
    try {
      const rememberLint = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Lint Error Remember",
          content: "```\nmissing language\n```",
          lifecycle: "temporary",
          role: "context",
          scope: "project",
          cwd: vaultDir,
          allowProtectedBranch: true,
        },
        { disableGit: false, ollamaUrl: fakeEmbedding.url },
      );

      expect(rememberLint.text).toContain(
        "Markdown lint issues prevented this note from being stored",
      );
      expect(rememberLint.structuredContent).toBeDefined();
      expect(rememberLint.structuredContent?.action).toBe("lint_error");
      expect(rememberLint.structuredContent?.tool).toBe("remember");
      expect(Array.isArray(rememberLint.structuredContent?.issues)).toBe(true);
      expect((rememberLint.structuredContent?.issues as unknown[]).length).toBeGreaterThan(0);
      expect(rememberLint.text).toMatch(/fenced code blocks? (?:should have|require) a language/i);

      const rememberOk = await callLocalMcpResponse(
        vaultDir,
        "remember",
        {
          title: "Lint Error Update Seed",
          content: "Seed note for update lint test.",
          lifecycle: "temporary",
          role: "context",
          scope: "project",
          cwd: vaultDir,
          allowProtectedBranch: true,
        },
        { disableGit: false, ollamaUrl: fakeEmbedding.url },
      );

      const noteId = extractRememberedId(rememberOk.text);

      const updateLint = await callLocalMcpResponse(
        vaultDir,
        "update",
        {
          id: noteId,
          content: "```\nmissing language\n```",
          cwd: vaultDir,
          allowProtectedBranch: true,
        },
        { disableGit: false, ollamaUrl: fakeEmbedding.url },
      );

      expect(updateLint.text).toContain("Markdown lint issues prevented the update");
      expect(updateLint.structuredContent).toBeDefined();
      expect(updateLint.structuredContent?.action).toBe("lint_error");
      expect(updateLint.structuredContent?.tool).toBe("update");
      expect(Array.isArray(updateLint.structuredContent?.issues)).toBe(true);
      expect((updateLint.structuredContent?.issues as unknown[]).length).toBeGreaterThan(0);
      expect(updateLint.text).toMatch(/fenced code blocks? (?:should have|require) a language/i);
    } finally {
      await fakeEmbedding.close();
    }
  }, 30000);
});
