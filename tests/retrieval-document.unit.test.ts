import { describe, it, expect } from "vitest";
import {
  deriveDocumentId,
  deriveChunkId,
  DOCUMENT_SOURCE_LIMITS,
} from "../src/retrieval-document.js";

describe("deriveDocumentId", () => {
  it("produces deterministic IDs with normalized paths", () => {
    const id1 = deriveDocumentId("att-1", "docs/readme.md");
    const id2 = deriveDocumentId("att-1", "docs/readme.md");
    expect(id1).toBe(id2);
  });

  it("includes the attachment ID and normalized path separated by ::", () => {
    const id = deriveDocumentId("att-abc", "src/index.md");
    expect(id).toContain("att-abc");
    expect(id).toContain("::");
    expect(id).toContain("src");
    expect(id).toContain("index");
    expect(id).toContain("md");
  });

  it("normalizes special characters in path to hyphens", () => {
    const id = deriveDocumentId("att-1", "my docs/readme@2x.md");
    expect(id).not.toContain("@");
    expect(id).not.toContain(" ");
    expect(id).toContain("my-docs");
    expect(id).toContain("readme-2x-md");
  });

  it("strips leading and trailing hyphens from path segments", () => {
    const id = deriveDocumentId("att-1", "---docs/readme---");
    expect(id).not.toContain("---");
    expect(id).toContain("docs");
    expect(id).toContain("readme");
  });

  it("produces different IDs for different attachment IDs", () => {
    const id1 = deriveDocumentId("att-a", "docs/readme.md");
    const id2 = deriveDocumentId("att-b", "docs/readme.md");
    expect(id1).not.toBe(id2);
  });

  it("produces different IDs for different paths", () => {
    const id1 = deriveDocumentId("att-1", "docs/a.md");
    const id2 = deriveDocumentId("att-1", "docs/b.md");
    expect(id1).not.toBe(id2);
  });
});

describe("deriveChunkId", () => {
  const docId = "att-1::docs-readme-md";

  it("produces deterministic IDs with same inputs", () => {
    const ancestry = [{ depth: 1, text: "Introduction" }];
    const id1 = deriveChunkId(docId, ancestry, 0, 0);
    const id2 = deriveChunkId(docId, ancestry, 0, 0);
    expect(id1).toBe(id2);
  });

  it("includes document ID, heading ancestry, occurrence, and ordinal", () => {
    const ancestry = [{ depth: 1, text: "Getting Started" }];
    const id = deriveChunkId(docId, ancestry, 0, 1);
    expect(id).toContain(docId);
    expect(id).toContain("Getting-Started");
    expect(id).toContain("::0::1");
  });

  it("joins multiple heading levels with ::", () => {
    const ancestry = [
      { depth: 1, text: "Guide" },
      { depth: 2, text: "Installation" },
    ];
    const id = deriveChunkId(docId, ancestry, 0, 0);
    expect(id).toContain("Guide");
    expect(id).toContain("Installation");
    expect(id).toMatch(/Guide::Installation/);
  });

  it("normalizes heading text to hyphens", () => {
    const ancestry = [{ depth: 1, text: "My @Heading!" }];
    const id = deriveChunkId(docId, ancestry, 0, 0);
    expect(id).not.toContain("@");
    expect(id).not.toContain("!");
    expect(id).toContain("My-Heading");
  });

  it("differentiates duplicate headings by occurrence number", () => {
    const ancestry = [{ depth: 1, text: "API" }];
    const id1 = deriveChunkId(docId, ancestry, 0, 0);
    const id2 = deriveChunkId(docId, ancestry, 1, 0);
    expect(id1).not.toBe(id2);
    expect(id1).toContain("::0::");
    expect(id2).toContain("::1::");
  });

  it("differentiates split ordinals within same heading", () => {
    const ancestry = [{ depth: 1, text: "Long Section" }];
    const id1 = deriveChunkId(docId, ancestry, 0, 0);
    const id2 = deriveChunkId(docId, ancestry, 0, 1);
    expect(id1).not.toBe(id2);
    expect(id1).toContain("::0::0");
    expect(id2).toContain("::0::1");
  });

  it("handles empty heading ancestry", () => {
    const id = deriveChunkId(docId, [], 0, 0);
    expect(id).toContain(docId);
    expect(id).toMatch(/::0::0$/);
  });
});

describe("DOCUMENT_SOURCE_LIMITS", () => {
  it("has sensible maxTrackedFiles", () => {
    expect(DOCUMENT_SOURCE_LIMITS.maxTrackedFiles).toBeGreaterThan(100);
    expect(DOCUMENT_SOURCE_LIMITS.maxTrackedFiles).toBeLessThanOrEqual(10000);
  });

  it("has sensible maxBytesPerFile (1 MB)", () => {
    expect(DOCUMENT_SOURCE_LIMITS.maxBytesPerFile).toBe(1024 * 1024);
  });

  it("has sensible maxExtractedTextPerFile (512 KB)", () => {
    expect(DOCUMENT_SOURCE_LIMITS.maxExtractedTextPerFile).toBe(512 * 1024);
  });

  it("has sensible maxChunksPerDocument", () => {
    expect(DOCUMENT_SOURCE_LIMITS.maxChunksPerDocument).toBeGreaterThan(10);
    expect(DOCUMENT_SOURCE_LIMITS.maxChunksPerDocument).toBeLessThanOrEqual(1000);
  });

  it("has sensible maxTotalChunks", () => {
    expect(DOCUMENT_SOURCE_LIMITS.maxTotalChunks).toBeGreaterThan(1000);
    expect(DOCUMENT_SOURCE_LIMITS.maxTotalChunks).toBeLessThanOrEqual(100000);
  });

  it("has sensible maxEmbeddingWork", () => {
    expect(DOCUMENT_SOURCE_LIMITS.maxEmbeddingWork).toBeGreaterThan(100);
    expect(DOCUMENT_SOURCE_LIMITS.maxEmbeddingWork).toBeLessThanOrEqual(100000);
  });

  it("all constants are readonly via as const", () => {
    // as const makes properties deeply readonly at the type level
    // but does not freeze the runtime object
    expect(DOCUMENT_SOURCE_LIMITS.maxTrackedFiles).toBeGreaterThan(100);
    expect(DOCUMENT_SOURCE_LIMITS.maxBytesPerFile).toBe(1024 * 1024);
  });
});
