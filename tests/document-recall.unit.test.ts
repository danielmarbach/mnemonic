import { beforeEach, describe, expect, it } from "vitest";
import { collectDocumentChunkCandidates } from "../src/document-recall.js";
import { buildGenerationFromFiles } from "../src/document-source-index.js";
import { clearAllGenerations } from "../src/generation-storage.js";
import { markdownChunker } from "../src/markdown-chunker.js";
import { markdownExtractor } from "../src/markdown-extractor.js";

function makeFile(path: string, content: string): { path: string; bytes: Uint8Array } {
  return { path, bytes: new TextEncoder().encode(content) };
}

describe("collectDocumentChunkCandidates", () => {
  beforeEach(() => {
    clearAllGenerations();
  });

  it("does not let early weak matches hide a later exact match", () => {
    const sections = Array.from(
      { length: 6 },
      (_, index) => `## Section ${index}\n\nThis component contains general documentation.`,
    ).join("\n\n");
    const files = [
      makeFile(
        "docs/components.md",
        `# Components\n\n${sections}\n\n## Runner\n\nThe ComponentRunner starts the test component.`,
      ),
    ];

    buildGenerationFromFiles(
      "att-1",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const results = collectDocumentChunkCandidates(["att-1"], "ComponentRunner", 1);

    expect(results).toHaveLength(1);
    expect(results[0]?.excerpt).toContain("ComponentRunner");
  });

  it("scores heading ancestry so navigation-style queries surface the right chunk", () => {
    // Query terms appear in a heading wrapped in backticks, not in body prose.
    // Without heading scoring the chunk would not match.
    const files = [
      makeFile(
        "docs/api.md",
        "# API\n\n## `MarkAsFailed()` and `MarkAsCancelled()`\n\nFailure methods for tests.",
      ),
    ];
    buildGenerationFromFiles(
      "att-2",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const results = collectDocumentChunkCandidates(
      ["att-2"],
      "MarkAsFailed MarkAsCancelled failure methods",
      5,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.headingAncestry.at(-1)?.text).toBe("MarkAsFailed() and MarkAsCancelled()");
  });

  it("scores source path so path-oriented queries surface the document", () => {
    // Query terms appear only in the file path, not body or headings.
    const files = [
      makeFile(
        "nservicebus-acceptancetesting.md",
        "# Acceptance Testing\n\nGeneral overview content without the search term.",
      ),
    ];
    buildGenerationFromFiles(
      "att-3",
      files,
      ["text/markdown"],
      markdownExtractor,
      markdownChunker,
      "abc123",
    );

    const results = collectDocumentChunkCandidates(["att-3"], "nservicebus acceptancetesting", 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.sourcePath).toBe("nservicebus-acceptancetesting.md");
  });
});
