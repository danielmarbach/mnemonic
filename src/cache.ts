import { performance } from "perf_hooks";
import type { Note, EmbeddingRecord } from "./storage.js";
import type { NoteProjection } from "./structured-content.js";
import type { Vault } from "./vault.js";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VaultCache {
  notesById: Map<string, Note>;
  noteList: Note[];
  embeddings: EmbeddingRecord[];
}

export interface SessionProjectCache {
  projectId: string;
  /** Per-vault caches keyed by vaultPath. Built lazily per vault on first access. */
  vaultCaches: Map<string, VaultCache>;
  /** Projection cache shared across all cached vaults for this project. */
  projectionsById: Map<string, NoteProjection>;
  /** ISO timestamp of when this cache entry was first created. */
  lastBuiltAt: string;
}

interface SessionCaches {
  activeProject?: SessionProjectCache;
}

// ── Module-level singleton ─────────────────────────────────────────────────────

const sessionCaches: SessionCaches = {};

// ── Internal helpers ───────────────────────────────────────────────────────────

function debugLog(event: string, message: string): void {
  console.error(`[${event}] ${message}`);
}

function ensureActiveProjectCache(projectId: string): SessionProjectCache {
  const current = sessionCaches.activeProject;
  if (current?.projectId === projectId) {
    return current;
  }
  // Different project (or first use): create fresh cache
  if (current) {
    debugLog("cache:invalidate", `switching project from=${current.projectId} to=${projectId}`);
  }
  const fresh: SessionProjectCache = {
    projectId,
    vaultCaches: new Map(),
    projectionsById: new Map(),
    lastBuiltAt: new Date().toISOString(),
  };
  sessionCaches.activeProject = fresh;
  return fresh;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Discard the entire active project cache.
 *
 * Call this after any mutation that modifies notes, embeddings, or relationships
 * so the next read rebuilds from storage. Safe to call when no cache exists (no-op).
 */
export function invalidateActiveProjectCache(): void {
  if (sessionCaches.activeProject) {
    debugLog("cache:invalidate", `project=${sessionCaches.activeProject.projectId}`);
    sessionCaches.activeProject = undefined;
  }
}

/**
 * Return the active project cache for the given projectId without triggering a build.
 * Returns undefined when no cache exists or the cached project is different.
 */
export function getActiveProjectCache(projectId: string): SessionProjectCache | undefined {
  const cache = sessionCaches.activeProject;
  if (cache?.projectId === projectId) return cache;
  return undefined;
}

/**
 * Get the full note list for a vault from the session cache, building it lazily if needed.
 *
 * When the vault cache is first built, notes AND embeddings are loaded together so
 * both are available for subsequent calls at no extra I/O cost.
 *
 * Fail-soft: returns `undefined` on error. Callers must fall back to direct storage access.
 */
export async function getOrBuildVaultNoteList(
  projectId: string,
  vault: Vault
): Promise<Note[] | undefined> {
  const vaultPath = vault.storage.vaultPath;
  const cache = ensureActiveProjectCache(projectId);

  const existing = cache.vaultCaches.get(vaultPath);
  if (existing) {
    debugLog("cache:hit", `project=${projectId} vault=${vaultPath} notes=${existing.noteList.length}`);
    return existing.noteList;
  }

  debugLog("cache:miss", `project=${projectId} vault=${vaultPath}`);
  try {
    const t0 = performance.now();
    const [noteList, embeddings] = await Promise.all([
      vault.storage.listNotes(),
      vault.storage.listEmbeddings(),
    ]);
    const notesById = new Map<string, Note>(noteList.map((n) => [n.id, n]));
    cache.vaultCaches.set(vaultPath, { notesById, noteList, embeddings });
    const ms = (performance.now() - t0).toFixed(1);
    debugLog(
      "cache:build",
      `project=${projectId} vault=${vaultPath} notes=${noteList.length} embeddings=${embeddings.length} time=${ms}ms`
    );
    return noteList;
  } catch (err) {
    debugLog("cache:fallback", `project=${projectId} vault=${vaultPath} error=${String(err)}`);
    return undefined;
  }
}

/**
 * Get the embeddings list for a vault from the session cache, building it lazily if needed.
 *
 * When the vault cache is first built, notes AND embeddings are loaded together so
 * both are available for subsequent calls at no extra I/O cost.
 *
 * Fail-soft: returns `undefined` on error. Callers must fall back to direct storage access.
 */
export async function getOrBuildVaultEmbeddings(
  projectId: string,
  vault: Vault
): Promise<EmbeddingRecord[] | undefined> {
  const vaultPath = vault.storage.vaultPath;
  const cache = ensureActiveProjectCache(projectId);

  const existing = cache.vaultCaches.get(vaultPath);
  if (existing) {
    debugLog("cache:hit", `project=${projectId} vault=${vaultPath} embeddings=${existing.embeddings.length}`);
    return existing.embeddings;
  }

  debugLog("cache:miss", `project=${projectId} vault=${vaultPath}`);
  try {
    const t0 = performance.now();
    const [noteList, embeddings] = await Promise.all([
      vault.storage.listNotes(),
      vault.storage.listEmbeddings(),
    ]);
    const notesById = new Map<string, Note>(noteList.map((n) => [n.id, n]));
    cache.vaultCaches.set(vaultPath, { notesById, noteList, embeddings });
    const ms = (performance.now() - t0).toFixed(1);
    debugLog(
      "cache:build",
      `project=${projectId} vault=${vaultPath} notes=${noteList.length} embeddings=${embeddings.length} time=${ms}ms`
    );
    return embeddings;
  } catch (err) {
    debugLog("cache:fallback", `project=${projectId} vault=${vaultPath} error=${String(err)}`);
    return undefined;
  }
}

/**
 * Look up a single note from an already-built vault cache.
 * Returns `undefined` when the vault cache has not been built yet or the note is not found.
 * Does NOT trigger a cache build — callers should use `getOrBuildVaultNoteList` or
 * `getOrBuildVaultEmbeddings` to ensure the vault cache is warm first.
 */
export function getSessionCachedNote(
  projectId: string,
  vaultPath: string,
  noteId: string
): Note | undefined {
  const cache = sessionCaches.activeProject;
  if (!cache || cache.projectId !== projectId) return undefined;
  return cache.vaultCaches.get(vaultPath)?.notesById.get(noteId);
}

/**
 * Retrieve a cached projection for a note.
 * Returns `undefined` when no cache or projection exists.
 */
export function getSessionCachedProjection(
  projectId: string,
  noteId: string
): NoteProjection | undefined {
  const cache = sessionCaches.activeProject;
  if (!cache || cache.projectId !== projectId) return undefined;
  return cache.projectionsById.get(noteId);
}

/**
 * Store a projection in the session cache.
 * No-op when no active cache exists for this project.
 */
export function setSessionCachedProjection(
  projectId: string,
  noteId: string,
  projection: NoteProjection
): void {
  const cache = sessionCaches.activeProject;
  if (!cache || cache.projectId !== projectId) return;
  cache.projectionsById.set(noteId, projection);
}
