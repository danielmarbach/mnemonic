import { z } from "zod";
import type { Relationship } from "./storage.js";
import type { NoteProjection } from "./structured-content.js";
import {
  embeddingCompatibilityKey,
  embeddingDimensions,
  embeddingMetric,
  embeddingModelId,
  embeddingProviderId,
  isoDateString,
  memoryId,
} from "./brands.js";

export const EmbeddingRecordSchema = z.object({
  id: z.string(),
  model: z.string(),
  provider: z.string().optional(),
  dimensions: z.number().int().positive().optional(),
  metric: z.string().optional(),
  inputMode: z.string().optional(),
  compatibilityKey: z.string().optional(),
  embedding: z.array(z.number()).nonempty(),
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
  vaultPath: z.string().optional(),
});

export function validateRelatedTo(value: unknown): Relationship[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return undefined;
  const validated: Relationship[] = [];
  for (const item of value) {
    const result = RelationshipSchema.safeParse(item);
    if (result.success) {
      const relationship: Relationship = {
        id: memoryId(result.data.id),
        type: result.data.type as Relationship["type"],
      };
      if (result.data.vaultPath !== undefined) {
        relationship.vaultPath = result.data.vaultPath;
      }
      validated.push(relationship);
    } else {
      console.error(
        `[validation] Skipping invalid relationship entry: ${JSON.stringify(result.error.issues)}`,
      );
    }
  }
  return validated.length > 0 ? validated : undefined;
}

export function validateEmbeddingRecord(
  raw: unknown,
): import("./storage.js").EmbeddingRecord | null {
  const result = EmbeddingRecordSchema.safeParse(raw);
  if (result.success) {
    return {
      id: memoryId(result.data.id),
      model: embeddingModelId(result.data.model),
      provider:
        result.data.provider !== undefined ? embeddingProviderId(result.data.provider) : undefined,
      dimensions:
        result.data.dimensions !== undefined
          ? embeddingDimensions(result.data.dimensions)
          : undefined,
      metric: result.data.metric !== undefined ? embeddingMetric(result.data.metric) : undefined,
      inputMode: result.data.inputMode,
      compatibilityKey:
        result.data.compatibilityKey !== undefined
          ? embeddingCompatibilityKey(result.data.compatibilityKey)
          : undefined,
      embedding: result.data.embedding,
      updatedAt: isoDateString(result.data.updatedAt),
    };
  }
  console.error(
    `[validation] Embedding record validation failed: ${JSON.stringify(result.error.issues)}`,
  );
  return null;
}

export function validateNoteProjection(raw: unknown): NoteProjection | null {
  const result = NoteProjectionSchema.safeParse(raw);
  if (result.success) {
    return result.data as NoteProjection;
  }
  console.error(
    `[validation] Note projection validation failed: ${JSON.stringify(result.error.issues)}`,
  );
  return null;
}
