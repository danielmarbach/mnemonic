import { describe, it, expect, beforeEach } from "vitest";
import {
  buildGenerationFromFiles,
  validateAcceptedMediaTypes,
} from "../src/document-source-index.js";
import "../src/init-extractors.js";
import { markdownExtractor } from "../src/markdown-extractor.js";
import { markdownChunker } from "../src/markdown-chunker.js";
import { clearAllGenerations } from "../src/generation-storage.js";
import { getCurrentGeneration } from "../src/generation-storage.js";

function makeFile(path: string, content: string): { path: string; bytes: Uint8Array } {
  return { path, bytes: new TextEncoder().encode(content) };
}

describe("buildGenerationFromFiles", () => {
  beforeEach(() => {
    clearAllGenerations();
  });

  it("builds a generation from a simple markdown file", () => {
    const files = [makeFile("docs/readme.md", "# Hello World\n\nThis is a test document.")];
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(1);
    expect(result.chunkCount).toBeGreaterThanOrEqual(1);
    expect(result.skippedFiles).toEqual([]);
    expect(result.generationId).toContain("att-1::gen::");
  });

  it("publishes the generation so it can be retrieved", () => {
    const files = [makeFile("docs/test.md", "# Test\n\nContent here.")];
    buildGenerationFromFiles(
      "att-2",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "def456",
    );

    const current = getCurrentGeneration("att-2");
    expect(current).not.toBeNull();
    expect(current?.manifest.documentCount).toBe(1);
    expect(current?.manifest.indexedCommit).toBe("def456");
  });

  it("skips files that don't match the extractor detection", () => {
    const files = [
      makeFile("docs/readme.md", "# Hello"),
      makeFile("docs/data.json", '{"key": "value"}'),
    ];
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(1);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0].path).toBe("docs/data.json");
    expect(result.skippedFiles[0].reason).toContain("detection failed");
  });

  it("skips oversized files exceeding maxBytesPerFile", () => {
    // Create a file larger than 1 MB
    const largeContent = "x".repeat(1024 * 1024 + 1);
    const files = [makeFile("docs/large.md", largeContent)];
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(0);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0].reason).toContain("maxBytesPerFile");
  });

  it("skips files exceeding maxTrackedFiles", () => {
    // Create 5001 files (max is 5000)
    const files = Array.from({ length: 5001 }, (_, i) =>
      makeFile(`docs/file${i}.md`, `# File ${i}\n\nContent.`),
    );
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(5000);
    expect(result.skippedFiles).toHaveLength(1);
    expect(result.skippedFiles[0].reason).toContain("maxTrackedFiles");
  });

  it("handles files with YAML frontmatter", () => {
    const files = [
      makeFile(
        "docs/with-frontmatter.md",
        "---\ntitle: Test\ntags: [a, b]\n---\n\n# Actual Content\n\nBody text.",
      ),
    ];
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(1);
    expect(result.chunkCount).toBeGreaterThanOrEqual(1);
  });

  it("handles multiple markdown files", () => {
    const files = [
      makeFile("docs/intro.md", "# Introduction\n\nWelcome."),
      makeFile("docs/guide.md", "# Guide\n\nStep by step."),
      makeFile("docs/api.md", "# API Reference\n\nEndpoints."),
    ];
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(3);
    expect(result.chunkCount).toBeGreaterThanOrEqual(3);
  });

  it("generates a manifest with correct counts", () => {
    const files = [makeFile("docs/test.md", "# Test\n\nContent.")];
    const result = buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const current = getCurrentGeneration("att-1");
    expect(current?.manifest.documentCount).toBe(1);
    expect(current?.manifest.chunkCount).toBe(result.chunkCount);
    expect(current?.manifest.attachmentId).toBe("att-1");
    expect(current?.manifest.indexedCommit).toBe("abc123");
    expect(current?.manifest.extractorId).toBe("markdown");
    expect(current?.manifest.chunkerId).toBe("markdown-heading");
    expect(current?.manifest.sourceMediaTypeCounts["text/markdown"]).toBe(1);
  });

  it("handles empty file list", () => {
    const result = buildGenerationFromFiles(
      "att-1",
      [],
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    expect(result.documentCount).toBe(0);
    expect(result.chunkCount).toBe(0);
  });
});

describe("validateAcceptedMediaTypes", () => {
  it("returns supported for text/markdown", () => {
    const result = validateAcceptedMediaTypes(["text/markdown"]);
    expect(result.supported).toEqual(["text/markdown"]);
    expect(result.unsupported).toEqual([]);
  });

  it("returns unsupported for unknown media types", () => {
    const result = validateAcceptedMediaTypes(["application/pdf"]);
    expect(result.supported).toEqual([]);
    expect(result.unsupported).toEqual(["application/pdf"]);
  });

  it("handles mixed supported and unsupported", () => {
    const result = validateAcceptedMediaTypes(["text/markdown", "application/pdf", "text/plain"]);
    expect(result.supported).toEqual(["text/markdown"]);
    expect(result.unsupported).toEqual(["application/pdf", "text/plain"]);
  });
});
