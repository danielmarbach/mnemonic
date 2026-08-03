import { getCurrentGeneration } from "./generation-storage.js";
import type { RetrievalChunk } from "./retrieval-document.js";
import type { ProjectAttachmentConfig } from "./vault.js";

import { computeLexicalScore } from "./lexical.js";
import { safeCosineSimilarity } from "./embeddings.js";
import { assignDenseRanks } from "./recall.js";

// RRF constants mirror the note-ranking path (src/recall.ts) so chunk fused
// scores sit on the same scale and can be interleaved into the unified recall
// ranking (Stage 5).
const RRF_K = 60;
const RRF_SCALING_FACTOR = 3.0;
const MAX_CHUNKS_PER_DOCUMENT = 5; // per-document chunk cap

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
function getAllChunks(projectId: string, attachmentId: string): RetrievalChunk[] {
  const generation = getCurrentGeneration(projectId, attachmentId);
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
  /** Raw cosine similarity against the query vector, when available. */
  semanticScore?: number;
  /** Composite lexical score over content, heading ancestry, and source path. */
  lexicalScore?: number;
}

/**
 * Internal working item for chunk ranking: the chunk plus its per-channel
 * scores and (once assigned) per-channel dense ranks.
 */
interface ChunkCandidate {
  chunk: RetrievalChunk;
  sourcePath: string;
  attachmentId: string;
  generationId: string;
  indexedCommit: string;
  lexicalScore: number;
  semanticScore?: number;
  semanticRank?: number;
  lexicalRank?: number;
}

/**
 * Reciprocal-rank fusion over the available channels, mirroring the note path.
 * Missing channels contribute zero; the result is scaled identically to
 * `computeHybridScore` so note and chunk scores remain comparable.
 */
function computeChunkFusedScore(candidate: ChunkCandidate): number {
  const semanticContribution =
    candidate.semanticRank !== undefined ? 1 / (RRF_K + candidate.semanticRank) : 0;
  const lexicalContribution =
    candidate.lexicalRank !== undefined ? 1 / (RRF_K + candidate.lexicalRank) : 0;
  return (semanticContribution + lexicalContribution) * RRF_SCALING_FACTOR;
}

/**
 * Collect document-chunk candidates from document-source attachments for a
 * recall query. When a query embedding is available, chunks with persisted
 * embeddings are scored semantically and fused with the lexical composite via
 * reciprocal-rank fusion; otherwise (or when no chunk embedding exists) the
 * lexical composite is used alone.
 *
 * Applies a per-document chunk cap and a global result limit.
 *
 * @param projectId - The consuming project's ID (for project-scoped routing)
 * @param attachmentIds - List of attachment IDs to search
 * @param query - The recall query
 * @param limit - Maximum number of results to return
 * @param queryVec - Query embedding vector, or null when embedding is unavailable
 * @returns Scored document-chunk results
 */
export function collectDocumentChunkCandidates(
  projectId: string,
  attachmentIds: string[],
  query: string,
  limit: number,
  queryVec: number[] | null = null,
): DocumentChunkRecallResult[] {
  if (limit <= 0) return [];

  const candidates: ChunkCandidate[] = [];

  for (const attachmentId of attachmentIds) {
    const generation = getCurrentGeneration(projectId, attachmentId);
    if (!generation) continue;

    const chunks = getAllChunks(projectId, attachmentId);
    for (const chunk of chunks) {
      // Score using composite lexical matching over content, heading ancestry,
      // and source path. A document's early chunks may have weak bigram-only
      // matches that should not hide a later chunk with a much stronger exact
      // match, so candidate admission happens before the per-document cap.
      const sourcePath = generation.documents.get(chunk.documentId)?.sourcePath ?? chunk.documentId;
      const lexicalScore = scoreDocumentChunk(query, chunk, sourcePath);

      // Semantic score only when the query vector and a persisted chunk
      // embedding both exist. `safeCosineSimilarity` returns undefined on
      // dimension mismatch, which is treated as "no semantic evidence".
      let semanticScore: number | undefined;
      if (queryVec) {
        const embedding = generation.chunkEmbeddings.get(chunk.chunkId);
        if (embedding) {
          semanticScore = safeCosineSimilarity(queryVec, embedding.embedding);
        }
      }

      if (lexicalScore <= 0 && (semanticScore === undefined || semanticScore <= 0)) continue;

      candidates.push({
        chunk,
        sourcePath,
        attachmentId,
        generationId: generation.manifest.generationId,
        indexedCommit: generation.manifest.indexedCommit,
        lexicalScore,
        semanticScore,
      });
    }
  }

  // Assign dense ranks per channel, mirroring the note path. Only chunks with
  // evidence in a channel participate in that channel's ranking; the rest keep
  // an undefined rank (zero RRF contribution). A chunk gets a semantic rank only
  // when it is POSITIVELY correlated with the query — anti-correlated or
  // zero-cosine chunks contribute nothing to the semantic channel (matching the
  // note path's minSimilarity gate), so a weak lexical match cannot earn a
  // spurious RRF boost from a negative embedding score. Sorts are stable via
  // the chunkId tie-break so ranking is deterministic.
  const semanticRanked = candidates
    .filter(
      (c): c is ChunkCandidate & { semanticScore: number } =>
        c.semanticScore !== undefined && c.semanticScore > 0,
    )
    .sort(
      (a, b) => b.semanticScore - a.semanticScore || a.chunk.chunkId.localeCompare(b.chunk.chunkId),
    );
  assignDenseRanks(
    semanticRanked,
    (c) => c.semanticScore,
    (c, rank) => {
      c.semanticRank = rank;
    },
  );

  const lexicalRanked = candidates
    .filter((c) => c.lexicalScore > 0)
    .sort(
      (a, b) => b.lexicalScore - a.lexicalScore || a.chunk.chunkId.localeCompare(b.chunk.chunkId),
    );
  assignDenseRanks(
    lexicalRanked,
    (c) => c.lexicalScore,
    (c, rank) => {
      c.lexicalRank = rank;
    },
  );

  // Rank globally first, then cap each document's contribution. Applying the
  // cap while iterating chunks makes document order determine which matches
  // survive instead of relevance.
  candidates.sort(
    (a, b) =>
      computeChunkFusedScore(b) - computeChunkFusedScore(a) ||
      a.chunk.chunkId.localeCompare(b.chunk.chunkId),
  );
  const results: DocumentChunkRecallResult[] = [];
  const perDocumentCounts = new Map<string, number>();
  for (const candidate of candidates) {
    const docCount = perDocumentCounts.get(candidate.chunk.documentId) ?? 0;
    if (docCount >= MAX_CHUNKS_PER_DOCUMENT) continue;

    perDocumentCounts.set(candidate.chunk.documentId, docCount + 1);
    results.push({
      kind: "document-chunk",
      chunkId: candidate.chunk.chunkId,
      documentId: candidate.chunk.documentId,
      sourcePath: candidate.sourcePath,
      headingAncestry: candidate.chunk.headingAncestry,
      excerpt: candidate.chunk.excerpt,
      contentMediaType: candidate.chunk.contentMediaType,
      attachmentId: candidate.attachmentId,
      generationId: candidate.generationId,
      indexedCommit: candidate.indexedCommit,
      score: computeChunkFusedScore(candidate),
      semanticScore: candidate.semanticScore,
      lexicalScore: candidate.lexicalScore,
    });
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
