import { z } from "zod";
import type { Relationship } from "./storage.js";
import type { NoteProjection } from "./structured-content.js";
import { memoryId, embeddingModelId, isoDateString } from "./brands.js";

export const EmbeddingRecordSchema = z.object({
  id: z.string(),
  model: z.string(),
  embedding: z.array(z.number()),
  updatedAt: z.string(),
});

export const NoteProjectionSchema = z.object({
  noteId: z.string(),
  title: z.string(),
  summary: z.string(),
  headings: z.array(z.string()),
  tags: z.array(z.string()),
  lifecycle: z.string().optional(),
  updatedAt: z.string().optional(),
  projectionText: z.string(),
  generatedAt: z.string(),
});

const RelationshipSchema = z.object({
  id: z.string(),
  type: z.enum(["related-to", "explains", "example-of", "supersedes", "derives-from", "follows"]),
});

export function validateRelatedTo(value: unknown): Relationship[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  const validated: Relationship[] = [];
  for (const item of value) {
    const result = RelationshipSchema.safeParse(item);
    if (result.success) {
      validated.push({ id: memoryId(result.data.id), type: result.data.type as Relationship["type"] });
    } else {
      console.error(`[validation] Skipping invalid relationship entry: ${JSON.stringify(result.error.issues)}`);
    }
  }
  return validated.length > 0 ? validated : undefined;
}

export function validateEmbeddingRecord(raw: unknown): import("./storage.js").EmbeddingRecord | null {
  const result = EmbeddingRecordSchema.safeParse(raw);
  if (result.success) {
    return {
      id: memoryId(result.data.id),
      model: embeddingModelId(result.data.model),
      embedding: result.data.embedding,
      updatedAt: isoDateString(result.data.updatedAt),
    };
  }
  console.error(`[validation] Embedding record validation failed: ${JSON.stringify(result.error.issues)}`);
  return null;
}

export function validateNoteProjection(raw: unknown): NoteProjection | null {
  const result = NoteProjectionSchema.safeParse(raw);
  if (result.success) {
    return result.data as NoteProjection;
  }
  console.error(`[validation] Note projection validation failed: ${JSON.stringify(result.error.issues)}`);
  return null;
}