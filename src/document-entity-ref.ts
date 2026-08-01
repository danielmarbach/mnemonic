import type { DocumentId, ChunkId } from "./retrieval-document.js";
import { normalizePathToSlug } from "./retrieval-document.js";

// Namespace delimiters for entity references
const DOC_PREFIX = "doc:";
const CHUNK_PREFIX = "chunk:";

// Parsed document entity reference (doc: prefix)
export interface DocumentEntityRef {
  kind: "document";
  documentId: DocumentId;
  raw: string;
}

// Parsed chunk entity reference (chunk: prefix)
export interface ChunkEntityRef {
  kind: "chunk";
  documentId: DocumentId;
  chunkId: ChunkId;
  raw: string;
}

// Parsed memory entity reference (existing Mnemonic memory)
export interface MemoryEntityRef {
  kind: "memory";
  memoryId: string;
  raw: string;
}

// Parsed unknown entity reference
export interface UnknownEntityRef {
  kind: "unknown";
  raw: string;
}

export type EntityRef = DocumentEntityRef | ChunkEntityRef | MemoryEntityRef | UnknownEntityRef;

/**
 * Check if an ID string looks like a document entity reference.
 */
export function isDocumentEntityRef(id: string): boolean {
  return id.startsWith(DOC_PREFIX) || id.startsWith(CHUNK_PREFIX);
}

/**
 * Check if an ID string looks like a chunk entity reference.
 */
export function isChunkEntityRef(id: string): boolean {
  return id.startsWith(CHUNK_PREFIX);
}

/**
 * Parse an entity reference string into its structured form.
 * Returns unknown for unrecognized patterns.
 */
export function parseEntityRef(id: string): EntityRef {
  if (id.startsWith(CHUNK_PREFIX)) {
    // Handle format: chunk:<chunkId>, where the chunkId itself does NOT carry the
    // prefix. chunkId = <documentId>::<headingAncestry>::<occurrence>::<ordinal>,
    // and documentId = <attachmentId>::<normalizedPath> (exactly one "::").
    // The documentId is therefore the first two "::"-delimited segments.
    const chunkId = id.slice(CHUNK_PREFIX.length);
    const parts = chunkId.split("::");
    if (parts.length < 2) {
      return { kind: "unknown", raw: id };
    }
    const documentId = `${parts[0]}::${parts[1]}` as DocumentId;
    return {
      kind: "chunk",
      documentId,
      chunkId: chunkId as ChunkId,
      raw: id,
    };
  }

  if (id.startsWith(DOC_PREFIX)) {
    const documentId = id.slice(DOC_PREFIX.length) as DocumentId;
    return {
      kind: "document",
      documentId,
      raw: id,
    };
  }

  // Check if it matches the memory ID pattern (alphanumeric, underscore, hyphen)
  if (/^[a-zA-Z0-9_-]+$/.test(id)) {
    return { kind: "memory", memoryId: id, raw: id };
  }

  return { kind: "unknown", raw: id };
}

/**
 * Resolve an entity reference to determine if it's a document, chunk, memory, or unknown.
 * Returns the kind classification without performing any storage lookup.
 */
export function classifyEntityRef(id: string): "document" | "chunk" | "memory" | "unknown" {
  if (id.startsWith(CHUNK_PREFIX)) return "chunk";
  if (id.startsWith(DOC_PREFIX)) return "document";
  if (/^[a-zA-Z0-9_-]+$/.test(id)) return "memory";
  return "unknown";
}

/**
 * Build a document entity reference string from an attachment ID and path.
 */
export function buildDocumentRef(attachmentId: string, rootRelativePath: string): string {
  const normalized = normalizePathToSlug(rootRelativePath);
  return `${DOC_PREFIX}${attachmentId}::${normalized}`;
}

/**
 * Build a chunk entity reference string from a chunk ID.
 */
export function buildChunkRef(chunkId: string): string {
  return `${CHUNK_PREFIX}${chunkId}`;
}
