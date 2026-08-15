import { describe, it, expect } from "vitest";
import {
  createMarkdownChunker,
  DEFAULT_MAX_CHUNK_CHARS,
  markdownChunker,
  resolveMaxChunkChars,
} from "../src/markdown-chunker.js";
import { EmbeddingConfigurationError } from "../src/domain-errors.js";
import type { DocumentId } from "../src/retrieval-document.js";

const DOC_ID = "test-attachment::readme" as DocumentId;

describe("markdownChunker", () => {
  describe("identity", () => {
    it("has chunkerId equal to 'markdown-heading'", () => {
      expect(markdownChunker.chunkerId).toBe("markdown-heading");
    });

    it("has chunkerVersion", () => {
      expect(markdownChunker.chunkerVersion).toBe("2");
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

  describe("heading text extraction", () => {
    it("includes inline-code spans in heading ancestry (not just plain text)", () => {
      // API docs wrap key terms in backticks. Dropping inlineCode nodes left
      // ancestry empty or garbled (e.g. "", " and ", ": Polling-Based Completion").
      const md =
        "# Top\n\n## `MarkAsCompleted()`\n\nCall it.\n\n### `MarkAsFailed()` and `MarkAsCancelled()`\n\nFailure methods.\n\n#### `.Done()`: Polling-Based Completion\n\nPolling alternative.";
      const chunks = markdownChunker.chunk(DOC_ID, md);

      const completed = chunks.find((c) => c.headingAncestry.at(-1)?.text === "MarkAsCompleted()");
      expect(completed, "expected a chunk under `MarkAsCompleted()`").toBeDefined();

      const failed = chunks.find(
        (c) => c.headingAncestry.at(-1)?.text === "MarkAsFailed() and MarkAsCancelled()",
      );
      expect(failed, "expected a chunk under `MarkAsFailed() and MarkAsCancelled()`").toBeDefined();

      const done = chunks.find(
        (c) => c.headingAncestry.at(-1)?.text === ".Done(): Polling-Based Completion",
      );
      expect(done, "expected a chunk under `.Done(): Polling-Based Completion`").toBeDefined();
    });

    it("extracts text from nested emphasis/strong/link phrasing", () => {
      const md = "# Top\n\n## **Bold** _and_ [linked](url) term\n\nBody text here.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      const chunk = chunks.find((c) => c.headingAncestry.at(-1)?.text === "Bold and linked term");
      expect(chunk).toBeDefined();
    });

    it("extracts footnote reference labels in heading ancestry", () => {
      // A footnote reference needs a matching definition to be recognized as a
      // FootnoteReference node rather than literal text.
      const md = "# Top\n\n## Cited notes[^1]\n\n[^1]: Definition.\n\nBody text here.";
      const chunks = markdownChunker.chunk(DOC_ID, md);
      const chunk = chunks.find((c) => c.headingAncestry.at(-1)?.text === "Cited notes1");
      expect(chunk).toBeDefined();
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

  describe("resolveMaxChunkChars", () => {
    it("returns the default when the variable is unset", () => {
      expect(resolveMaxChunkChars({})).toBe(DEFAULT_MAX_CHUNK_CHARS);
    });

    it("returns the default when the variable is empty", () => {
      expect(resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "" })).toBe(DEFAULT_MAX_CHUNK_CHARS);
    });

    it("accepts integers within the supported range", () => {
      expect(resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "200" })).toBe(200);
      expect(resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "32000" })).toBe(32000);
      expect(resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "100000" })).toBe(100000);
    });

    it("rejects non-integer values", () => {
      expect(() => resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "400.5" })).toThrow(
        EmbeddingConfigurationError,
      );
      expect(() => resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "big" })).toThrow(
        EmbeddingConfigurationError,
      );
    });

    it("rejects values below the floor", () => {
      expect(() => resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "199" })).toThrow(
        EmbeddingConfigurationError,
      );
    });

    it("rejects values above the ceiling", () => {
      expect(() => resolveMaxChunkChars({ EMBED_MAX_CHUNK_CHARS: "100001" })).toThrow(
        EmbeddingConfigurationError,
      );
    });
  });

  describe("configurable max chunk chars", () => {
    it("keeps the historical version at the default ceiling", () => {
      expect(createMarkdownChunker().chunkerVersion).toBe("2");
      expect(createMarkdownChunker(DEFAULT_MAX_CHUNK_CHARS).chunkerVersion).toBe("2");
    });

    it("encodes a non-default ceiling into the chunker version", () => {
      expect(createMarkdownChunker(8000).chunkerVersion).toBe("2:8000");
    });

    it("splits oversized sections into chunks no larger than the configured ceiling", () => {
      const para = "a".repeat(160) + ".";
      const md = "# Title\n\n" + para + "\n\n" + para + "\n\n" + para;
      const chunker = createMarkdownChunker(300);
      const chunks = chunker.chunk(DOC_ID, md);
      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(300);
        expect(chunk.headingAncestry.at(-1)?.text).toBe("Title");
      }
      const ordinals = chunks.map((c) => c.splitOrdinal);
      expect(ordinals).toEqual(ordinals.map((_, i) => i));
    });

    it("keeps a single paragraph larger than the ceiling as one chunk", () => {
      const md = "# Title\n\n" + "b".repeat(500);
      const chunker = createMarkdownChunker(300);
      const chunks = chunker.chunk(DOC_ID, md);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.content.length).toBe(500);
    });

    it("produces one chunk when content exactly matches the ceiling", () => {
      const body = "c".repeat(300);
      const md = "# Title\n\n" + body;
      const chunker = createMarkdownChunker(body.length);
      const chunks = chunker.chunk(DOC_ID, md);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]!.content).toBe(body);
    });
  });
});
