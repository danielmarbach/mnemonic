import type { DocumentGeneration } from "./retrieval-document.js";

interface AttachmentGenerationState {
  current: DocumentGeneration | null;
  previous: DocumentGeneration | null;
  generations: Map<string, DocumentGeneration>;
  pinned: Set<string>;
}

const stores = new Map<string, AttachmentGenerationState>();

function getOrCreateState(attachmentId: string): AttachmentGenerationState {
  let state = stores.get(attachmentId);
  if (!state) {
    state = {
      current: null,
      previous: null,
      generations: new Map(),
      pinned: new Set(),
    };
    stores.set(attachmentId, state);
  }
  return state;
}

export function getCurrentGeneration(attachmentId: string): DocumentGeneration | null {
  const state = stores.get(attachmentId);
  return state?.current ?? null;
}

export function publishGeneration(attachmentId: string, generation: DocumentGeneration): void {
  const state = getOrCreateState(attachmentId);

  // Store the generation
  const genId = generation.manifest.generationId;
  state.generations.set(genId as unknown as string, generation);

  // Atomic publish: swap pointer
  state.previous = state.current;
  state.current = generation;

  // Evict old generations (keep current, previous, and pinned)
  const keepIds = new Set<string>();
  if (state.current) keepIds.add(state.current.manifest.generationId as unknown as string);
  if (state.previous) keepIds.add(state.previous.manifest.generationId as unknown as string);
  for (const pinnedId of state.pinned) keepIds.add(pinnedId);

  for (const [id] of state.generations) {
    if (!keepIds.has(id)) {
      state.generations.delete(id);
    }
  }
}

export function getGeneration(
  attachmentId: string,
  generationId: string,
): DocumentGeneration | null {
  const state = stores.get(attachmentId);
  return state?.generations.get(generationId) ?? null;
}

export function pinGeneration(attachmentId: string, generationId: string): void {
  const state = getOrCreateState(attachmentId);
  state.pinned.add(generationId);
}

export function unpinGeneration(attachmentId: string, generationId: string): void {
  const state = stores.get(attachmentId);
  if (state) {
    state.pinned.delete(generationId);
  }
}

export function clearAllGenerations(): void {
  stores.clear();
}
