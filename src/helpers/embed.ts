import { promises as fs } from "fs";
import { embed, embedModel } from "../embeddings.js";
import { memoryId, isoDateString } from "../brands.js";
import { getOrBuildProjection } from "../projections.js";
import { attempt } from "../error-utils.js";
import type { Storage, Note } from "../storage.js";
import type { ServerContext } from "../server-context.js";

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

      const embedResult = await attempt("embed:note", async () => {
        const text = await embedTextForNote(storage, note);
        const vector = await embed(text);
        await storage.writeEmbedding({
          id: note.id,
          model: embedModel,
          embedding: vector,
          updatedAt: isoDateString(new Date().toISOString()),
        });
      });
      if (embedResult.ok) {
        rebuilt++;
      } else {
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
    const result = await attempt("embed:unlink", () => fs.unlink(storage.embeddingPath(memoryId(id))));
    if (!result.ok) { /* already gone */ }
  }
}