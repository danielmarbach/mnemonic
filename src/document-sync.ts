import { simpleGit } from "simple-git";
import path from "path";
import { xxh128 } from "./hashing.js";
import { expandHomePath } from "./paths.js";
import { getExtractor } from "./document-extractor.js";
import { markdownChunker } from "./markdown-chunker.js";
import { buildGenerationFromFiles } from "./document-source-index.js";
import { getCurrentGeneration } from "./generation-storage.js";
import { matchAnyGlob } from "./glob-match.js";
import { DOCUMENT_SOURCE_LIMITS } from "./retrieval-document.js";
import type { DocumentGeneration, RetrievalChunk } from "./retrieval-document.js";
import { ChunkEmbeddingStorage } from "./chunk-embedding-storage.js";
import type { ChunkEmbeddingRecord } from "./chunk-embedding-storage.js";
import { attempt, getErrorMessage } from "./error-utils.js";
import {
  checkEmbeddingCompatibility,
  currentEmbeddingIdentity,
  embed,
  embeddingMetadata,
} from "./embeddings.js";
import { isoDateString } from "./brands.js";
import type { DocumentSourceAttachmentConfig } from "./vault.js";
import type { ServerContext } from "./server-context.js";

export interface DocumentSyncResult {
  attachmentId: string;
  projectSlug: string;
  indexedCommit: string;
  generationId: string;
  documentCount: number;
  chunkCount: number;
  skippedFiles: Array<{ path: string; reason: string }>;
  errors: string[];
  status: "indexed" | "unchanged" | "failed";
  message: string;
}

/**
 * Full embedding-compatibility identity: extractor + chunker + the current
 * embedding identity (provider + model + dimensions + metric). A change to any
 * component (e.g. a different embedding model) invalidates the generation and
 * forces a full re-index/re-embed on the next sync.
 */
function buildEmbeddingCompatibilityIdentity(
  extractor: { extractorId: string; extractorVersion: string },
  chunker: { chunkerId: string; chunkerVersion: string },
): string {
  return [
    extractor.extractorId,
    extractor.extractorVersion,
    chunker.chunkerId,
    chunker.chunkerVersion,
    currentEmbeddingIdentity.provider,
    currentEmbeddingIdentity.model,
    currentEmbeddingIdentity.dimensions ?? "",
    currentEmbeddingIdentity.metric,
  ].join("::");
}

/**
 * Decide whether an existing generation can be reused for the given commit
 * against the currently registered extractor/chunker. A version bump (e.g. a
 * fix to heading-text extraction) or an embedding-model change must re-index
 * even when the pinned commit has not changed, otherwise stale derived state
 * hides the fix.
 */
export function isGenerationCurrent(
  generation:
    | {
        manifest: {
          indexedCommit: string;
          extractorVersion: string;
          chunkerVersion: string;
          indexSchemaVersion: string;
          embeddingCompatibilityIdentity: string;
        };
      }
    | undefined,
  indexedCommit: string,
  extractor: { extractorVersion: string; extractorId: string },
  chunker: { chunkerId: string; chunkerVersion: string },
): generation is NonNullable<typeof generation> {
  if (!generation) return false;
  const expectedCompatibilityIdentity = buildEmbeddingCompatibilityIdentity(extractor, chunker);
  return (
    generation.manifest.indexedCommit === indexedCommit &&
    generation.manifest.extractorVersion === extractor.extractorVersion &&
    generation.manifest.chunkerVersion === chunker.chunkerVersion &&
    generation.manifest.indexSchemaVersion === "3" &&
    generation.manifest.embeddingCompatibilityIdentity === expectedCompatibilityIdentity
  );
}

function joinHeadingAncestry(headingAncestry: Array<{ depth: number; text: string }>): string {
  return headingAncestry.map((h) => h.text).join(" / ");
}

interface ChunkEmbeddingWorkItem {
  chunk: RetrievalChunk;
  projectionText: string;
  contentHash: string;
  sourcePath: string;
}

