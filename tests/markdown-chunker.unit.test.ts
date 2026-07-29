import { describe, it, expect } from "vitest";
import { markdownChunker } from "../src/markdown-chunker.js";

const DOC_ID = "test-attachment::readme";

describe("markdownChunker", () => {
  describe("identity", () => {
    it("has chunkerId equal to 'markdown-heading'", () => {
      expect(markdownChunker.chunkerId).toBe("markdown-heading");
    });

    it("has chunkerVersion", () => {
      expect(markdownChunker.chunkerVersion).toBe("1");
    });

    it("has chunkContentMediaType equal to 'text/markdown'", () => {
      expect(markdownChunker.chunkContentMediaType).toBe("text/markdown");
    });
  });

  describe("chunking with headings", () => {
    it("produces chunks for a simple markdown document with headings", () => {
      const md =
        "# Title\n\nSome introductory text.\n\n## Subheading\n\nContent under subheading.\n\n### Deep\n\nDeeper content.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("assigns correct heading ancestry for nested headings", () => {
      const md = "# Title\n\n## Subheading\n\nContent under subheading.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      // Find the chunk under ## Subheading
      const subChunk = chunks.find(
        (c) =>
          c.headingAncestry.length >= 2 &&
          c.headingAncestry[0]?.text === "Title" &&
          c.headingAncestry[1]?.text === "Subheading",
      );
      expect(subChunk).toBeDefined();
      expect(subChunk!.headingAncestry[0]).toEqual({ depth: 1, text: "Title" });
      expect(subChunk!.headingAncestry[1]).toEqual({ depth: 2, text: "Subheading" });
    });

    it("produces an introduction chunk with empty heading ancestry for content before first heading", () => {
      const md =
        "Some introductory text that is long enough to be a chunk.\n\nMore intro here.\n\n# Title\n\nBody.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      const introChunk = chunks.find((c) => c.headingAncestry.length === 0);
      expect(introChunk).toBeDefined();
      expect(introChunk!.content).toContain("introductory text");
    });

    it("does not produce an intro chunk when pre-heading content is too short", () => {
      const md = "Short.\n\n# Title\n\nBody.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      const introChunk = chunks.find((c) => c.headingAncestry.length === 0);
      // Content before first heading is only ~6 chars, below MIN_CHUNK_CHARS (50)
      expect(introChunk).toBeUndefined();
    });
  });

  describe("chunking without headings", () => {
    it("produces chunks by paragraph splitting when no headings exist", () => {
      const md =
        "First paragraph with enough text to be meaningful.\n\n" +
        "Second paragraph also with enough text to be meaningful.\n\n" +
        "Third paragraph with enough text to be meaningful.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      // All chunks should have empty heading ancestry
      for (const chunk of chunks) {
        expect(chunk.headingAncestry).toEqual([]);
      }
    });

    it("handles a single paragraph without headings", () => {
      const md = "Just one paragraph of text that is long enough to be a chunk.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      expect(chunks.length).toBe(1);
      expect(chunks[0]!.headingAncestry).toEqual([]);
    });
  });

  describe("oversized sections", () => {
    it("splits oversized sections into multiple chunks with incrementing splitOrdinal", () => {
      // Create content under a heading that exceeds MAX_CHUNK_CHARS (4000)
      // Repeat to make it oversized
      const body = Array.from({ length: 10 }, (_, i) => `Paragraph ${i}: ` + "X".repeat(500)).join(
        "\n\n",
      );
      const md = `# Big Section\n\n${body}`;
      const chunks = markdownChunker.chunk(DOC_ID, md);
      // Should have multiple chunks from the oversized section
      const sectionChunks = chunks.filter(
        (c) => c.headingAncestry.length === 1 && c.headingAncestry[0]?.text === "Big Section",
      );
      expect(sectionChunks.length).toBeGreaterThan(1);
      // splitOrdinal should be incrementing
      const ordinals = sectionChunks.map((c) => c.splitOrdinal);
      for (let i = 1; i < ordinals.length; i++) {
        expect(ordinals[i]).toBeGreaterThan(ordinals[i - 1]!);
      }
    });

    it("does not split content under MAX_CHUNK_CHARS", () => {
      const md = "# Small\n\n" + "X".repeat(100);
      const chunks = markdownChunker.chunk(DOC_ID, md);
      const smallChunk = chunks.find(
        (c) => c.headingAncestry.length === 1 && c.headingAncestry[0]?.text === "Small",
      );
      expect(smallChunk).toBeDefined();
      expect(smallChunk!.splitOrdinal).toBe(0);
    });
  });

  describe("chunk properties", () => {
    it("all chunks have contentMediaType 'text/markdown'", () => {
      const md = "# Title\n\nBody.\n\n## Sub\n\nMore.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      for (const chunk of chunks) {
        expect(chunk.contentMediaType).toBe("text/markdown");
      }
    });

    it("all chunks have an excerpt (first 200 chars)", () => {
      const md = "# Title\n\n" + "A".repeat(500) + "\n\n## Sub\n\n" + "B".repeat(500);
      const chunks = markdownChunker.chunk(DOC_ID, md);
      for (const chunk of chunks) {
        expect(chunk.excerpt).toBeDefined();
        expect(chunk.excerpt.length).toBeGreaterThan(0);
        expect(chunk.excerpt.length).toBeLessThanOrEqual(200);
      }
    });

    it("all chunks have unique chunkIds", () => {
      const md =
        "# Title\n\nIntro.\n\n## A\n\nContent A.\n\n## B\n\nContent B.\n\n### B1\n\nDeep B1.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      const ids = chunks.map((c) => c.chunkId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("all chunks reference the correct documentId", () => {
      const md = "# Title\n\nBody.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      for (const chunk of chunks) {
        expect(chunk.documentId).toBe(DOC_ID);
      }
    });
  });

  describe("duplicate headings", () => {
    it("handles duplicate heading text at the same depth", () => {
      const md = "# Title\n\nBody.\n\n# Title\n\nMore body.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      // Both sections should produce chunks
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // Chunk IDs should be unique despite duplicate heading text
      const ids = chunks.map((c) => c.chunkId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("edge cases", () => {
    it("handles empty content", () => {
      const chunks = markdownChunker.chunk(DOC_ID, "");
      expect(chunks).toEqual([]);
    });

    it("handles content with only headings and no body text", () => {
      const md = "# Title\n\n## Sub\n\n### Deep";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      // Headings with no body text produce no chunks
      expect(chunks).toEqual([]);
    });

    it("handles content with only whitespace", () => {
      const chunks = markdownChunker.chunk(DOC_ID, "   \n\n  \n\n  ");
      expect(chunks).toEqual([]);
    });
  });
});
