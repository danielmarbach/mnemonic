import type {
  RetrievalDocument,
  RetrievalChunk,
  DocumentGeneration,
  GenerationManifest,
  GenerationId,
  DocumentExtractor,
  DocumentChunker,
} from "./retrieval-document.js";
import { DOCUMENT_SOURCE_LIMITS } from "./retrieval-document.js";
import { deriveDocumentId } from "./retrieval-document.js";
import { registerExtractor } from "./document-extractor.js";
import { markdownExtractor } from "./markdown-extractor.js";

import { publishGeneration } from "./generation-storage.js";

// Register built-in extractors
registerExtractor(markdownExtractor);

// Simple build result for document-sync.ts compatibility
export interface SimpleBuildResult {
  generationId: string;
  documentCount: number;
  chunkCount: number;
  skippedFiles: Array<{ path: string; reason: string }>;
  errors: string[];
}

/**
 * Build a generation with positional parameters (used by document-sync.ts).
 */
export function buildGenerationFromFiles(
  attachmentId: string,
  files: Array<{ path: string; bytes: Uint8Array }>,
  acceptedMediaTypes: string[],
  extractor: DocumentExtractor,
  chunker: DocumentChunker,
  indexedCommit: string,
): SimpleBuildResult {
  const errors: string[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const documents = new Map<string, RetrievalDocument>();
  const chunks: RetrievalChunk[] = [];
  const sourceBytes = new Map<string, Uint8Array>();
  const extractedText = new Map<string, string>();

  let fileCount = 0;
  for (const file of files) {
    if (fileCount >= DOCUMENT_SOURCE_LIMITS.maxTrackedFiles) {
      skipped.push({ path: file.path, reason: "maxTrackedFiles exceeded" });
      continue;
    }

    if (file.bytes.length > DOCUMENT_SOURCE_LIMITS.maxBytesPerFile) {
      skipped.push({ path: file.path, reason: "maxBytesPerFile exceeded" });
      continue;
    }

    if (!extractor.detect(file.path, file.bytes)) {
      skipped.push({ path: file.path, reason: "extractor detection failed" });
      continue;
    }

    const documentId = deriveDocumentId(attachmentId, file.path);
    const extraction = extractor.extract(file.path, file.bytes, "utf-8");

    if (extraction.content.length > DOCUMENT_SOURCE_LIMITS.maxExtractedTextPerFile) {
      skipped.push({ path: file.path, reason: "maxExtractedTextPerFile exceeded" });
      continue;
    }

    const doc: RetrievalDocument = {
      documentId,
      sourcePath: file.path,
      blobOid: "",
      byteSize: file.bytes.length,
      sourceMediaType: extractor.sourceMediaType,
      encoding: "utf-8",
      extractedContentMediaType: extractor.extractedContentMediaType,
      extractionMetadata: extraction.metadata,
    };

    documents.set(documentId, doc);
    sourceBytes.set(documentId, file.bytes);
    extractedText.set(documentId, extraction.content);

    const docChunks = chunker.chunk(documentId, extraction.content);
    for (const chunk of docChunks) {
      if (chunks.length >= DOCUMENT_SOURCE_LIMITS.maxTotalChunks) {
        skipped.push({ path: file.path, reason: "maxTotalChunks exceeded" });
        break;
      }
      chunks.push(chunk);
    }

    fileCount++;
  }

  const chunkMap = new Map<string, RetrievalChunk>();
  for (const chunk of chunks) {
    chunkMap.set(chunk.chunkId, chunk);
  }

  const generationId = `${attachmentId}::gen::${Date.now()}`;

  const manifest: GenerationManifest = {
    generationId: generationId as GenerationId,
    attachmentId,
    indexedCommit,
    extractorId: extractor.extractorId,
    extractorVersion: extractor.extractorVersion,
    extractorOptionsHash: "default",
    chunkerId: chunker.chunkerId,
    chunkerVersion: chunker.chunkerVersion,
    chunkerOptionsHash: "default",
    projectionSchemaVersion: "1",
    indexSchemaVersion: "1",
    embeddingCompatibilityIdentity: `${extractor.extractorId}::${extractor.extractorVersion}::${chunker.chunkerId}::${chunker.chunkerVersion}`,
    sourceMediaTypeCounts: { [extractor.sourceMediaType]: documents.size },
    documentCount: documents.size,
    chunkCount: chunkMap.size,
    skippedFiles: skipped.map((s) => ({ path: s.path, reason: s.reason })),
    builtAt: new Date().toISOString(),
  };

  const generation: DocumentGeneration = {
    manifest,
    documents,
    chunks: chunkMap,
    sourceBytes,
    extractedText,
  };

  publishGeneration(attachmentId, generation);

  return {
    generationId,
    documentCount: documents.size,
    chunkCount: chunkMap.size,
    skippedFiles: skipped,
    errors,
  };
}

// Re-export for convenience
export { validateAcceptedMediaTypes } from "./document-extractor.js";
