/**
 * Branded types for domain primitives — prevent accidental misuse of plain strings.
 *
 * These types are nominal: a `MemoryId` is not assignable from `string` at the type level,
 * but at runtime it is just a string. Use assertion functions (e.g., `assertMemoryId`)
 * or type predicates (e.g., `isValidMemoryId`) to create branded values from plain strings
 * at trust boundaries. For internal code that constructs values from trusted sources,
 * the smart constructors (e.g., `memoryId()`) provide unchecked casts.
 */

// ── Brand helper ─────────────────────────────────────────────────────────────

/** Nominal brand: `Brand<string, B>` is assignable to `string` but not from `string`. */
export type Brand<T, B> = T & { readonly __brand: B };

// ── Domain primitives ─────────────────────────────────────────────────────────

/** Unique identifier for a memory note (slug + short UUID). */
export type MemoryId = Brand<string, "MemoryId">;

/** Stable identifier for a project (normalized git remote or slug). */
export type ProjectId = Brand<string, "ProjectId">;

/** Identifier for the embedding model used (e.g. "nomic-embed-text-v2-moe"). */
export type EmbeddingModelId = Brand<string, "EmbeddingModelId">;

/** ISO 8601 date string used for timestamps (createdAt, updatedAt). */
export type ISO8601DateString = Brand<string, "ISO8601DateString">;

// ── Validation patterns ────────────────────────────────────────────────────────

const MEMORY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// ── Type predicates (return boolean, enable narrowing) ────────────────────────

/** Check whether a value is a valid memory ID (alphanumeric, hyphens, underscores). */
export function isValidMemoryId(value: string): value is MemoryId {
  return MEMORY_ID_PATTERN.test(value);
}

/** Check whether a string is a valid ISO 8601 date string. */
export function isValidIsoDateString(value: string): value is ISO8601DateString {
  return !isNaN(Date.parse(value));
}

// ── Assertion functions (throw on invalid, narrow type on success) ───────────

/** Assert that a string is a valid memory ID. Throws on invalid input. */
export function assertMemoryId(value: string, label = "id"): asserts value is MemoryId {
  if (!MEMORY_ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${value} (must match ${MEMORY_ID_PATTERN.source})`);
  }
}

/** Assert that a string is a valid ISO 8601 date string. Throws on invalid input. */
export function assertIsoDateString(value: string, label = "date"): asserts value is ISO8601DateString {
  if (isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${label}: ${value} (not a valid ISO 8601 date string)`);
  }
}

// ── Smart constructors (unchecked casts for trusted internal code) ────────────

/** Create a `MemoryId` from a plain string (e.g., when generating from title + UUID). */
export function memoryId(id: string): MemoryId {
  return id as MemoryId;
}

/** Create a `ProjectId` from a plain string (e.g., normalized git remote). */
export function projectId(id: string): ProjectId {
  return id as ProjectId;
}

/** Create an `EmbeddingModelId` from a plain string. */
export function embeddingModelId(id: string): EmbeddingModelId {
  return id as EmbeddingModelId;
}

/** Create an `ISO8601DateString` from a plain ISO date string. */
export function isoDateString(date: string): ISO8601DateString {
  return date as ISO8601DateString;
}