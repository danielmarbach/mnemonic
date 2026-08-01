import { getCurrentGeneration } from "./generation-storage.js";
import type { RetrievalChunk } from "./retrieval-document.js";
import type { ProjectAttachmentConfig } from "./vault.js";

import { computeLexicalScore } from "./lexical.js";

// Helper to get all chunks from a generation
function getAllChunks(attachmentId: string): RetrievalChunk[] {
  const generation = getCurrentGeneration(attachmentId);
  if (!generation) return [];
  return Array.from(generation.chunks.values());
}

export interface DocumentChunkRecallResult {
  kind: "document-chunk";
  chunkId: string;
  documentId: string;
  sourcePath: string;
  headingAncestry: Array<{ depth: number; text: string }>;
  excerpt: string;
  contentMediaType: string;
  attachmentId: string;
  generationId: string;
  indexedCommit: string;
  score: number;
}

/**
 * Collect document-chunk candidates from document-source attachments for a recall query.
 * Applies per-document chunk cap and scores using lexical matching.
 *
 * @param attachmentIds - List of attachment IDs to search
 * @param query - The recall query
 * @param limit - Maximum number of results to return
 * @returns Scored document-chunk results
 */
export function collectDocumentChunkCandidates(
  attachmentIds: string[],
  query: string,
  limit: number,
): DocumentChunkRecallResult[] {
  if (limit <= 0) return [];

  const candidates: DocumentChunkRecallResult[] = [];
  const maxChunksPerDocument = 5; // per-document chunk cap

  for (const attachmentId of attachmentIds) {
    const generation = getCurrentGeneration(attachmentId);
    if (!generation) continue;

    const chunks = getAllChunks(attachmentId);
    for (const chunk of chunks) {
      // Score using lexical matching before applying the per-document cap. A
      // document's early chunks may have weak bigram-only matches that should
      // not hide a later chunk with a much stronger exact match.
      const score = computeLexicalScore(query, chunk.content);
      if (score <= 0) continue;

      candidates.push({
        kind: "document-chunk",
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        sourcePath: generation.documents.get(chunk.documentId)?.sourcePath ?? chunk.documentId,
        headingAncestry: chunk.headingAncestry,
        excerpt: chunk.excerpt,
        contentMediaType: chunk.contentMediaType,
        attachmentId,
        generationId: generation.manifest.generationId,
        indexedCommit: generation.manifest.indexedCommit,
        score,
      });
    }
  }

  // Rank globally first, then cap each document's contribution. Applying the
  // cap while iterating chunks makes document order determine which matches
  // survive instead of relevance.
  candidates.sort((a, b) => b.score - a.score);
  const results: DocumentChunkRecallResult[] = [];
  const perDocumentCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const docCount = perDocumentCounts.get(candidate.documentId) ?? 0;
    if (docCount >= maxChunksPerDocument) continue;

    perDocumentCounts.set(candidate.documentId, docCount + 1);
    results.push(candidate);
    if (results.length >= limit) break;
  }

  return results;
}

/**
 * Get all attachment IDs for document-source attachments from the config.
 * This is a helper to be called from the recall handler.
 */
export function getDocumentSourceAttachmentIds(
  attachmentConfigs: Pick<ProjectAttachmentConfig, "kind" | "attachmentId" | "enabled">[],
): string[] {
  return attachmentConfigs
    .filter((a) => a.kind === "document-source" && a.enabled)
    .map((a) => a.attachmentId);
}
