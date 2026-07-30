import { describe, it, expect } from "vitest";
import {
  isDocumentEntityRef,
  isChunkEntityRef,
  parseEntityRef,
  classifyEntityRef,
  buildDocumentRef,
  buildChunkRef,
} from "../src/document-entity-ref.js";

describe("isDocumentEntityRef", () => {
  it("returns true for doc: prefixed IDs", () => {
    expect(isDocumentEntityRef("doc:att-1::docs-readme-md")).toBe(true);
  });

  it("returns true for chunk: prefixed IDs", () => {
    expect(isDocumentEntityRef("chunk:att-1::docs-readme-md::Introduction::0::0")).toBe(true);
  });

  it("returns false for regular Memory IDs", () => {
    expect(isDocumentEntityRef("my-note-id")).toBe(false);
    expect(isDocumentEntityRef("plan-convention-based-pipeline-behaviors-669be451")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDocumentEntityRef("")).toBe(false);
  });

  it("returns false for IDs with other prefixes", () => {
    expect(isDocumentEntityRef("note:something")).toBe(false);
    expect(isDocumentEntityRef("memory:abc")).toBe(false);
  });
});

describe("isChunkEntityRef", () => {
  it("returns true for chunk: prefixed IDs", () => {
    expect(isChunkEntityRef("chunk:att-1::docs-readme-md::Introduction::0::0")).toBe(true);
  });

  it("returns false for doc: prefixed IDs", () => {
    expect(isChunkEntityRef("doc:att-1::docs-readme-md")).toBe(false);
  });

  it("returns false for regular Memory IDs", () => {
    expect(isChunkEntityRef("my-note-id")).toBe(false);
  });
});

describe("parseEntityRef", () => {
  it("parses doc: refs as document kind", () => {
    const result = parseEntityRef("doc:att-1::docs-readme-md");
    expect(result.kind).toBe("document");
    if (result.kind === "document") {
      expect(result.documentId).toBe("att-1::docs-readme-md");
      expect(result.raw).toBe("doc:att-1::docs-readme-md");
    }
  });

  it("parses chunk: refs as chunk kind with documentId and chunkId", () => {
    const result = parseEntityRef("chunk:att-1::docs-readme-md::Introduction::0::0");
    expect(result.kind).toBe("chunk");
    if (result.kind === "chunk") {
      // documentId = attachmentId::normalizedPath (first two :: segments); chunkId
      // is the chunkId WITHOUT the chunk: prefix (as stored in generation.chunks).
      expect(result.documentId).toBe("att-1::docs-readme-md");
      expect(result.chunkId).toBe("att-1::docs-readme-md::Introduction::0::0");
      expect(result.raw).toBe("chunk:att-1::docs-readme-md::Introduction::0::0");
    }
  });

  it("parses chunk: refs with empty heading ancestry", () => {
    const result = parseEntityRef("chunk:att-1::docs-readme-md::::0::0");
    expect(result.kind).toBe("chunk");
    if (result.kind === "chunk") {
      // documentId is the first two :: segments (attachmentId::normalizedPath)
      expect(result.documentId).toBe("att-1::docs-readme-md");
      expect(result.chunkId).toBe("att-1::docs-readme-md::::0::0");
    }
  });

  it("returns unknown for chunk: refs without :: separator after prefix", () => {
    const result = parseEntityRef("chunk:just-a-name");
    expect(result.kind).toBe("unknown");
  });

  it("parses valid Memory IDs as memory kind", () => {
    const result = parseEntityRef("my-note-id");
    expect(result.kind).toBe("memory");
    if (result.kind === "memory") {
      expect(result.memoryId).toBe("my-note-id");
    }
  });

  it("parses complex Memory IDs as memory kind", () => {
    const result = parseEntityRef("plan-convention-based-pipeline-behaviors-669be451");
    expect(result.kind).toBe("memory");
    if (result.kind === "memory") {
      expect(result.memoryId).toBe("plan-convention-based-pipeline-behaviors-669be451");
    }
  });

  it("returns unknown for empty string", () => {
    const result = parseEntityRef("");
    expect(result.kind).toBe("unknown");
  });

  it("returns unknown for IDs with special characters", () => {
    const result = parseEntityRef("my note with spaces");
    expect(result.kind).toBe("unknown");
  });

  it("returns unknown for IDs with @ symbols", () => {
    const result = parseEntityRef("note@123");
    expect(result.kind).toBe("unknown");
  });
});

describe("classifyEntityRef", () => {
  it("returns document for doc: prefixed IDs", () => {
    expect(classifyEntityRef("doc:att-1::docs-readme-md")).toBe("document");
  });

  it("returns chunk for chunk: prefixed IDs", () => {
    expect(classifyEntityRef("chunk:att-1::docs-readme-md::Intro::0::0")).toBe("chunk");
  });

  it("returns memory for valid Memory IDs", () => {
    expect(classifyEntityRef("my-note-id")).toBe("memory");
    expect(classifyEntityRef("plan-convention-based-pipeline-behaviors-669be451")).toBe("memory");
  });

  it("returns unknown for empty string", () => {
    expect(classifyEntityRef("")).toBe("unknown");
  });

  it("returns unknown for IDs with special characters", () => {
    expect(classifyEntityRef("my note with spaces")).toBe("unknown");
    expect(classifyEntityRef("note@123")).toBe("unknown");
  });
});

describe("buildDocumentRef", () => {
  it("builds a doc: ref from attachment ID and path", () => {
    const ref = buildDocumentRef("att-1", "docs/readme.md");
    expect(ref).toBe("doc:att-1::docs-readme-md");
  });

  it("normalizes special characters in path", () => {
    const ref = buildDocumentRef("att-1", "my docs/readme@2x.md");
    expect(ref).toBe("doc:att-1::my-docs-readme-2x-md");
  });

  it("strips leading and trailing hyphens", () => {
    const ref = buildDocumentRef("att-1", "---docs/readme---");
    expect(ref).toBe("doc:att-1::docs-readme");
  });
});

describe("buildChunkRef", () => {
  it("builds a chunk: ref from a chunk ID", () => {
    const ref = buildChunkRef("att-1::docs-readme-md::Intro::0::0");
    expect(ref).toBe("chunk:att-1::docs-readme-md::Intro::0::0");
  });

  it("preserves the full chunk ID after the prefix", () => {
    const chunkId = "att-1::docs-readme-md::Getting-Started::0::1";
    const ref = buildChunkRef(chunkId);
    expect(ref).toBe(`chunk:${chunkId}`);
  });
});