/** Safety bound for the recency git-log walk so huge histories cannot stall a sync. */
const RECENCY_LOG_LINE_BUDGET = 200_000;

/**
 * Compute the newest commit date for each source path with a single `git log`
 * walk (newest-first). Used to prioritize which still-un-embedded chunks to
 * embed first when the per-sync embedding work cap bites. Fail-soft: any git
 * failure returns an empty map and callers fall back to source-path ordering.
 */
async function computePerPathLastMod(
  resolvedLocalPath: string,
  indexedCommit: string,
  paths: string[],
): Promise<Map<string, string>> {
  const targetPaths = new Set(paths);
  if (targetPaths.size === 0) return new Map();

  const result = await attempt("sync:doc-source-recency", async () => {
    const git = simpleGit(resolvedLocalPath);
    const logOutput = await git.raw(["log", "--name-only", "--format=%cI", indexedCommit]);
    const lastModByPath = new Map<string, string>();
    let currentDate = "";
    let lineCount = 0;
    for (const line of logOutput.split("\n")) {
      lineCount++;
      if (lineCount > RECENCY_LOG_LINE_BUDGET) break;
      if (line.length === 0) continue;
      if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
        currentDate = line;
        continue;
      }
      if (currentDate === "") continue;
      if (targetPaths.has(line) && !lastModByPath.has(line)) {
        lastModByPath.set(line, currentDate);
        if (lastModByPath.size === targetPaths.size) break;
      }
    }
    return lastModByPath;
  });

  return result.ok ? result.value : new Map();
}

/**
 * Embed generation chunks with fail-soft semantics (the spec's line-41
 * contract): per-chunk embed failures are recorded in the manifest and never
 * fail the sync. Reuses on-disk embeddings whose content hash + embedding
 * identity match the current projection text. When the per-sync embedding work
 * cap bites, the most-recently-modified chunks are embedded first; the rest
 * remain lexical-only.
 */
