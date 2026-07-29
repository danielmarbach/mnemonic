import type { DocumentExtractor } from "./retrieval-document.js";

/**
 * Markdown extractor for text/markdown source documents.
 * Detects markdown files by extension and content, extracts content as-is
 * (markdown is already text, so extraction is a pass-through).
 */
export const markdownExtractor: DocumentExtractor = {
  extractorId: "markdown",
  extractorVersion: "1",
  sourceMediaType: "text/markdown",
  extractedContentMediaType: "text/markdown",

  detect(filePath: string, _bytes: Uint8Array): boolean {
    // Detect by extension
    const lower = filePath.toLowerCase();
    return (
      lower.endsWith(".md") ||
      lower.endsWith(".markdown") ||
      lower.endsWith(".mdown") ||
      lower.endsWith(".mdwn") ||
      lower.endsWith(".mkd") ||
      lower.endsWith(".mkdn")
    );
  },

  extract(
    _filePath: string,
    bytes: Uint8Array,
    encoding: string,
  ): { content: string; metadata: Record<string, unknown> } {
    const decoder = new TextDecoder(encoding);
    const content = decoder.decode(bytes);

    // Detect YAML frontmatter and strip it for extraction
    // (frontmatter is metadata, not document content)
    let extractedContent = content;
    let frontmatter: Record<string, unknown> | undefined;

    if (content.startsWith("---")) {
      const endIndex = content.indexOf("---", 3);
      if (endIndex > 0) {
        const frontmatterStr = content.slice(3, endIndex).trim();
        extractedContent = content.slice(endIndex + 3).trimStart();
        // Parse simple YAML-like frontmatter (key: value pairs)
        frontmatter = {};
        for (const line of frontmatterStr.split("\n")) {
          const colonIndex = line.indexOf(":");
          if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            frontmatter[key] = value;
          }
        }
      }
    }

    return {
      content: extractedContent,
      metadata: {
        hasFrontmatter: frontmatter !== undefined,
        frontmatterKeys: frontmatter ? Object.keys(frontmatter) : [],
        byteLength: bytes.length,
        charLength: content.length,
        extractedLength: extractedContent.length,
      },
    };
  },
};
