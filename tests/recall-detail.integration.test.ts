import { describe, expect, it } from "vitest";
import http from "http";
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

const DEEP_SENTENCE =
  "Rows are claimed with SKIP LOCKED so two replicas never publish the same row.";
const UNRELATED_SENTENCE =
  "Published rows are kept for seven days and then removed by a nightly job.";
const CONTENT = [
  "Order events are written to an outbox table in the same transaction.",
  "## Dispatching",
  UNRELATED_SENTENCE,
  DEEP_SENTENCE,
].join("\n\n");

async function setup(): Promise<{ vaultDir: string; repoDir: string }> {
  const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-detail-vault-"));
  const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-detail-repo-"));
  tempDirs.push(vaultDir, repoDir);
  await initTestRepo(repoDir);
  await execFileAsync("git", ["remote", "add", "origin", "git@github.com:acme/detail.git"], {
    cwd: repoDir,
  });
  return { vaultDir, repoDir };
}

// Note projections start with "Title:", queries do not: cosine 0.4 between them, which
// admits every note (minSimilarity 0.3) while staying a weak semantic match.
async function startWeakMatchEmbeddingServer(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const { input } = JSON.parse(raw) as { input: string };
      const vector = input.startsWith("Title:") ? [1, 0, 0] : [0.4, Math.sqrt(1 - 0.16), 0];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ embeddings: [vector] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine embedding server address");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("recall detail", () => {
  it("renders summary and matching passage by default and full bodies on request", async () => {
    const { vaultDir, repoDir } = await setup();
    const embeddingServer = await startFakeEmbeddingServer();
    const options = { ollamaUrl: embeddingServer.url };
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Outbox decision",
          content: CONTENT,
          cwd: repoDir,
          scope: "project",
          summary: "Add",
        },
        options,
      );

      const query = "how do replicas avoid publishing the same row";
      const brief = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query, cwd: repoDir },
        options,
      );
      const noteId = RecallResultSchema.parse(brief.structuredContent).results[0]?.id;

      expect(brief.text).toContain("Order events are written to an outbox table");
      expect(brief.text).toContain(`> ${DEEP_SENTENCE}`);
      expect(brief.text).not.toContain(UNRELATED_SENTENCE);
      expect(brief.text).toContain(`For full note content call \`get\` with ids: \`${noteId}\``);

      const full = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query, cwd: repoDir, detail: "full" },
        options,
      );
      expect(full.text).toContain(CONTENT);
      expect(full.text).not.toContain("For full note content call `get`");
    } finally {
      await embeddingServer.close();
    }
  }, 30_000);

  it("rounds scores in structured output", async () => {
    const { vaultDir, repoDir } = await setup();
    const embeddingServer = await startWeakMatchEmbeddingServer();
    const options = { ollamaUrl: embeddingServer.url };
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Outbox decision",
          content: CONTENT,
          cwd: repoDir,
          scope: "project",
          summary: "Add",
        },
        options,
      );
      const response = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query: "outbox", cwd: repoDir, evidence: "compact" },
        options,
      );
      const [result] = RecallResultSchema.parse(response.structuredContent).results;
      const decimals = (value: number | undefined): number =>
        value === undefined ? 0 : (String(value).split(".")[1]?.length ?? 0);

      expect(result).toBeDefined();
      expect(decimals(result?.score)).toBeLessThanOrEqual(3);
      expect(decimals(result?.boosted)).toBeLessThanOrEqual(3);
      expect(decimals(result?.signalStrength)).toBeLessThanOrEqual(3);
      expect(
        decimals(result?.retrievalEvidence?.scoreDecomposition?.finalScore),
      ).toBeLessThanOrEqual(4);
      expect(decimals(result?.retrievalEvidence?.scoreDecomposition?.rrfScore)).toBeLessThanOrEqual(
        4,
      );
    } finally {
      await embeddingServer.close();
    }
  }, 30_000);

  it("hints at refining the query when matches are weak and not lexical", async () => {
    const { vaultDir, repoDir } = await setup();
    const embeddingServer = await startWeakMatchEmbeddingServer();
    const options = { ollamaUrl: embeddingServer.url };
    try {
      await callLocalMcp(
        vaultDir,
        "remember",
        {
          title: "Outbox decision",
          content: CONTENT,
          cwd: repoDir,
          scope: "project",
          summary: "Add",
        },
        options,
      );

      const weak = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query: "kubernetes autoscaling", cwd: repoDir },
        options,
      );
      expect(weak.text).toContain("weak matches: try more specific terms or an exact identifier");

      const lexical = await callLocalMcpResponse(
        vaultDir,
        "recall",
        { query: "outbox transaction", cwd: repoDir },
        options,
      );
      expect(lexical.text).not.toContain("weak matches");
    } finally {
      await embeddingServer.close();
    }
  }, 30_000);
});
