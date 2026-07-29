import type { DocumentChunker, RetrievalChunk, DocumentId } from "./retrieval-document.js";
import { deriveChunkId } from "./retrieval-document.js";
import { parseBody, serializeBody } from "./markdown-ast.js";
import type { Root, Heading, Content } from "mdast";

const MAX_CHUNK_CHARS = 4000;
const MIN_CHUNK_CHARS = 50;

interface HeadingContext {
  depth: number;
  text: string;
  occurrence: number;
}

function getHeadingText(node: Heading): string {
  return node.children
    .filter((c): c is { type: "text"; value: string } => c.type === "text")
    .map((c) => c.value)
    .join("");
}

function isHeadingNode(node: unknown): node is Heading {
  return typeof node === "object" && node !== null && (node as { type: string }).type === "heading";
}

function buildAncestry(stack: HeadingContext[]): Array<{ depth: number; text: string }> {
  return stack.map((h) => ({ depth: h.depth, text: h.text }));
}

function splitOversizedContent(
  content: string,
  documentId: string,
  headingAncestry: Array<{ depth: number; text: string }>,
  duplicateHeadingOccurrence: number,
): RetrievalChunk[] {
  const chunks: RetrievalChunk[] = [];
  if (content.length <= MAX_CHUNK_CHARS) {
    const excerpt = content.slice(0, 200).trim();
    chunks.push({
      chunkId: deriveChunkId(documentId, headingAncestry, duplicateHeadingOccurrence, 0),
      documentId: documentId as DocumentId,
      headingAncestry,
      content,
      splitOrdinal: 0,
      contentMediaType: "text/markdown",
      excerpt: excerpt.length > 0 ? excerpt : content.slice(0, 200).trim(),
    });
    return chunks;
  }

  const paragraphs = content.split(/\n\n+/);
  let currentChunk = "";
  let ordinal = 0;

  for (const para of paragraphs) {
    const candidate = currentChunk ? currentChunk + "\n\n" + para : para;
    if (candidate.length > MAX_CHUNK_CHARS && currentChunk.length > 0) {
      const chunkText = currentChunk.trim();
      chunks.push({
        chunkId: deriveChunkId(documentId, headingAncestry, duplicateHeadingOccurrence, ordinal),
        documentId: documentId as DocumentId,
        headingAncestry,
        content: chunkText,
        splitOrdinal: ordinal,
        contentMediaType: "text/markdown",
        excerpt: chunkText.slice(0, 200).trim(),
      });
      ordinal++;
      currentChunk = para;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push({
      chunkId: deriveChunkId(documentId, headingAncestry, duplicateHeadingOccurrence, ordinal),
      documentId: documentId as DocumentId,
      headingAncestry,
      content: currentChunk.trim(),
      splitOrdinal: ordinal,
      contentMediaType: "text/markdown",
      excerpt: currentChunk.trim().slice(0, 200).trim(),
    });
  }

  return chunks;
}

export const markdownChunker: DocumentChunker = {
  chunkerId: "markdown-heading",
  chunkerVersion: "1",
  chunkContentMediaType: "text/markdown",

  chunk(documentId: string, content: string): RetrievalChunk[] {
    const tree: Root = parseBody(content);
    const chunks: RetrievalChunk[] = [];
    const headingStack: HeadingContext[] = [];
    const headingOccurrenceMap = new Map<string, number>();

    const introContent: Content[] = [];
    let firstHeadingFound = false;
    let currentSectionChildren: Content[] = [];
    let currentHeadingOccurrence = 0;

    for (const child of tree.children) {
      if (isHeadingNode(child)) {
        // Flush previous section
        if (firstHeadingFound && currentSectionChildren.length > 0) {
          const sectionTree: Root = { type: "root", children: currentSectionChildren };
          const sectionText = serializeBody(sectionTree);
          const trimmed = sectionText.trim();
          if (trimmed.length > 0) {
            const ancestry = buildAncestry(headingStack);
            chunks.push(
              ...splitOversizedContent(trimmed, documentId, ancestry, currentHeadingOccurrence),
            );
          }
        } else if (!firstHeadingFound && introContent.length > 0) {
          const introTree: Root = { type: "root", children: introContent };
          const introText = serializeBody(introTree).trim();
          if (introText.length >= MIN_CHUNK_CHARS) {
            chunks.push({
              chunkId: deriveChunkId(documentId, [], 0, 0),
              documentId: documentId as DocumentId,
              headingAncestry: [],
              content: introText,
              splitOrdinal: 0,
              contentMediaType: "text/markdown",
              excerpt: introText.slice(0, 200).trim(),
            });
          }
        }

        firstHeadingFound = true;
        currentSectionChildren = [];

        const headingText = getHeadingText(child);
        while (headingStack.length > 0) {
          const last = headingStack[headingStack.length - 1];
          if (last === undefined || last.depth < child.depth) break;
          headingStack.pop();
        }

        const occurrenceKey = `${child.depth}:${headingText}`;
        const occurrence = headingOccurrenceMap.get(occurrenceKey) ?? 0;
        headingOccurrenceMap.set(occurrenceKey, occurrence + 1);

        headingStack.push({ depth: child.depth, text: headingText, occurrence });
        currentHeadingOccurrence = occurrence;
      } else {
        if (!firstHeadingFound) {
          introContent.push(child as Content);
        } else {
          currentSectionChildren.push(child as Content);
        }
      }
    }

    // Flush last section
    if (firstHeadingFound && currentSectionChildren.length > 0) {
      const sectionTree: Root = { type: "root", children: currentSectionChildren };
      const sectionText = serializeBody(sectionTree).trim();
      if (sectionText.length > 0) {
        const ancestry = buildAncestry(headingStack);
        chunks.push(
          ...splitOversizedContent(sectionText, documentId, ancestry, currentHeadingOccurrence),
        );
      }
    } else if (!firstHeadingFound && introContent.length > 0) {
      const introTree: Root = { type: "root", children: introContent };
      const introText = serializeBody(introTree).trim();
      chunks.push(...splitOversizedContent(introText, documentId, [], 0));
    }

    return chunks;
  },
};
