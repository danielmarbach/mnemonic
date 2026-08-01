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
});
