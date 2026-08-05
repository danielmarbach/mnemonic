import { describe, expect, it } from "vitest";
import { mkdtemp } from "fs/promises";
import os from "os";
import path from "path";

import {
  extractRememberedId,
  initTestRepo,
  startFakeEmbeddingServer,
  tempDirs,
} from "./helpers/mcp.js";
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

      // Regression: the real `get` handler emits note items with alwaysLoad +
      // relatedTo; the declared output schema must accept them. Handler/schema
      // drift here previously caused an MCP -32602 structured-content error when
      // fetching a plain memory by id.
      const getResponse = await client.callTool("get", { ids: [rememberedId] });
      expect(getResponse.structuredContent).toBeDefined();
      const { GetResultSchema } = await import("../src/structured-content.js");
      const parsedGet = GetResultSchema.parse(getResponse.structuredContent);
      expect(
        parsedGet.items?.some((item) => item.kind === "note" && item.id === rememberedId),
      ).toBe(true);
    } finally {
      await client.close();
      await embeddingServer.close();
    }
  }, 20000);

  it("get outputSchema accepts notes whose persisted relatedTo carries cross-vault vaultPath", async () => {
    // Regression: cross-vault relations persist `vaultPath` on a note's
    // relatedTo entry (see relate.ts). The `get` handler must project relatedTo
    // to the wire shape { id, type }; passing the persisted entry verbatim
    // leaks vaultPath, which violates the additionalProperties:false emitted by
    // Zod v4 -> JSON Schema. Under the real MCP SDK that surfaces as a -32602
    // "Structured content does not match the tool's output schema" error for
    // BOTH `notes[].relatedTo` and the `items` discriminated union oneOf. The
    // schema-driven client below ajv-validates structuredContent against
    // outputSchema, so a regression throws here instead of being silently
    // stripped by Zod .parse().
    //
    // Genuine cross-vault setup: the main vault is `mainVaultDir` (VAULT_PATH),
    // and `repoDir` is a git repo (initTestRepo) so a project-scoped note lives
    // in `<repoDir>/.mnemonic`, a different vault. Relating the project note to
    // a global note therefore crosses vaults and persists vaultPath on disk.
    const mainVaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-main-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-repo-"));
    tempDirs.push(mainVaultDir, repoDir);
    await initTestRepo(repoDir);
    const embeddingServer = await startFakeEmbeddingServer();
    const client = await createSchemaDrivenMcpClient(mainVaultDir, {
      ollamaUrl: embeddingServer.url,
    });

    try {
      const globalResponse = await client.callTool("remember", {
        title: "Global design note",
        content: "Global context for cross-vault relation.",
        scope: "global",
        lifecycle: "permanent",
      });
      const globalId = extractRememberedId(globalResponse.text);
      expect(globalId).toBeTruthy();

      const projectResponse = await client.callTool("remember", {
        title: "Project note",
        content: "Project-specific note that points at the global one.",
        cwd: repoDir,
        scope: "project",
        lifecycle: "permanent",
      });
      const projectId = extractRememberedId(projectResponse.text);
      expect(projectId).toBeTruthy();

      // Cross-vault relate persists a relatedTo entry carrying vaultPath on the
      // project note (project vault differs from the main vault).
      await client.callTool("relate", {
        fromId: projectId,
        toId: globalId,
        type: "related-to",
        cwd: repoDir,
      });

      // Fetching the project note must produce outputSchema-valid content. The
      // schema-driven client ajv-validates and throws on any vaultPath leak.
      const getResponse = await client.callTool("get", { ids: [projectId], cwd: repoDir });
      expect(getResponse.structuredContent).toBeDefined();

      const notes = getResponse.structuredContent?.["notes"] as
        Array<Record<string, unknown>> | undefined;
      const note = notes?.find((entry) => entry["id"] === projectId);
      expect(note).toBeDefined();
      const relatedTo = note?.["relatedTo"] as Array<Record<string, unknown>> | undefined;
      const crossVaultRel = relatedTo?.find((entry) => entry["id"] === globalId);
      expect(crossVaultRel).toBeDefined();
      expect(crossVaultRel?.["type"]).toBe("related-to");
      // vaultPath must not leak into structured output.
      expect(crossVaultRel?.["vaultPath"]).toBeUndefined();

      // The discriminated items[] view of the same note must also validate and
      // omit vaultPath.
      const items = getResponse.structuredContent?.["items"] as
        Array<Record<string, unknown>> | undefined;
      const item = items?.find((entry) => entry["kind"] === "note" && entry["id"] === projectId);
      expect(item).toBeDefined();
      const itemRelatedTo = item?.["relatedTo"] as Array<Record<string, unknown>> | undefined;
      expect(
        itemRelatedTo?.find((entry) => entry["id"] === globalId)?.["vaultPath"],
      ).toBeUndefined();
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
    expect(parsedRecall.documentChunks![0]!.kind).toBe("document-chunk");

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
          kind: "note" as const,
          id: "test-note-abc",
          title: "Test note",
          content: "Body of the test note.",
          tags: ["testing"],
          lifecycle: "permanent" as const,
          role: "decision" as const,
          alwaysLoad: true,
          relatedTo: [{ id: "other-note", type: "related-to" as const }],
          vault: "main-vault",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
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
    expect(parsedGet.items).toHaveLength(2);
    expect(parsedGet.items![0]!.kind).toBe("note");
    expect(parsedGet.items![1]!.kind).toBe("document");
    expect(parsedGet.itemErrors).toBeDefined();
    expect(parsedGet.itemErrors).toHaveLength(1);
    expect(parsedGet.itemErrors![0]!.code).toBe("unknown-document");
  });
});
