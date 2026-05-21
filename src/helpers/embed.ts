import { promises as fs } from "fs";
import { checkEmbeddingCompatibility, currentEmbeddingIdentity, embed, embeddingMetadata } from "../embeddings.js";
import { memoryId, isoDateString } from "../brands.js";
import { getOrBuildProjection } from "../projections.js";
import { attempt, getErrorMessage } from "../error-utils.js";
import type { Storage, Note } from "../storage.js";
import type { ServerContext } from "../server-context.js";

export interface FailedEmbedding {
  id: string;
  error: string;
}

export async function embedTextForNote(storage: Storage, note: Note): Promise<string> {
  const result = await attempt("projection:build", () => getOrBuildProjection(storage, note));
  if (!result.ok) return `${note.title}\n\n${note.content}`;
  return result.value.projectionText;
}

export async function embedMissingNotes(
  ctx: ServerContext,
  storage: Storage,
  noteIds?: string[],
  force = false,
): Promise<{ rebuilt: number; failed: FailedEmbedding[] }> {
  const notes = noteIds
    ? (await Promise.all(noteIds.map((id) => storage.readNote(memoryId(id))))).filter((n): n is Note => n !== null)
    : await storage.listNotes();

  let rebuilt = 0;
  const failed: FailedEmbedding[] = [];
  let index = 0;

  const workerCount = Math.min(ctx.config.reindexEmbedConcurrency, Math.max(notes.length, 1));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const note = notes[index++];
      if (!note) {
        return;
      }

      if (!force) {
        const existing = await storage.readEmbedding(note.id);
        if (
          existing
          && checkEmbeddingCompatibility(existing, currentEmbeddingIdentity).status === "compatible"
          && existing.updatedAt >= note.updatedAt
        ) {
          continue;
        }
      }

      const embedResult = await attempt("embed:note", async () => {
        const text = await embedTextForNote(storage, note);
        const vector = await embed(text);
        await storage.writeEmbedding({
          id: note.id,
          ...embeddingMetadata(vector),
          embedding: vector,
          updatedAt: isoDateString(new Date().toISOString()),
        });
      });
      if (embedResult.ok) {
        rebuilt++;
      } else {
        failed.push({ id: note.id, error: getErrorMessage(embedResult.error) });
      }
    }
  });

  await Promise.all(workers);

  failed.sort((a, b) => a.id.localeCompare(b.id));

  return { rebuilt, failed };
}

export async function backfillEmbeddingsAfterSync(
  ctx: ServerContext,
  storage: Storage,
  label: string,
  lines: string[],
  force = false,
): Promise<{ embedded: number; failed: FailedEmbedding[] }> {
  const { rebuilt, failed } = await embedMissingNotes(ctx, storage, undefined, force);
  if (rebuilt > 0 || failed.length > 0) {
    let failSummary = "";
    if (failed.length > 0) {
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

export async function removeStaleEmbeddings(storage: Storage, noteIds: string[]): Promise<void> {
  for (const id of noteIds) {
    const result = await attempt("embed:unlink", () => fs.unlink(storage.embeddingPath(memoryId(id))));
    if (!result.ok) { /* already gone */ }
  }
}
