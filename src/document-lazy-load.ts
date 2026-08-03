import { execFile, spawn } from "child_process";
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
import { attempt, getErrorMessage } from "./error-utils.js";
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
 *
 * Blob content is hydrated with a single `git cat-file --batch` subprocess
 * rather than one `git show` call per file; the old sequential path is kept as
 * a fallback if the batch subprocess fails.
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
  if (!lsTreeResult.ok) {
    console.error(
      `[lazy-load] ls-tree failed for ${indexedCommit}: ${getErrorMessage(lsTreeResult.error)}`,
    );
    return null;
  }

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

  // Enforce the file cap BEFORE blob hydration so a huge repo cannot flood the
  // subprocess with an unbounded number of paths.
  const boundedFiles = matchedFiles.slice(0, MAX_LAZY_LOAD_FILES);

  if (boundedFiles.length === 0) return [];

  // Single subprocess reads all matching blobs.
  const batchResult = await attempt("lazy-load:cat-file", () =>
    readBlobsBatch(resolvedLocalPath, indexedCommit, boundedFiles),
  );
  if (batchResult.ok) return batchResult.value;
  console.error(
    `[lazy-load] git cat-file --batch failed for ${boundedFiles.length} files; falling back to sequential git show: ${getErrorMessage(batchResult.error)}`,
  );

  // Fallback: sequential `git show` per file (kept for robustness when the
  // batch subprocess is unavailable, e.g. exotic git wrappers).
  const files: Array<{ path: string; bytes: Uint8Array }> = [];
  for (const filePath of boundedFiles) {
    const showResult = await attempt("lazy-load:show", () =>
      run(["show", `${indexedCommit}:${filePath}`]),
    );
    if (!showResult.ok) {
      console.error(
        `[lazy-load] git show failed for ${filePath}: ${getErrorMessage(showResult.error)}`,
      );
      return null;
    }
    files.push({ path: filePath, bytes: new TextEncoder().encode(showResult.value) });
  }

  return files;
}

/**
 * Read a set of file blobs from a commit in a single `git cat-file --batch`
 * subprocess.
 *
 * Each input line `<commit>:<path>` resolves to the file's blob; output is a
 * `<oid> <type> <size>\n<content>\n` block per requested object. `missing`
 * blobs are skipped (fail-soft). Resolves with the byte contents in the same
 * order as `filePaths`, omitting any `missing` entries.
 *
 * The parser accumulates stdout in a buffer and only emits an entry once both
 * the header line and the full `<size>` bytes (plus the trailing newline) are
 * available, so header/content splits across `data` chunks are handled
 * correctly. Rejects if the subprocess exits before every requested blob is
 * read or if a header is malformed.
 */
