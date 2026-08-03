import type { DocumentGeneration } from "./retrieval-document.js";
import { attempt } from "./error-utils.js";

interface AttachmentGenerationState {
  current: DocumentGeneration | null;
  previous: DocumentGeneration | null;
  generations: Map<string, DocumentGeneration>;
  pinned: Set<string>;
}

const stores = new Map<string, AttachmentGenerationState>();

function stateKey(projectId: string, attachmentId: string): string {
  return `${projectId}::${attachmentId}`;
}

function getOrCreateState(projectId: string, attachmentId: string): AttachmentGenerationState {
  const key = stateKey(projectId, attachmentId);
  let state = stores.get(key);
  if (!state) {
    state = {
      current: null,
      previous: null,
      generations: new Map(),
      pinned: new Set(),
    };
    stores.set(key, state);
  }
  return state;
}

export function getCurrentGeneration(
  projectId: string,
  attachmentId: string,
): DocumentGeneration | null {
  const state = stores.get(stateKey(projectId, attachmentId));
  return state?.current ?? null;
}

export function publishGeneration(
  projectId: string,
  attachmentId: string,
  generation: DocumentGeneration,
): void {
  const state = getOrCreateState(projectId, attachmentId);

  // Store the generation
  const genId = generation.manifest.generationId;
  state.generations.set(genId, generation);

  // Atomic publish: swap pointer
  state.previous = state.current;
  state.current = generation;

  // Evict old generations (keep current, previous, and pinned)
  const keepIds = new Set<string>();
  if (state.current) keepIds.add(state.current.manifest.generationId);
  if (state.previous) keepIds.add(state.previous.manifest.generationId);
  for (const pinnedId of state.pinned) keepIds.add(pinnedId);

  for (const [id] of state.generations) {
    if (!keepIds.has(id)) {
      state.generations.delete(id);
    }
  }
}

export function evictGeneration(projectId: string, attachmentId: string): void {
  stores.delete(stateKey(projectId, attachmentId));
}

export function getGeneration(
  projectId: string,
  attachmentId: string,
  generationId: string,
): DocumentGeneration | null {
  const state = stores.get(stateKey(projectId, attachmentId));
  return state?.generations.get(generationId) ?? null;
}

export function pinGeneration(projectId: string, attachmentId: string, generationId: string): void {
  const state = getOrCreateState(projectId, attachmentId);
  state.pinned.add(generationId);
}

export function unpinGeneration(
  projectId: string,
  attachmentId: string,
  generationId: string,
): void {
  const state = stores.get(stateKey(projectId, attachmentId));
  if (state) {
    state.pinned.delete(generationId);
  }
}

export function clearAllGenerations(): void {
  stores.clear();
  inflight.clear();
}

/**
 * Single-flight coordination for a given {projectId, attachmentId}.
 *
 * Prevents concurrent sync and lazy-load from racing on the same attachment by
 * serializing work: if an operation is already in flight for the key, the
 * caller waits for it to settle before proceeding. Callers should re-check
 * `getCurrentGeneration` inside `fn` and short-circuit if the generation was
 * already produced by a sibling operation.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function withGenerationLock<T>(
  projectId: string,
  attachmentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = stateKey(projectId, attachmentId);
  const existing = inflight.get(key);
  if (existing) {
    // A sibling operation is in flight for this key. Wait for it to settle so
    // the caller can re-evaluate whether work is still needed (e.g. it may now
    // find the generation already published and return early).
    await existing.catch(() => {});
  }
  const promise = fn();
  inflight.set(key, promise);
  const result = await attempt("generation-lock:fn", () => promise);
  // Only delete if still ours; a subsequent caller may have replaced it.
  if (inflight.get(key) === promise) {
    inflight.delete(key);
  }
  if (!result.ok) throw result.error;
  return result.value;
}
