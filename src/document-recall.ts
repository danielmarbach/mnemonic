import { getCurrentGeneration } from "./generation-storage.js";
import type { RetrievalChunk } from "./retrieval-document.js";
import type { ProjectAttachmentConfig } from "./vault.js";

import { computeLexicalScore } from "./lexical.js";

// Heading ancestry and the source path are high-signal retrieval cues (they are
// where API terms like `MarkAsCompleted` most reliably appear) but they are
// stored separately from chunk content and were previously never scored. We
// score each surface independently and combine with weights that keep content
// as the primary signal while letting navigation-style queries (matching
// headings/paths rather than body prose) surface relevant chunks.
const CONTENT_SCORE_WEIGHT = 0.5;
const HEADING_SCORE_WEIGHT = 0.35;
const PATH_SCORE_WEIGHT = 0.15;

function joinHeadingAncestry(headingAncestry: Array<{ depth: number; text: string }>): string {
  return headingAncestry.map((h) => h.text).join(" / ");
}

/**
 * Composite lexical score over a chunk's content, heading ancestry, and source
 * path. Each surface is scored with `computeLexicalScore` and combined with
 * fixed weights so a match in any surface can promote the chunk.
 */
function scoreDocumentChunk(query: string, chunk: RetrievalChunk, sourcePath: string): number {
  const contentScore = computeLexicalScore(query, chunk.content);
  const headingScore = computeLexicalScore(query, joinHeadingAncestry(chunk.headingAncestry));
  const pathScore = computeLexicalScore(query, sourcePath);
  return (
    CONTENT_SCORE_WEIGHT * contentScore +
    HEADING_SCORE_WEIGHT * headingScore +
    PATH_SCORE_WEIGHT * pathScore
  );
}

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
      // Score using composite lexical matching over content, heading ancestry,
      // and source path before applying the per-document cap. A document's
      // early chunks may have weak bigram-only matches that should not hide a
      // later chunk with a much stronger exact match.
      const sourcePath = generation.documents.get(chunk.documentId)?.sourcePath ?? chunk.documentId;
      const score = scoreDocumentChunk(query, chunk, sourcePath);
      if (score <= 0) continue;

      candidates.push({
        kind: "document-chunk",
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        sourcePath,
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
