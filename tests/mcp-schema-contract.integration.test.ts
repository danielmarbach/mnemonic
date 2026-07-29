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
        Array<Record<string, unknown>> | undefined;
      expect(results?.some((result) => result["id"] === rememberedId)).toBe(true);
    } finally {
      await client.close();
      await embeddingServer.close();
    }
  }, 20000);

  it("validates exported schemas accept document-source shaped data", async () => {
    // Import the exported schemas
    const { RecallResultSchema, GetResultSchema } = await import("../src/structured-content.js");

    // Construct a valid document-chunk result
    const recallResult = {
      action: "recalled" as const,
      query: "test",
      scope: "project" as const,
      recallScopeNoteCount: 5,
      diversity: {
        themeCount: 3,
        roleMix: { plan: 2, research: 1 },
        lifecycleMix: { permanent: 2, temporary: 1 },
      },
      retrievalCoverage: {
        fraction: 0.5,
        anchorsInResults: 2,
        highPriorityAnchorsTotal: 4,
        missingAnchors: [],
      },
      results: [],
      documentChunks: [
        {
          kind: "document-chunk" as const,
          chunkId: "chunk:doc:test-doc.md::introduction",
          documentId: "doc:test-doc.md",
          score: 0.85,
          boosted: 0.85,
          sourcePath: "test-doc.md",
          headingAncestry: [],
          excerpt: "This is a test document.",
          attachmentId: "att-123",
          sourceMediaType: "text/markdown",
          indexedCommit: "abc123",
          generationId: "gen-456",
          retrievalHandle: "chunk:doc:test-doc.md::introduction",
        },
      ],
    };
    const parsedRecall = RecallResultSchema.parse(recallResult);
    expect(parsedRecall.documentChunks).toBeDefined();
    expect(parsedRecall.documentChunks).toHaveLength(1);
    expect(parsedRecall.documentChunks![0].kind).toBe("document-chunk");

    // Construct a valid get result with documents, items, and itemErrors
    const getResult = {
      action: "got" as const,
      count: 2,
      notes: [],
      notFound: [],
      documents: [
        {
          documentId: "doc:test-doc.md",
          sourcePath: "test-doc.md",
          sourceMediaType: "text/markdown",
          content: "# Test\n\nContent.",
          contentMediaType: "text/markdown",
          attachmentId: "att-123",
          generationId: "gen-456",
          indexedCommit: "abc123",
        },
      ],
      items: [
        {
          kind: "document" as const,
          documentId: "doc:test-doc.md",
          sourcePath: "test-doc.md",
          sourceMediaType: "text/markdown",
          content: "# Test\n\nContent.",
          contentMediaType: "text/markdown",
          attachmentId: "att-123",
          generationId: "gen-456",
          indexedCommit: "abc123",
        },
      ],
      itemErrors: [
        {
          id: "doc:missing.md",
          error: "Document not found in generation",
          code: "unknown-document" as const,
        },
      ],
    };
    const parsedGet = GetResultSchema.parse(getResult);
    expect(parsedGet.documents).toBeDefined();
    expect(parsedGet.documents).toHaveLength(1);
    expect(parsedGet.items).toBeDefined();
    expect(parsedGet.items).toHaveLength(1);
    expect(parsedGet.items![0].kind).toBe("document");
    expect(parsedGet.itemErrors).toBeDefined();
    expect(parsedGet.itemErrors).toHaveLength(1);
    expect(parsedGet.itemErrors![0].code).toBe("unknown-document");
  });
});
