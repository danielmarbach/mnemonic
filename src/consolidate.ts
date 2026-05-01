import type { Note, Relationship } from "./storage.js";
import type { ConsolidationMode } from "./project-memory-policy.js";
import { daysSince } from "./date-utils.js";

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
  return daysSince(updatedAt, now);
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

function majorityLifecycle(notes: Array<Pick<Note, "lifecycle">>): "temporary" | "permanent" | undefined {
  const counts = new Map<"temporary" | "permanent", number>();
  for (const note of notes) {
    counts.set(note.lifecycle, (counts.get(note.lifecycle) ?? 0) + 1);
  }
  let best: "temporary" | "permanent" | undefined;
  let bestCount = 0;
  for (const [lc, count] of counts) {
    if (count > bestCount) {
      best = lc;
      bestCount = count;
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (bestCount <= total - bestCount) {
    return undefined;
  }
  return best;
}

type NoteForWarnings = Pick<Note, "id" | "title" | "lifecycle" | "role" | "updatedAt" | "relatedTo">;

export function buildNoteWarnings(
  note: NoteForWarnings,
  allNotes: NoteForWarnings[],
  targetNote?: Pick<Note, "id" | "updatedAt">,
): string[] {
  const warnings: string[] = [];

  if (isTemporaryResearchNote(note)) {
    warnings.push("temporary research - consider whether it contains unique evidence");
  }

  const supersedesCount = (note.relatedTo ?? []).filter((rel) => rel.type === "supersedes").length;
  if (supersedesCount > 0) {
    warnings.push(`supersedes ${supersedesCount} other${supersedesCount > 1 ? "s" : ""} - merging may orphan the supersedes chain`);
  }

  if (targetNote && targetNote.id === note.id) {
    const targetUpdatedAt = new Date(targetNote.updatedAt);
    if (!Number.isNaN(targetUpdatedAt.getTime())) {
      const newerCount = allNotes
        .filter((n) => n.id !== targetNote.id)
        .reduce((count, n) => {
          const updated = new Date(n.updatedAt);
          return !Number.isNaN(updated.getTime()) && updated.getTime() > targetUpdatedAt.getTime()
            ? count + 1
            : count;
        }, 0);
      if (newerCount > 0) {
        warnings.push(`target is older than ${newerCount} source${newerCount > 1 ? "s" : ""} - stale summary risk`);
      }
    }
  }

  if (note.role) {
    const majority = majorityLifecycle(allNotes);
    if (majority && note.lifecycle !== majority) {
      warnings.push(`lifecycle (${note.lifecycle}) differs from group majority (${majority})`);
    }
  }

  return warnings;
}

export function buildGroupWarnings(
  notes: NoteForWarnings[],
  targetNote?: Pick<Note, "id" | "updatedAt">,
): string[] {
  const warnings: string[] = [];
  for (const note of notes) {
    const noteWarnings = buildNoteWarnings(note, notes, targetNote);
    for (const w of noteWarnings) {
      warnings.push(`${note.title}: ${w}`);
    }
  }
  return warnings;
}

export function deriveMergeRisk(warnings: string[]): MergeRisk {
  if (warnings.length === 0) {
    return "low";
  }

  const hasCritical = warnings.some((warning) =>
    warning.includes("supersedes chain")
    || warning.includes("stale summary risk")
  );

  if (hasCritical) {
    return "high";
  }

  if (warnings.length >= 2) {
    return "high";
  }

  return "medium";
}

export function aggregateMergeRisk(noteRisks: MergeRisk[]): MergeRisk {
  const riskOrder: Record<MergeRisk, number> = { low: 0, medium: 1, high: 2 };
  if (noteRisks.length === 0) return "low";
  return noteRisks.reduce((max, r) => riskOrder[r] > riskOrder[max] ? r : max, "low" as MergeRisk);
}

export function buildConsolidateNoteEvidence(
  note: NoteForWarnings,
  allNotes: NoteForWarnings[],
  targetNote?: Pick<Note, "id" | "updatedAt">,
  now: Date = new Date(),
): ConsolidateNoteEvidence {
  const supersededByMap = buildSupersededByMap(allNotes);
  const supersedes = (note.relatedTo ?? []).filter((rel) => rel.type === "supersedes");
  const noteWarnings = buildNoteWarnings(note, allNotes, targetNote);
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
    warnings: noteWarnings.length > 0 ? noteWarnings : undefined,
    mergeRisk: deriveMergeRisk(noteWarnings),
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