export async function embedGenerationChunks(
  gen: DocumentGeneration,
  ctx: ServerContext,
  attachmentId: string,
  storage: ChunkEmbeddingStorage,
  lastModByPath: Map<string, string>,
  maxEmbeddingWork: number = DOCUMENT_SOURCE_LIMITS.maxEmbeddingWork,
): Promise<void> {
  const toEmbed: ChunkEmbeddingWorkItem[] = [];

  // Read existing on-disk embeddings and compute each chunk's content hash
  // concurrently. On a re-sync of a large unchanged attachment every chunk hits
  // the reuse branch, so this read/decide loop is the whole cost — serializing
  // it makes re-syncs slow for no benefit. Bounded by `reindexEmbedConcurrency`
  // (same knob as the embed workers below). Workers share no mutable state:
  // each chunk reads a distinct file and sets a distinct chunk-id key
  // (`Map.set` / `Array.push` are atomic between awaits), and `toEmbed` is
  // sorted next, so gathering order doesn't matter. `xxh128` is concurrency-
  // safe — its WASM executes synchronously between awaits (stress-checked).
  const chunks = [...gen.chunks.values()];
  let readIndex = 0;
  const readWorkerCount = Math.min(ctx.config.reindexEmbedConcurrency, Math.max(chunks.length, 1));
  const readWorkers = Array.from({ length: readWorkerCount }, async () => {
    while (true) {
      const chunk = chunks[readIndex++];
      if (!chunk) return;

      const sourcePath = gen.documents.get(chunk.documentId)?.sourcePath ?? chunk.documentId;
      const projectionText = `${chunk.content}\n${joinHeadingAncestry(chunk.headingAncestry)}\n${sourcePath}`;
      const contentHash = await xxh128(projectionText);

      const existing = await storage.read(chunk.chunkId);
      if (
        existing &&
        existing.contentHash === contentHash &&
        checkEmbeddingCompatibility(existing, currentEmbeddingIdentity).status === "compatible"
      ) {
        gen.chunkEmbeddings.set(chunk.chunkId, existing);
        continue;
      }

      toEmbed.push({ chunk, projectionText, contentHash, sourcePath });
    }
  });
  await Promise.all(readWorkers);

  // Recency-priority ordering: newest last-modified first, then source path,
  // then chunkId. The chunkId tie-break makes this a TOTAL ordering so cap
  // selection is deterministic regardless of the (now concurrent) read
  // completion order — without it, same-document chunks tie on recency and
  // source path, and a stable sort would preserve the nondeterministic push
  // order, letting slice(maxEmbeddingWork) pick different chunks across runs.
  // ISO dates compare lexicographically = chronologically.
  toEmbed.sort((a, b) => {
    const aLastMod = lastModByPath.get(a.sourcePath) ?? "";
    const bLastMod = lastModByPath.get(b.sourcePath) ?? "";
    if (aLastMod !== bLastMod) {
      return aLastMod < bLastMod ? 1 : -1;
    }
    if (a.sourcePath !== b.sourcePath) {
      return a.sourcePath.localeCompare(b.sourcePath);
    }
    return a.chunk.chunkId.localeCompare(b.chunk.chunkId);
  });

  const capped = toEmbed.slice(0, maxEmbeddingWork);

  const embeddingFailures: Array<{ chunkId: string; reason: string }> = [];
  let index = 0;

  const workerCount = Math.min(ctx.config.reindexEmbedConcurrency, Math.max(capped.length, 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const item = capped[index++];
      if (!item) return;

      const embedResult = await attempt(`embed:chunk:${attachmentId}`, async () => {
        const vector = await embed(item.projectionText);
        const meta = embeddingMetadata(vector);
        const record: ChunkEmbeddingRecord = {
          chunkId: item.chunk.chunkId,
          contentHash: item.contentHash,
          ...meta,
          embedding: vector,
          updatedAt: isoDateString(new Date().toISOString()),
        };
        await storage.write(record);
        gen.chunkEmbeddings.set(item.chunk.chunkId, record);
      });
      if (!embedResult.ok) {
        embeddingFailures.push({
          chunkId: item.chunk.chunkId,
          reason: getErrorMessage(embedResult.error),
        });
      }
    }
  });

  await Promise.all(workers);

  embeddingFailures.sort((a, b) => a.chunkId.localeCompare(b.chunkId));

  gen.manifest.embeddedChunkCount = gen.chunkEmbeddings.size;
  gen.manifest.embeddingFailures = embeddingFailures;
}

/**
 * Reconcile on-disk chunk embeddings against the current generation. Stale
 * removal (chunkId no longer present) runs every sync; rename removal is
 * opt-in via `removeNonCanonical` — the caller enables it only when the naming
 * scheme changed (e.g. an `indexSchemaVersion` bump), so legacy-named files
 * get cleaned up exactly once instead of re-checking every sync. Delegates to
 * `ChunkEmbeddingStorage.reconcile`, which unlinks by the actual on-disk path
 * in a single pass (mirrors `removeStaleEmbeddings` for note embeddings).
 */
export async function sweepStaleChunkEmbeddings(
  storage: ChunkEmbeddingStorage,
  currentChunkIds: Set<string>,
  removeNonCanonical = false,
): Promise<void> {
  await storage.reconcile(currentChunkIds, removeNonCanonical);
}

function buildEmbeddingSummary(embedded: number, failed: number): string {
  const parts: string[] = [];
  if (embedded > 0) parts.push(`embedded ${embedded} chunk(s)`);
  if (failed > 0) parts.push(`${failed} embedding failure(s)`);
  return parts.length > 0 ? `, ${parts.join(", ")}` : "";
}

/**
 * Sync a document-source attachment: fetch the remote commit, enumerate blobs,
 * build a generation, embed chunk vectors (fail-soft), and publish it.
 */
