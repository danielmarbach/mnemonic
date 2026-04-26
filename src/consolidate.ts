import type { Note, Relationship } from "./storage.js";
import type { ConsolidationMode } from "./project-memory-policy.js";

export type MergeRisk = "low" | "medium" | "high";

export interface ConsolidateNoteEvidence {
  id: string;
  title: string;
  lifecycle: "temporary" | "permanent";
  role?: Note["role"];
  ageDays: number;
  superseded: boolean;
  supersededBy?: string;
  supersededCount?: number;
  relatedCount: number;
  warnings?: string[];
  mergeRisk: MergeRisk;
}

function noteAgeDays(updatedAt: string, now: Date = new Date()): number {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return 0;
  }

  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

function buildSupersededByMap(notes: Array<Pick<Note, "id" | "relatedTo">>): Map<string, string> {
  const inbound = new Map<string, string>();
  for (const note of notes) {
    for (const rel of note.relatedTo ?? []) {
      if (rel.type !== "supersedes") continue;
      if (!inbound.has(rel.id)) {
        inbound.set(rel.id, note.id);
      }
    }
  }
  return inbound;
}

function isTemporaryResearchNote(note: Pick<Note, "lifecycle" | "role">): boolean {
  return note.lifecycle === "temporary" && note.role === "research";
}

export function buildMergeWarnings(
  notes: Array<Pick<Note, "id" | "title" | "lifecycle" | "role" | "updatedAt" | "relatedTo">>,
  targetNote?: Pick<Note, "id" | "updatedAt">,
): string[] {
  const warnings: string[] = [];

  if (notes.some(isTemporaryResearchNote)) {
    warnings.push("temporary research note in merge - consider whether it contains unique evidence");
  }

  if (notes.some((note) => (note.relatedTo ?? []).some((rel) => rel.type === "supersedes"))) {
    warnings.push("note supersedes another - merging may orphan the supersedes chain");
  }

  if (targetNote) {
    const targetUpdatedAt = new Date(targetNote.updatedAt);
    if (!Number.isNaN(targetUpdatedAt.getTime())) {
      const hasNewerSource = notes
        .filter((note) => note.id !== targetNote.id)
        .some((note) => {
          const updated = new Date(note.updatedAt);
          return !Number.isNaN(updated.getTime()) && updated.getTime() > targetUpdatedAt.getTime();
        });
      if (hasNewerSource) {
        warnings.push("newer note would be merged into older summary - stale summary risk");
      }
    }
  }

  const roleLifecycles = new Map<string, Set<"temporary" | "permanent">>();
  for (const note of notes) {
    if (!note.role) continue;
    const lifecycleSet = roleLifecycles.get(note.role) ?? new Set<"temporary" | "permanent">();
    lifecycleSet.add(note.lifecycle);
    roleLifecycles.set(note.role, lifecycleSet);
  }
  if (Array.from(roleLifecycles.values()).some((lifecycles) => lifecycles.size > 1)) {
    warnings.push("same role but different lifecycles - verify merge intent");
  }

  return warnings;
}

export function deriveMergeRisk(warnings: string[]): MergeRisk {
  if (warnings.length === 0) {
    return "low";
  }

  const hasCritical = warnings.some((warning) =>
    warning.includes("supersedes chain")
    || warning.includes("different lifecycles")
    || warning.includes("stale summary risk")
  );

  if (hasCritical || warnings.length >= 2) {
    return "high";
  }

  return "medium";
}

export function buildConsolidateNoteEvidence(
  note: Pick<Note, "id" | "title" | "lifecycle" | "role" | "updatedAt" | "relatedTo">,
  allNotes: Array<Pick<Note, "id" | "relatedTo">>,
  warnings?: string[],
  now: Date = new Date(),
): ConsolidateNoteEvidence {
  const supersededByMap = buildSupersededByMap(allNotes);
  const supersedes = (note.relatedTo ?? []).filter((rel) => rel.type === "supersedes");
  return {
    id: note.id,
    title: note.title,
    lifecycle: note.lifecycle,
    role: note.role,
    ageDays: noteAgeDays(note.updatedAt, now),
    superseded: supersedes.length > 0,
    supersededBy: supersededByMap.get(note.id),
    supersededCount: supersedes.length > 0 ? supersedes.length : undefined,
    relatedCount: note.relatedTo?.length ?? 0,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
    mergeRisk: deriveMergeRisk(warnings ?? []),
  };
}

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
