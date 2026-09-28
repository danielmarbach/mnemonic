import { describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import {
  callLocalMcp,
  callLocalMcpResponse,
  execFileAsync,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";
import { RecallResultSchema } from "../src/structured-content.js";

// Well past the 280-char summary and the 1200-char projection cap, so only the
// full-text channel can see the sentence.
const FILLER = "Operational notes that say nothing specific about the harbour. ".repeat(45);
const SENTENCE = "The lighthouse keeper recalibrates the tidal sensor every equinox.";
const QUERY = "lighthouse keeper recalibrates tidal sensor equinox";

describe("recall full-text channel", () => {
  it("surfaces a note whose only match is plain prose deep in its body", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-fulltext-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-fulltext-repo-"));
    tempDirs.push(vaultDir, repoDir);
    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/fulltext.git"], {
      cwd: repoDir,
    });
    const embeddingServer = await startFakeEmbeddingServer();
    const options = { ollamaUrl: embeddingServer.url };

    try {
      const notes = [
        { title: "Harbour maintenance notes", content: `Summary.\n\n${FILLER}\n\n${SENTENCE}` },
        { title: "Release checklist", content: `Summary.\n\n${FILLER}` },
        { title: "Onboarding guide", content: `Summary.\n\n${FILLER}` },
      ];
      expect(notes[0]!.content.indexOf("lighthouse")).toBeGreaterThan(2500);
      for (const note of notes) {
        await callLocalMcp(
          vaultDir,
          "remember",
          { ...note, cwd: repoDir, scope: "project", summary: "Add note" },
          options,
        );
      }

      const response = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query: QUERY, cwd: repoDir, limit: 5, evidence: "compact" },
        options,
      );
      const parsed = RecallResultSchema.parse(response.structuredContent);
      const target = parsed.results.find((result) => result.title === "Harbour maintenance notes");

      expect(target, "deep-body note is recalled").toBeDefined();
      expect(target?.retrievalEvidence?.scoreDecomposition?.fullTextRank).toBe(1);
      expect(target?.retrievalEvidence?.scoreDecomposition?.lexicalRank).toBeUndefined();
      expect(target?.retrievalEvidence?.channels).toContain("full-text");
      expect(response.text).toMatch(/channels: [^\n]*full-text/);
      for (const other of parsed.results.filter((result) => result !== target)) {
        expect(other.retrievalEvidence?.scoreDecomposition?.fullTextRank).toBeUndefined();
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60_000);
});
