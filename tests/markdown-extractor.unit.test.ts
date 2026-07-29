import { describe, it, expect } from "vitest";
import { markdownExtractor } from "../src/markdown-extractor.js";

describe("markdownExtractor", () => {
  describe("detect", () => {
    it("returns true for .md files", () => {
      expect(markdownExtractor.detect("README.md", new Uint8Array())).toBe(true);
    });

    it("returns true for .markdown files", () => {
      expect(markdownExtractor.detect("CHANGELOG.markdown", new Uint8Array())).toBe(true);
    });

    it("returns true for .mdown files", () => {
      expect(markdownExtractor.detect("doc.mdown", new Uint8Array())).toBe(true);
    });

    it("returns true for .mdwn files", () => {
      expect(markdownExtractor.detect("doc.mdwn", new Uint8Array())).toBe(true);
    });

    it("returns true for .mkd files", () => {
      expect(markdownExtractor.detect("doc.mkd", new Uint8Array())).toBe(true);
    });

    it("returns true for .mkdn files", () => {
      expect(markdownExtractor.detect("doc.mkdn", new Uint8Array())).toBe(true);
    });

    it("returns false for .txt files", () => {
      expect(markdownExtractor.detect("notes.txt", new Uint8Array())).toBe(false);
    });

    it("returns false for .pdf files", () => {
      expect(markdownExtractor.detect("report.pdf", new Uint8Array())).toBe(false);
    });

    it("returns false for files without markdown extension", () => {
      expect(markdownExtractor.detect("Makefile", new Uint8Array())).toBe(false);
    });

    it("is case-insensitive for .MD extensions", () => {
      expect(markdownExtractor.detect("README.MD", new Uint8Array())).toBe(true);
    });
  });

  describe("extract", () => {
    it("returns content string from markdown bytes", () => {
      const bytes = new TextEncoder().encode("# Hello\n\nThis is a test.");
      const result = markdownExtractor.extract("test.md", bytes, "utf-8");
      expect(result.content).toBe("# Hello\n\nThis is a test.");
    });

    it("includes metadata with headingCount", () => {
      const bytes = new TextEncoder().encode("# Title\n\n## Sub\n\nContent.");
      const result = markdownExtractor.extract("test.md", bytes, "utf-8");
      expect(result.metadata).toBeDefined();
      expect(result.metadata.byteLength).toBe(bytes.length);
      expect(result.metadata.charLength).toBe("# Title\n\n## Sub\n\nContent.".length);
    });

    it("strips YAML frontmatter from extracted content", () => {
      const md = "---\ntitle: Test\nauthor: Me\n---\n\n# Real Content\n\nBody.";
      const bytes = new TextEncoder().encode(md);
      const result = markdownExtractor.extract("test.md", bytes, "utf-8");
      expect(result.content).not.toContain("title: Test");
      expect(result.content).toContain("# Real Content");
    });

    it("reports frontmatter keys in metadata when frontmatter is present", () => {
      const md = "---\ntitle: Test\nauthor: Me\n---\n\n# Content";
      const bytes = new TextEncoder().encode(md);
      const result = markdownExtractor.extract("test.md", bytes, "utf-8");
      expect(result.metadata.hasFrontmatter).toBe(true);
      expect(result.metadata.frontmatterKeys).toEqual(["title", "author"]);
    });

    it("reports hasFrontmatter false when no frontmatter", () => {
      const bytes = new TextEncoder().encode("# Just content");
      const result = markdownExtractor.extract("test.md", bytes, "utf-8");
      expect(result.metadata.hasFrontmatter).toBe(false);
      expect(result.metadata.frontmatterKeys).toEqual([]);
    });

    it("handles empty content", () => {
      const bytes = new TextEncoder().encode("");
      const result = markdownExtractor.extract("test.md", bytes, "utf-8");
      expect(result.content).toBe("");
      expect(result.metadata.byteLength).toBe(0);
    });
  });

  describe("identity", () => {
    it("has extractorId equal to 'markdown'", () => {
      expect(markdownExtractor.extractorId).toBe("markdown");
    });

    it("has sourceMediaType equal to 'text/markdown'", () => {
      expect(markdownExtractor.sourceMediaType).toBe("text/markdown");
    });

    it("has extractorVersion", () => {
      expect(markdownExtractor.extractorVersion).toBe("1");
    });

    it("has extractedContentMediaType equal to 'text/markdown'", () => {
      expect(markdownExtractor.extractedContentMediaType).toBe("text/markdown");
    });
  });
});
