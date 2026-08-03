import { promises as fs } from "fs";
import path from "path";
import { xxh128 } from "./hashing.js";
import { attempt } from "./error-utils.js";

/**
 * Persisted metadata for a document-source generation, written at the end of a
 * successful sync and read back on recall when the in-memory generation is
 * gone (e.g. after an MCP server restart cleared `generation-storage`).
 *
 * The manifest lives at
 * `<docSourceBase>/<attachmentId>/manifest.json` — the same per-attachment
 * directory that holds the chunk embedding JSON files — and is written
 * atomically (temp file + rename) so a crash mid-sync never leaves a corrupt
 * manifest that would poison lazy loading.
 *
 * Only the fields required to rebuild a generation from persisted state are
 * stored: the git commit to index from, the extractor/chunker/projection/index
 * identities (so an incompatible manifest is rejected rather than rebuilt with
 * the wrong derivation), and the derived counts that let a lazy load verify it
 * reproduced the same generation.
 */
export interface PersistedManifest {
  /** Schema version of the manifest payload itself. Currently "1". */
  manifestSchemaVersion: string;
  projectId: string;
  attachmentId: string;
  generationId: string;
  /** Git commit hash the generation was built from. */
  indexedCommit: string;
  indexSchemaVersion: string;
  extractorId: string;
  extractorVersion: string;
  extractorOptionsHash: string;
  chunkerId: string;
  chunkerVersion: string;
  chunkerOptionsHash: string;
  projectionSchemaVersion: string;
  embeddingCompatibilityIdentity: string;
  /** xxh128 of the normalized attachment config, for change detection. */
  attachmentConfigHash: string;
  sourceMediaTypeCounts: Record<string, number>;
  documentCount: number;
  chunkCount: number;
  embeddedChunkCount: number;
  /** ISO 8601 timestamp of when the generation was built. */
  builtAt: string;
}

/** Current schema version of the persisted manifest payload. */
export const MANIFEST_SCHEMA_VERSION = "1" as const;

/**
 * Resolve the doc-source embeddings base directory (the directory that
 * directly contains per-attachment subdirectories).
 *
 * Mirrors `sync.ts`'s docSourceBase construction:
 * - a project vault embeddings dir is preferred → `.../embeddings/doc-source`
 * - otherwise the main vault → `.../embeddings/doc-source`
 *   (the attachmentId UUID is globally unique, so no project namespace is needed)
 * - otherwise (no vault at all) → `undefined`, meaning no doc-source
 *   embeddings/manifest location is available.
 */
export function resolveDocSourceBase(
  projectVaultEmbeddingsDir: string | undefined,
  mainVaultEmbeddingsDir: string,
): string | undefined {
  if (projectVaultEmbeddingsDir && projectVaultEmbeddingsDir.length > 0) {
    return path.join(projectVaultEmbeddingsDir, "doc-source");
  }
  if (mainVaultEmbeddingsDir && mainVaultEmbeddingsDir.length > 0) {
    return path.join(mainVaultEmbeddingsDir, "doc-source");
  }
  return undefined;
}

/**
 * Full path to the persisted manifest for an attachment. The manifest lives
 * alongside the chunk embedding files in the per-attachment directory.
 */
export function resolveManifestPath(docSourceBase: string, attachmentId: string): string {
  return path.join(docSourceBase, attachmentId, "manifest.json");
}

/**
 * Persist a manifest atomically: write to a unique temp file in the target
 * directory, then rename over the destination. Rename is atomic on the same
 * filesystem, so readers never observe a partially-written manifest. Creates
 * the parent directory if needed. `dir` is the per-attachment directory that
 * directly contains `manifest.json` (see `resolveManifestPath`).
 */
export async function writeManifest(dir: string, manifest: PersistedManifest): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "manifest.json");
  const tmpPath = path.join(
    dir,
    `manifest.json.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await fs.writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf-8");
  const renameResult = await attempt("manifest:rename", () => fs.rename(tmpPath, filePath));
  if (!renameResult.ok) {
    // Clean up orphaned temp file, then re-throw so the caller sees the error.
    await attempt("manifest:cleanup-tmp", () => fs.unlink(tmpPath));
    throw renameResult.error;
  }
}

/**
 * Read and validate a persisted manifest. Returns `null` when the file is
 * missing, unparseable, or fails schema validation — all fail-soft paths that
 * force the caller to fall back to a fresh sync rather than lazy load.
 * `dir` is the per-attachment directory directly containing `manifest.json`.
 */
export async function readManifest(dir: string): Promise<PersistedManifest | null> {
  const filePath = path.join(dir, "manifest.json");
  const raw = await attempt("manifest:read", () => fs.readFile(filePath, "utf-8"));
  if (!raw.ok) return null;
  const parsed = await attempt("manifest:read", (): unknown => JSON.parse(raw.value));
  if (!parsed.ok) return null;
  return validateManifest(parsed.value) ? parsed.value : null;
}

/**
 * Validate an unknown value as a `PersistedManifest` (type guard). Rejects
 * wrong schema version, missing/empty required string fields, non-integer
 * counts, and a malformed `sourceMediaTypeCounts` record. Fail-soft: any
 * mismatch returns false so callers treat the manifest as absent.
 */
export function validateManifest(raw: unknown): raw is PersistedManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  const m = raw as Record<string, unknown>;

  if (m["manifestSchemaVersion"] !== MANIFEST_SCHEMA_VERSION) return false;

  const requiredStrings: Array<keyof PersistedManifest> = [
    "projectId",
    "attachmentId",
    "generationId",
    "indexSchemaVersion",
    "extractorId",
    "extractorVersion",
    "extractorOptionsHash",
    "chunkerId",
    "chunkerVersion",
    "chunkerOptionsHash",
    "projectionSchemaVersion",
    "embeddingCompatibilityIdentity",
    "attachmentConfigHash",
    "builtAt",
  ];
  for (const key of requiredStrings) {
    const value = m[key];
    if (typeof value !== "string" || value.length === 0) return false;
  }

  // Validate indexedCommit as a hex git hash (40-char SHA-1 or 64-char SHA-256)
  // to prevent argument injection via crafted manifest values.
  const commit = m["indexedCommit"];
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(commit)) {
    return false;
  }

  for (const key of ["documentCount", "chunkCount", "embeddedChunkCount"] as const) {
    const value = m[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return false;
  }

  const mediaCounts = m["sourceMediaTypeCounts"];
  if (typeof mediaCounts !== "object" || mediaCounts === null || Array.isArray(mediaCounts)) {
    return false;
  }
  for (const value of Object.values(mediaCounts as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return false;
  }

  return true;
}

/** Structural subset of the attachment config used for change detection. */
export interface ManifestConfigInput {
  kind: string;
  localPath: string;
  root: string;
  include: string[];
  exclude: string[];
  acceptedMediaTypes: string[];
}

/**
 * Compute a deterministic xxh128 of the attachment config fields that affect
 * indexing. Any change (localPath, root, include/exclude patterns, accepted
 * media types) yields a different hash so lazy loaders can detect a config
 * drift against the persisted manifest. Async because `xxh128` lazily compiles
 * its WASM on first use.
 */
export async function computeAttachmentConfigHash(config: ManifestConfigInput): Promise<string> {
  const input = [
    config.kind,
    config.localPath,
    config.root,
    config.include.join(","),
    config.exclude.join(","),
    config.acceptedMediaTypes.join(","),
  ].join("\u0000");
  return xxh128(input);
}
