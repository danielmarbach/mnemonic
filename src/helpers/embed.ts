import { promises as fs } from "fs";
import { embed, embedModel } from "../embeddings.js";
import { memoryId, isoDateString } from "../brands.js";
import { getOrBuildProjection } from "../projections.js";
import type { Storage, Note } from "../storage.js";
import type { ServerContext } from "../server-context.js";

export async function embedTextForNote(storage: Storage, note: Note): Promise<string> {
  try {
    const projection = await getOrBuildProjection(storage, note);
    return projection.projectionText;
  } catch {
    return `${note.title}\n\n${note.content}`;
  }
}

export async function embedMissingNotes(
  ctx: ServerContext,
  storage: Storage,
  noteIds?: string[],
  force = false,
): Promise<{ rebuilt: number; failed: string[] }> {
  const notes = noteIds
    ? (await Promise.all(noteIds.map((id) => storage.readNote(memoryId(id))))).filter((n): n is Note => n !== null)
    : await storage.listNotes();

  let rebuilt = 0;
  const failed: string[] = [];
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
        if (existing?.model === embedModel && existing.updatedAt >= note.updatedAt) {
          continue;
        }
      }

      try {
        const text = await embedTextForNote(storage, note);
        const vector = await embed(text);
        await storage.writeEmbedding({
          id: note.id,
          model: embedModel,
          embedding: vector,
          updatedAt: isoDateString(new Date().toISOString()),
        });
        rebuilt++;
      } catch {
        failed.push(note.id);
      }
    }
  });

  await Promise.all(workers);

  failed.sort();

  return { rebuilt, failed };
}

export async function backfillEmbeddingsAfterSync(
  ctx: ServerContext,
  storage: Storage,
  label: string,
  lines: string[],
  force = false,
): Promise<{ embedded: number; failed: string[] }> {
  const { rebuilt, failed } = await embedMissingNotes(ctx, storage, undefined, force);
  if (rebuilt > 0 || failed.length > 0) {
    lines.push(
      `${label}: embedded ${rebuilt} note(s)${force ? " (force rebuild)." : " (including any missing local embeddings)."}` +
      `${failed.length > 0 ? ` Failed: ${failed.join(", ")}` : ""}`,
    );
  }

  return { embedded: rebuilt, failed };
}

export async function removeStaleEmbeddings(storage: Storage, noteIds: string[]): Promise<void> {
  for (const id of noteIds) {
    try { await fs.unlink(storage.embeddingPath(memoryId(id))); } catch { /* already gone */ }
  }
}