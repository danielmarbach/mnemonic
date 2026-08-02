import { promises as fs } from "fs";
import {
  checkEmbeddingCompatibility,
  currentEmbeddingIdentity,
  embed,
  embeddingMetadata,
} from "../embeddings.js";
import { memoryId, isoDateString } from "../brands.js";
import { getOrBuildProjection } from "../projections.js";
import { attempt, getErrorMessage } from "../error-utils.js";
import type { NoteStorage, Note, NoteMetadata, EmbeddingRecord } from "../storage.js";
import type { ServerContext } from "../server-context.js";

export interface FailedEmbedding {
  id: string;
  error: string;
}

/**
 * Precomputed snapshots used to determine which embeddings are missing or
 * stale without re-reading the corpus. When omitted, `embedMissingNotes` loads
 * metadata and embeddings itself (still cheap — metadata-only reads).
 */
export interface EmbeddingBackfillSource {
  /** Note metadata (id + updatedAt) — no full bodies required. */
  notes?: NoteMetadata[];
  /** Existing embeddings used to detect stale/missing entries. */
  embeddings?: EmbeddingRecord[];
}

export async function embedTextForNote(storage: NoteStorage, note: Note): Promise<string> {
  const result = await attempt("projection:build", () => getOrBuildProjection(storage, note));
  if (!result.ok) return `${note.title}\n\n${note.content}`;
  return result.value.projectionText;
}

export async function embedMissingNotes(
  ctx: ServerContext,
  storage: NoteStorage,
  noteIds?: string[],
  force = false,
  source?: EmbeddingBackfillSource,
): Promise<{ rebuilt: number; failed: FailedEmbedding[]; embeddings: EmbeddingRecord[] }> {
  // Determine which notes need (re)embedding WITHOUT loading full bodies: compare
  // note metadata (id + updatedAt) against the existing embedding snapshots.
  // This keeps the common cold-recall case (all embeddings current) to a cheap
  // metadata + embeddings pass and zero full reads.
  const noteMetadata =
    source?.notes ??
    (noteIds
      ? (await Promise.all(noteIds.map((id) => storage.readNoteMetadata(memoryId(id))))).filter(
          (n): n is NoteMetadata => n !== null,
        )
      : await storage.listNotesMetadata());

  const existingEmbeddings = source?.embeddings ?? (await storage.listEmbeddings());
  const embeddingsById = new Map(existingEmbeddings.map((e) => [e.id, e]));

  const needsEmbedding = noteMetadata.filter((note) => {
    if (force) return true;
    const existing = embeddingsById.get(note.id);
    if (
      existing &&
      checkEmbeddingCompatibility(existing, currentEmbeddingIdentity).status === "compatible" &&
      existing.updatedAt >= note.updatedAt
    ) {
      return false;
    }
    return true;
  });

  // Only notes that actually need (re)embedding are hydrated, and the full-body
  // read happens inside the worker pool below so concurrent reads stay bounded
  // by `reindexEmbedConcurrency` and no worker retains every full note at once.
  let rebuilt = 0;
  const failed: FailedEmbedding[] = [];
  const rebuiltEmbeddings: EmbeddingRecord[] = [];
  let index = 0;

  const workerCount = Math.min(
    ctx.config.reindexEmbedConcurrency,
    Math.max(needsEmbedding.length, 1),
  );
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const meta = needsEmbedding[index++];
      if (!meta) return;

      const note = await storage.readNote(meta.id);
      if (!note) continue;

      const embedResult = await attempt("embed:note", async () => {
        const text = await embedTextForNote(storage, note);
        const vector = await embed(text);
        const record: EmbeddingRecord = {
          id: note.id,
          ...embeddingMetadata(vector),
          embedding: vector,
          updatedAt: isoDateString(new Date().toISOString()),
        };
        await storage.writeEmbedding(record);
        return record;
      });
      if (embedResult.ok) {
        rebuilt++;
        rebuiltEmbeddings.push(embedResult.value);
      } else {
        failed.push({ id: meta.id, error: getErrorMessage(embedResult.error) });
      }
    }
  });

  await Promise.all(workers);

  failed.sort((a, b) => a.id.localeCompare(b.id));
  // Workers append records in completion order, which is nondeterministic.
  // Sort by id so rebuilt embeddings preserve deterministic ranking for score ties.
  rebuiltEmbeddings.sort((a, b) => a.id.localeCompare(b.id));

  return { rebuilt, failed, embeddings: rebuiltEmbeddings };
}

export async function backfillEmbeddingsAfterSync(
  ctx: ServerContext,
  storage: NoteStorage,
  label: string,
  lines: string[],
  force = false,
): Promise<{ embedded: number; failed: FailedEmbedding[] }> {
  const { rebuilt, failed } = await embedMissingNotes(ctx, storage, undefined, force);
  if (rebuilt > 0 || failed.length > 0) {
    let failSummary = "";
    if (failed.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guarded by length > 0
      const first = failed[0]!;
      const sample = failed.length > 1 ? ` (e.g. "${first.id}")` : ` (${first.id})`;
      failSummary = ` Failed: ${failed.length} note(s)${sample} — ${first.error}`;
    }
    lines.push(
      `${label}: embedded ${rebuilt} note(s)${force ? " (force rebuild)." : " (including any missing local embeddings)."}${failSummary}`,
    );
  }

  return { embedded: rebuilt, failed };
}

export async function removeStaleEmbeddings(
  storage: NoteStorage,
  noteIds: string[],
): Promise<void> {
  for (const id of noteIds) {
    const result = await attempt("embed:unlink", () =>
      fs.unlink(storage.embeddingPath(memoryId(id))),
    );
    if (!result.ok) {
      /* already gone */
    }
  }
}
