import { randomUUID } from "crypto";
import type { Note, NoteLifecycle, NoteRole } from "../storage.js";
import type { MemoryId } from "../brands.js";
import { memoryId } from "../brands.js";
import type { RelationshipPreview, RetrievalEvidence } from "../structured-content.js";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function makeId(title: string): MemoryId {
  const slug = slugify(title);
  const suffix = randomUUID().split("-")[0]!;
  return memoryId(slug ? `${slug}-${suffix}` : suffix);
}

export function describeLifecycle(lifecycle: NoteLifecycle): string {
  return `lifecycle: ${lifecycle}`;
}

export function formatNote(note: Note, score?: number, showRawRelated = true): string {
  const scoreStr = score !== undefined ? ` | similarity: ${score.toFixed(3)}` : "";
  const projectStr = note.project ? ` | project: ${note.projectName ?? note.project}` : " | global";
  const roleStr = note.role ? ` | **role: ${note.role}**` : "";
  const relStr = showRawRelated && note.relatedTo && note.relatedTo.length > 0
    ? `\n**related:** ${note.relatedTo.map((r) => `\`${r.id}\` (${r.type})`).join(", ")}`
    : "";
  return (
    `## ${note.title}\n` +
    `**id:** \`${note.id}\`${projectStr}${scoreStr}\n` +
    `**tags:** ${note.tags.join(", ") || "none"} | **${describeLifecycle(note.lifecycle)}**${roleStr} | **updated:** ${note.updatedAt}${relStr}\n\n` +
    note.content
  );
}

export function formatTemporalHistory(
  history: Array<{
    commitHash: string;
    timestamp: string;
    message: string;
    summary?: string;
    changeDescription?: string;
  }>
): string {
  if (history.length === 0) {
    return "**history:** no git history found";
  }

  const lines = ["**history:**"];
  for (const entry of history) {
    const summary = entry.summary ? ` — ${entry.summary}` : "";
    const changeDesc = entry.changeDescription ? ` (${entry.changeDescription})` : "";
    lines.push(`- \`${entry.commitHash.slice(0, 7)}\` ${entry.timestamp} — ${entry.message}${summary}${changeDesc}`);
  }
  return lines.join("\n");
}

export function formatRelationshipPreview(preview: RelationshipPreview): string {
  const shown = preview.shown
    .map(r => `${r.title} (\`${r.id}\`) [${r.relationType ?? "related-to"}]`)
    .join(", ");
  const more = preview.truncated
    ? ` [+${preview.totalDirectRelations - preview.shown.length} more]`
    : "";
  return `**related (${preview.totalDirectRelations}):** ${shown}${more}`;
}

export function toRecallFreshness(updatedAt: string): "today" | "thisWeek" | "thisMonth" | "older" {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return "older";
  }

  const DAY_MS = 1000 * 60 * 60 * 24;
  const FRESHNESS_TODAY_DAYS = 1;
  const FRESHNESS_THIS_WEEK_DAYS = 7;
  const FRESHNESS_THIS_MONTH_DAYS = 31;

  const ageDays = Math.max(0, (Date.now() - updated.getTime()) / DAY_MS);
  if (ageDays <= FRESHNESS_TODAY_DAYS) return "today";
  if (ageDays <= FRESHNESS_THIS_WEEK_DAYS) return "thisWeek";
  if (ageDays <= FRESHNESS_THIS_MONTH_DAYS) return "thisMonth";
  return "older";
}

export function toRecallRankBand(semanticRank?: number): "top3" | "top10" | "lower" {
  if (semanticRank !== undefined && semanticRank <= 3) return "top3";
  if (semanticRank !== undefined && semanticRank <= 10) return "top10";
  return "lower";
}

export function formatRetrievalEvidenceHint(evidence: RetrievalEvidence, role?: NoteRole): string {
  const rolePart = role ?? "untyped";
  const supersedesPart = evidence.superseded
    ? ` | supersedes ${evidence.supersededCount ?? 1} note${(evidence.supersededCount ?? 1) === 1 ? "" : "s"}`
    : "";
  return `${evidence.rankBand} | channels: ${evidence.channels.join(", ")} | ${evidence.projectRelevant ? "project-relevant" : "cross-project"}\n${rolePart}, ${evidence.freshness}${supersedesPart}`;
}