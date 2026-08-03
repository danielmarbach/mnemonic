import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import type { DocumentGeneration } from "./retrieval-document.js";
import { readManifest, computeAttachmentConfigHash } from "./document-manifest.js";
import { buildGenerationFromFiles } from "./document-source-index.js";
import {
  getCurrentGeneration,
  publishGeneration,
  withGenerationLock,
} from "./generation-storage.js";
import { getExtractor } from "./document-extractor.js";
import { markdownChunker } from "./markdown-chunker.js";
import { ChunkEmbeddingStorage } from "./chunk-embedding-storage.js";
import { attempt } from "./error-utils.js";
import { expandHomePath } from "./paths.js";
import { matchAnyGlob } from "./glob-match.js";
import type { DocumentSourceAttachmentConfig } from "./vault.js";
import type { ServerContext } from "./server-context.js";

const execFileAsync = promisify(execFile);

/** Cap git blob reads per lazy load so a huge repository cannot stall recall. */
const MAX_LAZY_LOAD_FILES = 5000;

/**
 * Enumerate and read the files at a given git commit, applying the attachment's
 * include/exclude globs relative to `config.root`. Mirrors the enumeration in
 * `syncDocumentSource`. Fail-soft: any git failure returns `null`.
 */
async function enumerateFilesAtCommit(
  resolvedLocalPath: string,
  config: Pick<DocumentSourceAttachmentConfig, "root" | "include" | "exclude">,
  indexedCommit: string,
): Promise<Array<{ path: string; bytes: Uint8Array }> | null> {
  const run = (args: string[]): Promise<string> =>
    execFileAsync("git", args, {
      cwd: resolvedLocalPath,
      maxBuffer: 64 * 1024 * 1024,
    }).then((result) => result.stdout);

  const lsTreeResult = await attempt("lazy-load:ls-tree", () =>
    run(["ls-tree", "-r", "--name-only", indexedCommit]),
  );
  if (!lsTreeResult.ok) return null;

  const allFiles = lsTreeResult.value.trim().split("\n").filter(Boolean);
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

  const boundedFiles = matchedFiles.slice(0, MAX_LAZY_LOAD_FILES);

  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const filePath of boundedFiles) {
    const showResult = await attempt("lazy-load:show", () =>
      run(["show", `${indexedCommit}:${filePath}`]),
    );
    if (!showResult.ok) return null;
    files.push({ path: filePath, bytes: new TextEncoder().encode(showResult.value) });
  }

  return files;
}

/**
 * Lazily rebuild a `DocumentGeneration` from persisted state after an MCP
 * server restart cleared the in-memory generation store.
 *
 * Called from recall when `getCurrentGeneration(projectId, attachmentId)`
 * returns null. Steps:
 * 1. Read the persisted manifest at `<docSourceBase>/<attachmentId>/manifest.json`.
 * 2. If no valid manifest → return null (the user must run `sync` first).
 * 3. Rebuild the generation from git at `manifest.indexedCommit` via
 *    `buildGenerationFromFiles` (which now RETURNS the generation and does NOT
 *    publish it).
 * 4. Load persisted chunk embeddings from disk into the generation.
 * 5. Publish the generation so subsequent recall hits the in-memory store.
 *
 * The rebuild happens inside `withGenerationLock` so concurrent recalls
 * single-flight the git work; inside the lock it double-checks the in-memory
 * state (another caller may have loaded it first). Fail-soft throughout: any
 * error (git failure, missing commit, corrupt manifest) returns null so recall
 * still works without document chunks rather than throwing.
 */
export async function lazyLoadGeneration(
  projectId: string,
  attachmentId: string,
  config: DocumentSourceAttachmentConfig,
  _ctx: ServerContext,
  docSourceBase: string | undefined,
): Promise<DocumentGeneration | null> {
  if (!docSourceBase) return null;
  const attachmentDir = path.join(docSourceBase, attachmentId);

  return withGenerationLock(projectId, attachmentId, async () => {
    // Another caller may have loaded the generation while we waited for the
    // lock — if so, use it instead of re-deriving from git.
    const existing = getCurrentGeneration(projectId, attachmentId);
    if (existing) return existing;

    const manifestResult = await attempt("lazy-load:manifest", () => readManifest(attachmentDir));
    const manifest = manifestResult.ok ? manifestResult.value : null;
    if (!manifest) return null;

    // Validate manifest identity against function parameters and current config.
    // A mismatch means the manifest is stale (config changed, or the file was
    // copied from another project/attachment) — force a re-sync by returning null.
    if (manifest.projectId !== projectId || manifest.attachmentId !== attachmentId) {
      return null;
    }
    const currentConfigHash = await computeAttachmentConfigHash(config);
    if (currentConfigHash !== manifest.attachmentConfigHash) return null;

    // Validate extractor/chunker identity — a version drift means the manifest
    // was built with different derivation logic and should not be reused.
    const mediaType = config.acceptedMediaTypes[0] || "text/markdown";
    const extractor = getExtractor(mediaType);
    if (!extractor) return null;
    if (
      manifest.extractorId !== extractor.extractorId ||
      manifest.extractorVersion !== extractor.extractorVersion ||
      manifest.chunkerId !== markdownChunker.chunkerId ||
      manifest.chunkerVersion !== markdownChunker.chunkerVersion
    ) {
      return null;
    }

    const resolvedLocalPath = path.resolve(expandHomePath(config.localPath));
    const filesResult = await attempt("lazy-load:enumerate", () =>
      enumerateFilesAtCommit(resolvedLocalPath, config, manifest.indexedCommit),
    );
    const files = filesResult.ok ? filesResult.value : null;
    if (!files || files.length === 0) return null;

    // buildGenerationFromFiles RETURNS the generation now; it does not publish.
    const generation = buildGenerationFromFiles(
      attachmentId,
      files,
      config.acceptedMediaTypes,
      extractor,
      markdownChunker,
      manifest.indexedCommit,
    );

    // Restore the authoritative embedding-compatibility identity recorded at
    // sync time. buildGenerationFromFiles derives a chunker/extractor-only
    // identity; the persisted manifest carries the full identity (including the
    // embedding model), so a later isGenerationCurrent check stays accurate.
    generation.manifest.embeddingCompatibilityIdentity = manifest.embeddingCompatibilityIdentity;

    // Load persisted chunk embeddings from the same per-attachment directory.
    const chunkStorage = new ChunkEmbeddingStorage(attachmentDir, attachmentId);
    const recordsResult = await attempt("lazy-load:embeddings", () => chunkStorage.list(), []);
    const records = recordsResult.ok ? recordsResult.value : [];
    for (const record of records) {
      if (generation.chunks.has(record.chunkId)) {
        generation.chunkEmbeddings.set(record.chunkId, record);
      }
    }
    generation.manifest.embeddedChunkCount = generation.chunkEmbeddings.size;

    publishGeneration(projectId, attachmentId, generation);
    return generation;
  });
}
