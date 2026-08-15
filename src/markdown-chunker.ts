import type { DocumentChunker, RetrievalChunk, DocumentId } from "./retrieval-document.js";
import { deriveChunkId } from "./retrieval-document.js";
import { parseBody, serializeBody } from "./markdown-ast.js";
import { EmbeddingConfigurationError } from "./domain-errors.js";
import type { Root, Heading, Content, PhrasingContent } from "mdast";

export const DEFAULT_MAX_CHUNK_CHARS = 4000;
const MIN_CHUNK_CHARS = 50;
const MIN_CONFIGURABLE_MAX_CHUNK_CHARS = 200;
const MAX_CONFIGURABLE_MAX_CHUNK_CHARS = 100_000;

/**
 * Resolve the per-chunk character ceiling for document-source chunks from the
 * `EMBED_MAX_CHUNK_CHARS` environment variable. Embedding models differ in
 * context window (e.g. qwen3-embedding sizes vs nomic-embed-text-v2-moe), so
 * the ceiling is configurable. Fails fast on invalid input at startup.
 */
export function resolveMaxChunkChars(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env["EMBED_MAX_CHUNK_CHARS"];
  if (raw === undefined || raw === "") return DEFAULT_MAX_CHUNK_CHARS;
  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_CONFIGURABLE_MAX_CHUNK_CHARS ||
    parsed > MAX_CONFIGURABLE_MAX_CHUNK_CHARS
  ) {
    throw new EmbeddingConfigurationError(
      `EMBED_MAX_CHUNK_CHARS must be an integer between ${MIN_CONFIGURABLE_MAX_CHUNK_CHARS} and ${MAX_CONFIGURABLE_MAX_CHUNK_CHARS} (got '${raw}')`,
    );
  }
  return parsed;
}

/**
 * The chunker version is the invalidation signal for existing generations
 * (`isGenerationCurrent` and the lazy-load manifest check compare it). Version
 * "3" splits introductions that precede the first heading against the chunk
 * ceiling (previously emitted as a single unsplittable chunk), so existing
 * generations re-chunk once on the next sync. A non-default ceiling is encoded
 * as `3:<chars>` for the same reason.
 */
function chunkerVersionFor(maxChunkChars: number): string {
  return maxChunkChars === DEFAULT_MAX_CHUNK_CHARS ? "3" : `3:${maxChunkChars}`;
}

interface HeadingContext {
  depth: number;
  text: string;
  occurrence: number;
}

// Extract readable text from any mdast phrasing content node.
// Headings in API docs frequently wrap key terms in `inlineCode` (e.g.
// `### \`MarkAsCompleted()\``), `strong`, `emphasis`, or `link` nodes. Dropping
// those nodes left heading ancestry (and therefore chunk IDs and heading-based
// retrieval) empty or garbled (e.g. " and ", ": Polling-Based Completion").
function phrasingNodeText(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "html":
      return node.value;
    case "strong":
    case "emphasis":
    case "delete":
    case "link":
    case "linkReference":
      return node.children.map((child) => phrasingNodeText(child)).join("");
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "footnoteReference":
      return node.label ?? node.identifier ?? "";
    case "break":
      return " ";
    default: {
      // Exhaustiveness guard: if a future mdast release (or a remark plugin)
      // adds a new PhrasingContent member, this assignment fails to compile,
      // forcing a decision here rather than silently yielding empty headings.
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function getHeadingText(node: Heading): string {
  return node.children.map((child) => phrasingNodeText(child)).join("");
}

function isHeadingNode(node: unknown): node is Heading {
  return typeof node === "object" && node !== null && (node as { type: string }).type === "heading";
}

function buildAncestry(stack: HeadingContext[]): Array<{ depth: number; text: string }> {
  return stack.map((h) => ({ depth: h.depth, text: h.text }));
}

function splitOversizedContent(
  content: string,
  documentId: DocumentId,
  headingAncestry: Array<{ depth: number; text: string }>,
  duplicateHeadingOccurrence: number,
  maxChunkChars: number,
): RetrievalChunk[] {
  const chunks: RetrievalChunk[] = [];
  if (content.length <= maxChunkChars) {
    const excerpt = content.slice(0, 200).trim();
    chunks.push({
      chunkId: deriveChunkId(documentId, headingAncestry, duplicateHeadingOccurrence, 0),
      documentId,
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
    if (candidate.length > maxChunkChars && currentChunk.length > 0) {
      const chunkText = currentChunk.trim();
      chunks.push({
        chunkId: deriveChunkId(documentId, headingAncestry, duplicateHeadingOccurrence, ordinal),
        documentId,
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
      documentId,
      headingAncestry,
      content: currentChunk.trim(),
      splitOrdinal: ordinal,
      contentMediaType: "text/markdown",
      excerpt: currentChunk.trim().slice(0, 200).trim(),
    });
  }

  return chunks;
}

export function createMarkdownChunker(
  maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): DocumentChunker {
  return {
    chunkerId: "markdown-heading",
    chunkerVersion: chunkerVersionFor(maxChunkChars),
    chunkContentMediaType: "text/markdown",

    chunk(documentId: DocumentId, content: string): RetrievalChunk[] {
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
                ...splitOversizedContent(
                  trimmed,
                  documentId,
                  ancestry,
                  currentHeadingOccurrence,
                  maxChunkChars,
                ),
              );
            }
          } else if (!firstHeadingFound && introContent.length > 0) {
            const introTree: Root = { type: "root", children: introContent };
            const introText = serializeBody(introTree).trim();
            if (introText.length >= MIN_CHUNK_CHARS) {
              // Version 3: oversized intros are split against the ceiling like
              // every other section instead of being emitted as one chunk.
              chunks.push(...splitOversizedContent(introText, documentId, [], 0, maxChunkChars));
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
            ...splitOversizedContent(
              sectionText,
              documentId,
              ancestry,
              currentHeadingOccurrence,
              maxChunkChars,
            ),
          );
        }
      } else if (!firstHeadingFound && introContent.length > 0) {
        const introTree: Root = { type: "root", children: introContent };
        const introText = serializeBody(introTree).trim();
        chunks.push(...splitOversizedContent(introText, documentId, [], 0, maxChunkChars));
      }

      return chunks;
    },
  };
}

export const markdownChunker: DocumentChunker = createMarkdownChunker(resolveMaxChunkChars());
