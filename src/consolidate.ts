import type { Note, Relationship } from "./storage.js";
import type { ConsolidationMode } from "./project-memory-policy.js";

export function normalizeMergePlanSourceIds(sourceIds: string[]): string[] {
  return Array.from(new Set(sourceIds));
}

export function mergeRelationshipsFromNotes(
  notes: Array<Pick<Note, "relatedTo">>,
  sourceIds: Set<string>
): Relationship[] {
  const seen = new Set<string>();
  const merged: Relationship[] = [];

  for (const note of notes) {
    for (const rel of note.relatedTo ?? []) {
      if (sourceIds.has(rel.id)) {
        continue;
      }

      const key = `${rel.id}:${rel.type}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(rel);
    }
  }

  return merged;
}

export function filterRelationships(
  relationships: Relationship[] | undefined,
  noteIds: Iterable<string>
): Relationship[] | undefined {
  if (!relationships || relationships.length === 0) {
    return undefined;
  }

  const blocked = new Set(noteIds);
  const filtered = relationships.filter((rel) => !blocked.has(rel.id));
  if (filtered.length === relationships.length) {
    return relationships;
  }

  return filtered.length > 0 ? filtered : undefined;
}

export function resolveEffectiveConsolidationMode(
  sourceNotes: Array<Pick<Note, "lifecycle">>,
  fallbackMode: ConsolidationMode,
  explicitMode?: ConsolidationMode,
): ConsolidationMode {
  if (explicitMode) {
    return explicitMode;
  }

  if (sourceNotes.length > 0 && sourceNotes.every((note) => note.lifecycle === "temporary")) {
    return "delete";
  }

  return fallbackMode;
}
