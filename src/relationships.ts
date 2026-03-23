import type { Note, Relationship } from "./storage.js";
import type { Vault } from "./vault.js";
import type { RelatedNotePreview, RelationshipPreview } from "./structured-content.js";
import { classifyTheme } from "./project-introspection.js";

const RECENTLY_CHANGED_DAYS = 5;
const HIGH_CONFIDENCE_CENTRALITY = 5;
const HIGH_CONFIDENCE_DAYS = 30;
const MEDIUM_CONFIDENCE_DAYS = 90;

const DEFAULT_RELATIONSHIP_LIMIT = 3;
const HARD_MAX_RELATIONSHIP_LIMIT = 5;

// ── Options ──────────────────────────────────────────────────────────────────

export interface RelationshipExpansionOptions {
  /** Active project ID for same-project boosting */
  activeProjectId?: string;
  /** Maximum related notes to show (default: 3, hard max: 5) */
  limit?: number;
  /** Whether to include global notes (default: true if directly related) */
  includeGlobal?: boolean;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

interface ScoredRelatedNote {
  note: Note;
  vault: Vault;
  relationType: Relationship["type"];
  score: number;
}

/**
 * Compute confidence for a related note (same logic as provenance.ts).
 */
function computeRelatedNoteConfidence(note: Note): "high" | "medium" | "low" {
  const now = new Date();
  const updatedDate = new Date(note.updatedAt);
  const daysSinceUpdate = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
  const centrality = note.relatedTo?.length ?? 0;

  if (note.lifecycle === "permanent" && centrality >= HIGH_CONFIDENCE_CENTRALITY && daysSinceUpdate < HIGH_CONFIDENCE_DAYS) {
    return "high";
  }

  if (daysSinceUpdate < MEDIUM_CONFIDENCE_DAYS) {
    return "medium";
  }

  return "low";
}

/**
 * Check if note is tagged as anchor.
 */
export function isAnchor(note: Note): boolean {
  return note.lifecycle === "permanent" &&
    note.tags.some(t => t.toLowerCase() === "anchor" || t.toLowerCase() === "alwaysload");
}

/**
 * Check if note was recently updated.
 */
export function isRecentlyUpdated(note: Note): boolean {
  const now = new Date();
  const updatedDate = new Date(note.updatedAt);
  const daysSinceUpdate = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
  return daysSinceUpdate < RECENTLY_CHANGED_DAYS;
}

/**
 * Compute deterministic score for a related note.
 * Higher score = higher priority for display.
 */
export function scoreRelatedNote(
  note: Note,
  activeProjectId?: string
): number {
  let score = 0;

  // Same project: strong boost (100 points)
  if (activeProjectId && note.project === activeProjectId) {
    score += 100;
  }

  // Anchor: medium boost (50 points)
  if (isAnchor(note)) {
    score += 50;
  }

  // Recently updated: small boost (20 points)
  if (isRecentlyUpdated(note)) {
    score += 20;
  }

  // High confidence: small boost (10 points)
  const confidence = computeRelatedNoteConfidence(note);
  if (confidence === "high") {
    score += 10;
  } else if (confidence === "medium") {
    score += 5;
  }

  return score;
}

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * Get all direct related notes for a given note.
 * Returns note + vault pairs for directly related notes only (1-hop).
 */
export async function getDirectRelatedNotes(
  note: Note,
  allVaults: Vault[],
  activeProjectId?: string
): Promise<ScoredRelatedNote[]> {
  const relatedIds = note.relatedTo?.map(r => r.id) ?? [];
  if (relatedIds.length === 0) {
    return [];
  }

  const scored: ScoredRelatedNote[] = [];

  for (const vault of allVaults) {
    for (const relatedId of relatedIds) {
      const relatedNote = await vault.storage.readNote(relatedId);
      if (!relatedNote) continue;

      const relationship = note.relatedTo!.find(r => r.id === relatedId);
      if (!relationship) continue;

      const score = scoreRelatedNote(relatedNote, activeProjectId);
      scored.push({
        note: relatedNote,
        vault,
        relationType: relationship.type,
        score,
      });
    }
  }

  // Sort by score descending, then by title for determinism
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.note.title.localeCompare(b.note.title);
  });

  return scored;
}

// ── Preview Construction ─────────────────────────────────────────────────────

/**
 * Build a compact related note preview.
 */
function buildRelatedNotePreview(
  scored: ScoredRelatedNote,
  activeProjectId?: string
): RelatedNotePreview {
  const { note, relationType } = scored;
  const theme = classifyTheme(note);

  return {
    id: note.id,
    title: note.title,
    projectId: note.project,
    theme: theme !== "other" ? theme : undefined,
    relationType,
    updatedAt: note.updatedAt,
    confidence: computeRelatedNoteConfidence(note),
  };
}

/**
 * Build bounded relationship preview for a note.
 * Returns undefined if no direct relations exist.
 */
export function buildRelationshipPreview(
  scoredRelated: ScoredRelatedNote[],
  options: RelationshipExpansionOptions
): RelationshipPreview | undefined {
  if (scoredRelated.length === 0) {
    return undefined;
  }

  const limit = Math.min(options.limit ?? DEFAULT_RELATIONSHIP_LIMIT, HARD_MAX_RELATIONSHIP_LIMIT);
  const shown = scoredRelated.slice(0, limit).map(s => buildRelatedNotePreview(s, options.activeProjectId));
  const truncated = scoredRelated.length > limit;

  return {
    totalDirectRelations: scoredRelated.length,
    shown,
    truncated,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point: get bounded relationship preview for a note.
 * Returns undefined if no relations exist or expansion fails.
 */
export async function getRelationshipPreview(
  note: Note,
  allVaults: Vault[],
  options: RelationshipExpansionOptions
): Promise<RelationshipPreview | undefined> {
  try {
    const scored = await getDirectRelatedNotes(note, allVaults, options.activeProjectId);
    return buildRelationshipPreview(scored, options);
  } catch {
    // Fail-soft: omit preview on error
    return undefined;
  }
}