export async function syncDocumentSource(
  config: DocumentSourceAttachmentConfig,
  ctx: ServerContext,
  projectEmbeddingsDir: string | undefined,
): Promise<DocumentSyncResult> {
  const resolvedLocalPath = path.resolve(expandHomePath(config.localPath));

  // Fetch the remote commit
  const fetchResult = await attempt("sync:doc-source-fetch", async () => {
    const git = simpleGit(resolvedLocalPath);
    await git.fetch("origin");
    const newTipResult = await git.raw(["rev-parse", "origin/HEAD"]).catch(() => null);
    return newTipResult?.trim() ?? "";
  });

  if (!fetchResult.ok) {
    return {
      attachmentId: config.attachmentId,
      projectSlug: config.projectSlug,
      indexedCommit: "",
      generationId: "",
      documentCount: 0,
      chunkCount: 0,
      skippedFiles: [],
      errors: [`fetch-failed: ${getErrorMessage(fetchResult.error)}`],
      status: "failed",
      message: `Fetch failed: ${getErrorMessage(fetchResult.error)}`,
    };
  }

  const indexedCommit = fetchResult.value;
  if (!indexedCommit) {
    return {
      attachmentId: config.attachmentId,
      projectSlug: config.projectSlug,
      indexedCommit: "",
      generationId: "",
      documentCount: 0,
      chunkCount: 0,
      skippedFiles: [],
      errors: ["could-not-resolve-remote-commit"],
      status: "failed",
      message: "Could not resolve remote commit",
    };
  }

  // Check if we already have a generation for this commit that is still
  // compatible with the currently registered extractor/chunker. A version bump
  // (e.g. a fix to heading-text extraction) must re-index even when the pinned
  // commit has not changed, otherwise stale derived state hides the fix.
  const mediaType = config.acceptedMediaTypes[0] || "text/markdown";
  const extractor = getExtractor(mediaType);
  if (!extractor) {
    return {
      attachmentId: config.attachmentId,
      projectSlug: config.projectSlug,
      indexedCommit,
      generationId: "",
      documentCount: 0,
      chunkCount: 0,
      skippedFiles: [],
      errors: [`no-extractor-for-media-type: ${mediaType}`],
      status: "failed",
      message: `No extractor registered for media type '${mediaType}'`,
    };
  }
  const currentGen = getCurrentGeneration(config.attachmentId) ?? undefined;
  // Capture the pre-rebuild schema version before the `isGenerationCurrent`
  // type guard narrows `currentGen`. Used later to decide whether the on-disk
  // embedding naming scheme might have changed (and thus whether the more
  // expensive rename-cleanup pass should run). `currentGen` is never reassigned.
  const previousSchemaVersion = currentGen?.manifest.indexSchemaVersion;
  if (isGenerationCurrent(currentGen, indexedCommit, extractor, markdownChunker)) {
    return {
      attachmentId: config.attachmentId,
      projectSlug: config.projectSlug,
      indexedCommit,
      generationId: currentGen.manifest.generationId,
      documentCount: currentGen.manifest.documentCount,
      chunkCount: currentGen.manifest.chunkCount,
      skippedFiles: [],
      errors: [],
      status: "unchanged",
      message: `No changes on '${indexedCommit.substring(0, 8)}'.`,
    };
  }

  // Enumerate blobs from the commit
  const enumerateResult = await attempt("sync:doc-source-enumerate", async () => {
    const git = simpleGit(resolvedLocalPath);
    // List all tracked files at the commit
    const lsTreeResult = await git.raw(["ls-tree", "-r", "--name-only", indexedCommit]);
    const allFiles = lsTreeResult.trim().split("\n").filter(Boolean);

    // Apply include/exclude patterns (path-aware globs relative to root)
    const root = config.root || ".";
    const includePatterns = config.include.length > 0 ? config.include : ["**/*.md"];
    const excludePatterns = config.exclude || [];
    const rootPrefix = root === "." ? "" : root + "/";

    const matchedFiles = allFiles.filter((file) => {
      if (rootPrefix && !file.startsWith(rootPrefix)) return false;
      const rel = rootPrefix ? file.slice(rootPrefix.length) : file;
      if (!matchAnyGlob(includePatterns, rel)) return false;
      if (matchAnyGlob(excludePatterns, rel)) return false;
      return true;
    });

    // Read blob contents
    const files: Array<{ path: string; bytes: Uint8Array }> = [];
    for (const filePath of matchedFiles) {
      const showResult = await git.raw(["show", `${indexedCommit}:${filePath}`]);
      const bytes = new TextEncoder().encode(showResult);
      files.push({ path: filePath, bytes });
    }

    return files;
  });

  if (!enumerateResult.ok) {
    return {
      attachmentId: config.attachmentId,
      projectSlug: config.projectSlug,
      indexedCommit,
      generationId: "",
      documentCount: 0,
      chunkCount: 0,
      skippedFiles: [],
      errors: [`enumerate-failed: ${getErrorMessage(enumerateResult.error)}`],
      status: "failed",
      message: `Enumerate failed: ${getErrorMessage(enumerateResult.error)}`,
    };
  }

  const files = enumerateResult.value;

  // Build the generation
  const buildResult = buildGenerationFromFiles(
    config.attachmentId,
    files,
    config.acceptedMediaTypes,
    extractor,
    markdownChunker,
    indexedCommit,
  );

  // Override the embedding-compatibility identity so embedding-model changes
  // invalidate the generation. `buildGenerationFromFiles` stays pure (it cannot
  // import the embedding provider), so this happens here, before the generation
  // is consumed.
  const generation = getCurrentGeneration(config.attachmentId);
  if (generation) {
    generation.manifest.embeddingCompatibilityIdentity = buildEmbeddingCompatibilityIdentity(
      extractor,
      markdownChunker,
    );
  }

  // Embed chunk vectors (fail-soft). When the embedding provider is unavailable
  // or the project embeddings directory cannot be resolved, the generation
  // still publishes with lexical-only coverage — the spec's line-41 contract.
  if (generation && projectEmbeddingsDir) {
    const chunkStorage = new ChunkEmbeddingStorage(
      path.join(projectEmbeddingsDir, "doc-source", config.attachmentId),
      config.attachmentId,
    );
    const embedStep = await attempt("sync:doc-source-embed", async () => {
      await chunkStorage.init();
      const sourcePaths = Array.from(generation.documents.values(), (d) => d.sourcePath);
      const lastModByPath = await computePerPathLastMod(
        resolvedLocalPath,
        indexedCommit,
        sourcePaths,
      );
      await embedGenerationChunks(
        generation,
        ctx,
        config.attachmentId,
        chunkStorage,
        lastModByPath,
      );
      // Only pay for rename-cleanup when the on-disk naming scheme actually
      // changed (previous manifest's schema version differs from this one);
      // stale-chunkId removal still runs every sync.
      const schemaChanged = previousSchemaVersion !== generation.manifest.indexSchemaVersion;
      await sweepStaleChunkEmbeddings(
        chunkStorage,
        new Set(generation.chunks.keys()),
        schemaChanged,
      );
    });
    if (!embedStep.ok) {
      generation.manifest.embeddingFailures = [
        { chunkId: "", reason: `embed-step-failed: ${getErrorMessage(embedStep.error)}` },
      ];
    }
  }

  const embeddingSummary = generation
    ? buildEmbeddingSummary(
        generation.manifest.embeddedChunkCount,
        generation.manifest.embeddingFailures.length,
      )
    : "";

  return {
    attachmentId: config.attachmentId,
    projectSlug: config.projectSlug,
    indexedCommit,
    generationId: buildResult.generationId,
    documentCount: buildResult.documentCount,
    chunkCount: buildResult.chunkCount,
    skippedFiles: buildResult.skippedFiles,
    errors: [],
    status: "indexed",
    message: `Indexed ${buildResult.documentCount} documents, ${buildResult.chunkCount} chunks from ${indexedCommit.substring(0, 8)}${embeddingSummary}.`,
  };
}
