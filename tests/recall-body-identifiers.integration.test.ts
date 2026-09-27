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

// Well past the 280-char summary and the 1200-char projection cap. Titles share no
// token with the identifiers, so only the body can match.
const FILLER = "Operational notes that say nothing specific about configuration names. ".repeat(45);

const NOTES = [
  {
    title: "Deployment tuning notes",
    identifier: "OUTBOX_POLL_INTERVAL_MS",
    sentence: "The poll interval is set with `OUTBOX_POLL_INTERVAL_MS` in the deployment values.",
  },
  {
    title: "Message handling notes",
    identifier: "IdempotencyKeyStore",
    sentence: "Processed message ids are recorded in the IdempotencyKeyStore table.",
  },
  {
    title: "Client error notes",
    identifier: "payment-gateway-timeout",
    sentence: "After the deadline the caller receives the payment-gateway-timeout error.",
  },
];

const DISTRACTORS = [
  "Release checklist for the storefront",
  "Onboarding guide for new engineers",
  "Quarterly planning notes",
];

describe("recall body identifiers", () => {
  it("finds exact identifiers that only appear deep in a note body", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-identifier-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-identifier-repo-"));
    tempDirs.push(vaultDir, repoDir);
    await initTestRepo(repoDir);
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/ids.git"], {
      cwd: repoDir,
    });
    const embeddingServer = await startFakeEmbeddingServer();
    const options = { ollamaUrl: embeddingServer.url };

    try {
      for (const note of NOTES) {
        const content = `Summary of ${note.title.toLowerCase()}.\n\n${FILLER}\n\n${note.sentence}`;
        expect(content.indexOf(note.identifier)).toBeGreaterThan(3000);
        await callLocalMcp(
          vaultDir,
          "remember",
          { title: note.title, content, cwd: repoDir, scope: "project", summary: "Add note" },
          options,
        );
      }
      for (const title of DISTRACTORS) {
        await callLocalMcp(
          vaultDir,
          "remember",
          {
            title,
            content: `Summary of ${title.toLowerCase()}.\n\n${FILLER}`,
            cwd: repoDir,
            scope: "project",
            summary: "Add distractor",
          },
          options,
        );
      }

      for (const note of NOTES) {
        const response = await callLocalMcpResponse(
          vaultDir,
          "recall",
          { query: note.identifier, cwd: repoDir, limit: 5, evidence: "compact" },
          options,
        );
        const parsed = RecallResultSchema.parse(response.structuredContent);
        const position = parsed.results.findIndex((result) => result.title === note.title);

        const evidence = parsed.results[position]?.retrievalEvidence;
        expect(position, `${note.identifier} rank`).toBe(0);
        expect(evidence?.scoreDecomposition?.lexicalRank, `${note.identifier} lexical rank`).toBe(
          1,
        );
        expect(
          evidence?.scoreDecomposition?.identifierRank,
          `${note.identifier} identifier rank`,
        ).toBe(1);
        expect(evidence?.channels).toContain("identifier");
        expect(response.text).toContain("identifier");
      }

      const prose = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query: "deployment tuning notes", cwd: repoDir, limit: 5, evidence: "compact" },
        options,
      );
      const proseResults = RecallResultSchema.parse(prose.structuredContent).results;
      expect(proseResults.length).toBeGreaterThan(0);
      for (const result of proseResults) {
        expect(result.retrievalEvidence?.scoreDecomposition?.identifierRank).toBeUndefined();
        expect(result.retrievalEvidence?.channels).not.toContain("identifier");
      }
    } finally {
      await embeddingServer.close();
    }
  }, 60_000);
});
