import type { Brand } from "./brands.js";

// Branded types for document and chunk IDs
export type DocumentId = Brand<string, "DocumentId">;
export type ChunkId = Brand<string, "ChunkId">;
export type GenerationId = Brand<string, "GenerationId">;
export type AttachmentId = Brand<string, "AttachmentId">;

// A single tracked document from a document-source attachment
export interface RetrievalDocument {
  documentId: DocumentId;
  sourcePath: string; // root-relative POSIX path
  blobOid: string; // git blob OID
  byteSize: number;
  sourceMediaType: string; // e.g., "text/markdown"
  encoding: string; // e.g., "utf-8"
  extractedContentMediaType: string; // e.g., "text/markdown" (extractor output)
  extractionMetadata: Record<string, unknown>;
}

// A chunk of a document for retrieval
export interface RetrievalChunk {
  chunkId: ChunkId;
  documentId: DocumentId;
  headingAncestry: Array<{ depth: number; text: string }>;
  content: string;
  splitOrdinal: number; // ordinal within a heading section after splitting
  contentMediaType: string; // e.g., "text/markdown"
  excerpt: string; // short preview for recall results
}

// Complete invalidation identity for a generation
export interface GenerationManifest {
  generationId: GenerationId;
  attachmentId: string;
  indexedCommit: string; // git commit hash
  extractorId: string;
  extractorVersion: string;
  extractorOptionsHash: string;
  chunkerId: string;
  chunkerVersion: string;
  chunkerOptionsHash: string;
  projectionSchemaVersion: string;
  indexSchemaVersion: string;
  embeddingCompatibilityIdentity: string;
  sourceMediaTypeCounts: Record<string, number>;
  documentCount: number;
  chunkCount: number;
  skippedFiles: Array<{ path: string; reason: string }>;
  builtAt: string; // ISO 8601
}

// A coherent generation of derived state for one attachment
export interface DocumentGeneration {
  manifest: GenerationManifest;
  documents: Map<string, RetrievalDocument>; // documentId -> document
  chunks: Map<string, RetrievalChunk>; // chunkId -> chunk
  sourceBytes: Map<string, Uint8Array>; // documentId -> raw source bytes
  extractedText: Map<string, string>; // documentId -> extracted text
}

// Extractor contract: detects source representation and extracts content
export interface DocumentExtractor {
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly sourceMediaType: string;
  readonly extractedContentMediaType: string;
  detect(filePath: string, bytes: Uint8Array): boolean;
  extract(
    filePath: string,
    bytes: Uint8Array,
    encoding: string,
  ): { content: string; metadata: Record<string, unknown> };
}

// Chunker contract: splits extracted content into chunks
export interface DocumentChunker {
  readonly chunkerId: string;
  readonly chunkerVersion: string;
  readonly chunkContentMediaType: string;
  chunk(documentId: DocumentId, content: string): RetrievalChunk[];
}

// Limits (configurable constants with sensible defaults)
export const DOCUMENT_SOURCE_LIMITS = {
  maxTrackedFiles: 5000,
  maxBytesPerFile: 1024 * 1024, // 1 MB
  maxExtractedTextPerFile: 512 * 1024, // 512 KB
  maxChunksPerDocument: 200,
  maxTotalChunks: 50000,
  maxEmbeddingWork: 10000, // max chunks to embed per sync
} as const;

// Helper: normalize a path or heading text into a slug-safe form.
// Shared by deriveDocumentId, deriveChunkId, and buildDocumentRef.
export function normalizePathToSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

// Helper: derive document ID from attachment ID + normalized path
export function deriveDocumentId(attachmentId: string, rootRelativePath: string): DocumentId {
  const normalized = normalizePathToSlug(rootRelativePath);
  return `${attachmentId}::${normalized}` as DocumentId;
}

// Helper: derive chunk ID from document ID + heading ancestry + split ordinal
export function deriveChunkId(
  documentId: DocumentId,
  headingAncestry: Array<{ depth: number; text: string }>,
  duplicateHeadingOccurrence: number,
  splitOrdinal: number,
): ChunkId {
  const headingPart = headingAncestry.map((h) => normalizePathToSlug(h.text)).join("::");
  return `${documentId}::${headingPart}::${duplicateHeadingOccurrence}::${splitOrdinal}` as ChunkId;
}