function readBlobsBatch(
  resolvedLocalPath: string,
  indexedCommit: string,
  filePaths: string[],
): Promise<Array<{ path: string; bytes: Uint8Array }>> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["cat-file", "--batch"], {
      cwd: resolvedLocalPath,
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!proc.stdout || !proc.stdin) {
      return Promise.reject(new Error("git cat-file --batch: stdio not available"));
    }
    const stdout = proc.stdout;
    const stdin = proc.stdin;
    const files: Array<{ path: string; bytes: Uint8Array }> = [];
    let stdoutBuf = Buffer.alloc(0);
    let fileIdx = 0;

    stdout.on("data", (chunk: Buffer) => {
      stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
      while (fileIdx < filePaths.length) {
        const newlineIdx = stdoutBuf.indexOf(0x0a);
        if (newlineIdx === -1) break; // header line incomplete; wait for more data
        const header = stdoutBuf.subarray(0, newlineIdx).toString("utf-8");
        // Consume the header line including its trailing newline.
        stdoutBuf = stdoutBuf.subarray(newlineIdx + 1);

        const parts = header.split(" ");
        const type = parts[1];
        if (type === "missing") {
          fileIdx++;
          continue;
        }
        const oid = parts[0];
        const sizeStr = parts[2];
        if (!oid || !sizeStr) {
          proc.kill();
          reject(new Error(`unexpected git cat-file --batch header: "${header}"`));
          return;
        }
        const size = parseInt(sizeStr, 10);
        if (Number.isNaN(size) || size < 0) {
          proc.kill();
          reject(new Error(`invalid blob size in header: "${header}"`));
          return;
        }
        // Content is followed by a trailing newline; need at least size+1 bytes.
        if (stdoutBuf.length < size + 1) {
          // Not enough data yet; restore the header so we re-parse when more
          // arrives, and wait for the next data chunk.
          stdoutBuf = Buffer.concat([Buffer.from(header + "\n"), stdoutBuf]);
          break;
        }
        const content = stdoutBuf.subarray(0, size);
        // Skip the content plus its trailing newline.
        stdoutBuf = stdoutBuf.subarray(size + 1);
        const fp = filePaths[fileIdx];
        if (!fp) break;
        files.push({ path: fp, bytes: new Uint8Array(content) });
        fileIdx++;
      }
    });

    proc.on("close", (code) => {
      if (fileIdx < filePaths.length) {
        reject(
          new Error(
            `git cat-file --batch closed (code ${code}) before all ${filePaths.length} blobs were read (got ${fileIdx})`,
          ),
        );
      } else {
        resolve(files);
      }
    });

    proc.on("error", reject);

    void (async () => {
      const writeResult = await attempt("lazy-load:batch-write", () => {
        for (const fp of filePaths) {
          stdin.write(`${indexedCommit}:${fp}\n`);
        }
        stdin.end();
      });
      if (!writeResult.ok) {
        proc.kill();
        reject(writeResult.error);
      }
    })();
  });
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
  if (!docSourceBase) {
    console.error(
      `[lazy-load] no doc-source base for ${attachmentId} — run sync to index document sources`,
    );
    return null;
  }
  const attachmentDir = path.join(docSourceBase, attachmentId);

  return withGenerationLock(projectId, attachmentId, async () => {
    // Another caller may have loaded the generation while we waited for the
    // lock — if so, use it instead of re-deriving from git.
    const existing = getCurrentGeneration(projectId, attachmentId);
    if (existing) return existing;

    const manifestResult = await attempt("lazy-load:manifest", () => readManifest(attachmentDir));
    const manifest = manifestResult.ok ? manifestResult.value : null;
    if (!manifest) {
      console.error(
        `[lazy-load] no manifest for ${attachmentId} — run sync to index document sources`,
      );
      return null;
    }

    // Validate manifest identity against function parameters and current config.
    // A mismatch means the manifest is stale (config changed, or the file was
    // copied from another project/attachment) — force a re-sync by returning null.
    if (manifest.projectId !== projectId || manifest.attachmentId !== attachmentId) {
      console.error(
        `[lazy-load] manifest binding mismatch for ${attachmentId} — run sync to index document sources`,
      );
      return null;
    }
    const currentConfigHash = await computeAttachmentConfigHash(config);
    if (currentConfigHash !== manifest.attachmentConfigHash) {
      console.error(
        `[lazy-load] manifest config hash mismatch for ${attachmentId} — run sync to update`,
      );
      return null;
    }

    // Validate extractor/chunker identity — a version drift means the manifest
    // was built with different derivation logic and should not be reused.
    const mediaType = config.acceptedMediaTypes[0] || "text/markdown";
    const extractor = getExtractor(mediaType);
    if (!extractor) {
      console.error(`[lazy-load] no extractor for media type ${mediaType}`);
      return null;
    }
    if (
      manifest.extractorId !== extractor.extractorId ||
      manifest.extractorVersion !== extractor.extractorVersion ||
      manifest.chunkerId !== markdownChunker.chunkerId ||
      manifest.chunkerVersion !== markdownChunker.chunkerVersion
    ) {
      console.error(
        `[lazy-load] extractor/chunker version mismatch for ${attachmentId} — run sync to reindex`,
      );
      return null;
    }

    const resolvedLocalPath = path.resolve(expandHomePath(config.localPath));
    const filesResult = await attempt("lazy-load:enumerate", () =>
      enumerateFilesAtCommit(resolvedLocalPath, config, manifest.indexedCommit),
    );
    const files = filesResult.ok ? filesResult.value : null;
    if (!files) {
      console.error(
        `[lazy-load] git rebuild failed for ${attachmentId}: ${filesResult.ok ? "ls-tree/read failed" : getErrorMessage(filesResult.error)}`,
      );
      return null;
    }
    if (files.length === 0) {
      console.error(
        `[lazy-load] no matching files at commit ${manifest.indexedCommit} for ${attachmentId}`,
      );
      return null;
    }

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
