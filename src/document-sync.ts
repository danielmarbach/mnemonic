import { simpleGit } from "simple-git";
import path from "path";
import { expandHomePath } from "./paths.js";
import { getExtractor } from "./document-extractor.js";
import { markdownChunker } from "./markdown-chunker.js";
import { buildGenerationFromFiles } from "./document-source-index.js";
import { getCurrentGeneration } from "./generation-storage.js";
import { matchAnyGlob } from "./glob-match.js";
import type { DocumentSourceAttachmentConfig } from "./vault.js";
import { attempt, getErrorMessage } from "./error-utils.js";

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
 * Sync a document-source attachment: fetch the remote commit, enumerate blobs,
 * build a generation, and publish it.
 */
export async function syncDocumentSource(
  config: DocumentSourceAttachmentConfig,
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

  // Check if we already have a generation for this commit
  const currentGen = getCurrentGeneration(config.attachmentId);
  if (currentGen && currentGen.manifest.indexedCommit === indexedCommit) {
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

  // Get the extractor for the first accepted media type
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

  // Build the generation
  const buildResult = buildGenerationFromFiles(
    config.attachmentId,
    files,
    config.acceptedMediaTypes,
    extractor,
    markdownChunker,
    indexedCommit,
  );

  return {
    attachmentId: config.attachmentId,
    projectSlug: config.projectSlug,
    indexedCommit,
    generationId: buildResult.generationId,
    documentCount: buildResult.documentCount,
    chunkCount: buildResult.chunkCount,
    skippedFiles: buildResult.skippedFiles,
    errors: buildResult.errors,
    status: "indexed",
    message: `Indexed ${buildResult.documentCount} documents, ${buildResult.chunkCount} chunks from ${indexedCommit.substring(0, 8)}.`,
  };
}
