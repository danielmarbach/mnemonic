import { describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import { extractRememberedId, startFakeEmbeddingServer, tempDirs } from "./helpers/mcp.js";
import {
  createSchemaDrivenMcpClient,
  normalizeMcpToolContract,
} from "./helpers/mcp-schema-client.js";

describe("mcp schema-driven contract integration", () => {
  it("snapshots stable public tool contract and validates remember/recall via exposed schemas", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-contract-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();
    const client = await createSchemaDrivenMcpClient(vaultDir, {
      ollamaUrl: embeddingServer.url,
    });

    try {
      const normalizedContract = normalizeMcpToolContract(client.tools);
      // Snapshot updates here are deliberate public MCP contract changes for clients.
      expect(normalizedContract).toMatchSnapshot();

      const rememberResponse = await client.callTool("remember", {
        title: "Schema contract memory",
        content: "Schema-driven MCP contract test note.",
        tags: ["integration", "contract"],
        scope: "global",
        lifecycle: "permanent",
      });
      const rememberedId = extractRememberedId(rememberResponse.text);
      expect(rememberedId).toBeTruthy();

      const recallResponse = await client.callTool("recall", {
        query: "schema-driven MCP contract test note",
        scope: "global",
        limit: 10,
      });
      expect(recallResponse.structuredContent).toBeDefined();

      const results = recallResponse.structuredContent?.["results"] as
        | Array<Record<string, unknown>>
        | undefined;
      expect(results?.some((result) => result["id"] === rememberedId)).toBe(true);
    } finally {
      await client.close();
      await embeddingServer.close();
    }
  }, 20000);
});
