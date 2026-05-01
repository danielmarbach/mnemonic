import type { Note } from "./storage.js";
import type { EffectiveNoteMetadata } from "./role-suggestions.js";
import { MS_PER_DAY } from "./date-utils.js";

type ScoringMetadata = Pick<EffectiveNoteMetadata, "role" | "roleSource" | "importance" | "importanceSource" | "alwaysLoad" | "alwaysLoadSource">;

function explicitAlwaysLoad(metadata?: ScoringMetadata) {
  return metadata?.alwaysLoadSource === "explicit" ? metadata.alwaysLoad === true : false;
}

function roleBonus(
  role: EffectiveNoteMetadata["role"],
  source: EffectiveNoteMetadata["roleSource"],
  explicitBonuses: Partial<Record<NonNullable<EffectiveNoteMetadata["role"]>, number>>,
  suggestedBonuses: Partial<Record<NonNullable<EffectiveNoteMetadata["role"]>, number>>,
): number {
  if (!role) return 0;
  if (source === "explicit") return explicitBonuses[role] ?? 0;
  if (source === "suggested") return suggestedBonuses[role] ?? 0;
  return 0;
}

function importanceBonus(
  importance: EffectiveNoteMetadata["importance"],
  source: EffectiveNoteMetadata["importanceSource"],
  explicitBonuses: Partial<Record<NonNullable<EffectiveNoteMetadata["importance"]>, number>>,
  suggestedBonuses: Partial<Record<NonNullable<EffectiveNoteMetadata["importance"]>, number>>,
): number {
  if (!importance) return 0;
  if (source === "explicit") return explicitBonuses[importance] ?? 0;
  if (source === "suggested") return suggestedBonuses[importance] ?? 0;
  return 0;
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of",
  "in", "on", "at", "by", "with", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "shall", "can", "need", "needs", "note", "notes", "data",
  "this", "that", "these", "those", "it", "its", "we", "our", "you", "your",
  "when", "where", "which", "who", "whom", "whose", "why", "how", "what",
]);

const GENERIC_TERMS = new Set([
  "system", "note", "notes", "data", "file", "files", "config", "configuration",
  "setup", "update", "change", "fix", "bug", "feature", "task", "work",
  "project", "app", "application", "code", "implementation", "thing",
]);

const SYNONYMS: Record<string, string> = {
  auth: "authentication",
  authn: "authentication",
  login: "authentication",
  signin: "authentication",
  postgres: "postgresql",
  pg: "postgresql",
  db: "database",
  sql: "database",
  test: "testing",
  tests: "testing",
  spec: "testing",
  specs: "testing",
  infra: "infrastructure",
  deploy: "deployment",
  deployments: "deployment",
  endpoint: "api",
  endpoints: "api",
  config: "configuration",
  impl: "implementation",
  perf: "performance",
};

export function normalizeKeyword(keyword: string): string {
  const lower = keyword.toLowerCase();
  return SYNONYMS[lower] ?? lower;
}

export function extractKeywords(note: Note): string[] {
  const words: string[] = [];

  const titleWords = note.title.toLowerCase().split(/\s+/);
  words.push(...titleWords);

  words.push(...note.tags.map(t => t.toLowerCase()));

  const contentPrefix = note.content.slice(0, 200).toLowerCase();
  const contentWords = contentPrefix.split(/\s+/);
  words.push(...contentWords);

  const normalized = words
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 2)
    .map(w => normalizeKeyword(w))
    .filter(w => !STOPWORDS.has(w));

  return [...new Set(normalized)];
}

export function summarizePreview(content: string, maxLength = 120): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) {
    return singleLine;
  }
  return `${singleLine.slice(0, maxLength - 3)}...`;
}

export function classifyTheme(note: Note): string {
  const title = note.title.toLowerCase();
  const tags = new Set(note.tags.map((tag) => tag.toLowerCase()));

  if (tags.has("overview") || title.includes("overview")) return "overview";
  if (tags.has("decisions") || tags.has("design") || tags.has("policy") || tags.has("ux")) return "decisions";
  if (tags.has("tools") || tags.has("mcp") || tags.has("docker") || tags.has("deployment")) return "tooling";
  if (tags.has("bugs") || tags.has("setup")) return "bugs";
  if (tags.has("relationships") || tags.has("graph") || tags.has("architecture") || tags.has("structure")) return "architecture";
  if (tags.has("linting") || tags.has("tests") || tags.has("quality")) return "quality";
  return "other";
}

export function titleCaseTheme(theme: string): string {
  return `${theme[0]?.toUpperCase() ?? ""}${theme.slice(1)}`;
}

export function daysSinceUpdate(updatedAt: string, now: Date = new Date()): number {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    return 0;
  }
  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, diffMs / MS_PER_DAY);
}

export function recencyScore(daysSince: number): number {
  const capped = Math.min(daysSince, 30);
  return 1.0 - capped / 30;
}

export function centralityBonus(relatedCount: number): number {
  return Math.min(0.2, Math.log(relatedCount + 1) * 0.1);
}

function summaryMetadataBonus(metadata?: ScoringMetadata): number {
  if (!metadata) return 0;

  return roleBonus(
    metadata.role,
    metadata.roleSource,
    { summary: 0.18, decision: 0.12, reference: 0.06, context: 0.03 },
    { summary: 0.06, decision: 0.04, reference: 0.02, context: 0.01 },
  ) + importanceBonus(
    metadata.importance,
    metadata.importanceSource,
    { high: 0.12, normal: 0.06 },
    { high: 0.04, normal: 0.02 },
  );
}

export function withinThemeScore(note: Note, metadata?: ScoringMetadata, now?: Date): number {
  const days = daysSinceUpdate(note.updatedAt, now ?? new Date());
  const recency = recencyScore(days);
  const centrality = centralityBonus(note.relatedTo?.length ?? 0);
  return recency + centrality + summaryMetadataBonus(metadata);
}

export function computeConnectionDiversity(
  note: Note,
  themeCache: Map<string, string>
): number {
  if (!note.relatedTo || note.relatedTo.length === 0) return 0;

  const themes = new Set<string>();
  for (const rel of note.relatedTo) {
    const theme = themeCache.get(rel.id);
    if (theme) themes.add(theme);
  }
  return themes.size;
}

export function anchorScore(
  note: Note,
  themeCache: Map<string, string>,
  metadata?: ScoringMetadata,
  now?: Date
): number {
  if (note.lifecycle !== "permanent") return -Infinity;

  const days = daysSinceUpdate(note.updatedAt, now ?? new Date());
  const recency = 1.0 / (1 + days / 7);

  const centrality = Math.log((note.relatedTo?.length ?? 0) + 1);

  const connectionDiversity = computeConnectionDiversity(note, themeCache);

  const metadataRoleBonus = roleBonus(
    metadata?.role,
    metadata?.roleSource ?? "none",
    { summary: 0.22, decision: 0.16, reference: 0.08, context: 0.04 },
    { summary: 0.08, decision: 0.06, reference: 0.03, context: 0.015 },
  );
  const metadataImportanceBonus = importanceBonus(
    metadata?.importance,
    metadata?.importanceSource ?? "none",
    { high: 0.2, normal: 0.1 },
    { high: 0.06, normal: 0.03 },
  );
  const alwaysLoadBonus = explicitAlwaysLoad(metadata) ? 0.45 : 0;

  return 0.4 * centrality + 0.4 * connectionDiversity + 0.2 * recency + metadataRoleBonus + metadataImportanceBonus + alwaysLoadBonus;
}

function workingStateMetadataBonus(metadata?: ScoringMetadata): number {
  if (!metadata) return 0;

  return roleBonus(
    metadata.role,
    metadata.roleSource,
    { plan: 0.18, context: 0.12, summary: 0.08, decision: 0.04, reference: 0.02 },
    { plan: 0.06, context: 0.04, summary: 0.025, decision: 0.015, reference: 0.01 },
  ) + importanceBonus(
    metadata.importance,
    metadata.importanceSource,
    { high: 0.16, normal: 0.08 },
    { high: 0.05, normal: 0.025 },
  );
}

function workingStateStructureBonus(note: Note): number {
  const lines = note.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headingCount = lines.filter((line) => /^#{1,3}\s+/.test(line)).length;
  const bulletCount = lines.filter((line) => /^[-*]\s+/.test(line)).length;
  const numberedCount = lines.filter((line) => /^\d+\.\s+/.test(line)).length;
  const taskCount = lines.filter((line) => /^[-*]\s+\[[ xX]\]\s+/.test(line)).length;
  const paragraphCount = note.content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;

  return Math.min(
    0.22,
    headingCount * 0.05 +
      bulletCount * 0.02 +
      numberedCount * 0.03 +
      taskCount * 0.03 +
      Math.min(0.04, Math.max(0, paragraphCount - 1) * 0.01),
  );
}

export function workingStateScore(note: Note, metadata?: ScoringMetadata, now?: Date): number {
  if (note.lifecycle !== "temporary") return -Infinity;

  const days = daysSinceUpdate(note.updatedAt, now ?? new Date());
  const recency = Math.min(1.2, 1.2 / (1 + days / 3));
  const connectivity = Math.min(0.3, Math.log((note.relatedTo?.length ?? 0) + 1) * 0.12);
  const structureBonus = workingStateStructureBonus(note);

  return recency + connectivity + structureBonus + workingStateMetadataBonus(metadata);
}

export function extractNextAction(note: Pick<Note, "content">): string | undefined {
  const lines = note.content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line.replace(/^[-*]\s*/, "");
    if (/^(next step|next action|todo|follow-up)\s*:/i.test(normalized)) {
      return normalized.replace(/^(next step|next action|todo|follow-up)\s*:\s*/i, "").trim() || undefined;
    }
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (/^\d+\.\s+/.test(line) || /^[-*]\s+\[[ xX]\]\s+/.test(line) || /^[-*]\s+/.test(line)) {
      return line.replace(/^\d+\.\s+/, "").replace(/^[-*]\s+\[[ xX]\]\s+/, "").replace(/^[-*]\s+/, "").trim() || undefined;
    }
  }

  for (const line of lines) {
    const normalized = line.replace(/^[-*]\s*/, "");
    if (/^(continue|implement|investigate|fix|update|verify|run|add|remove|check|resume)\b/i.test(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

export function buildThemeCache(notes: Note[]): Map<string, string> {
  const cache = new Map<string, string>();
  for (const note of notes) {
    cache.set(note.id, classifyTheme(note));
  }
  return cache;
}

export interface GraduationOptions {
  minKeywordFrequency?: number;
}

export interface GraduationResult {
  themeAssignments: Map<string, string>;
  promotedThemes: string[];
  keywordFrequencies: Map<string, number>;
}

export function computeThemesWithGraduation(
  notes: Note[],
  options: GraduationOptions = {}
): GraduationResult {
  const minKeywordFrequency = options.minKeywordFrequency ?? 3;

  const noteKeywords = new Map<string, string[]>();
  for (const note of notes) {
    noteKeywords.set(note.id, extractKeywords(note));
  }

  const keywordFrequencies = new Map<string, number>();
  for (const keywords of noteKeywords.values()) {
    const unique = new Set(keywords);
    for (const kw of unique) {
      keywordFrequencies.set(kw, (keywordFrequencies.get(kw) ?? 0) + 1);
    }
  }

  const candidates: string[] = [];
  for (const [keyword, count] of keywordFrequencies) {
    if (
      count >= minKeywordFrequency &&
      !GENERIC_TERMS.has(keyword) &&
      !STOPWORDS.has(keyword)
    ) {
      candidates.push(keyword);
    }
  }

  candidates.sort((a, b) => {
    const freqDiff = keywordFrequencies.get(b)! - keywordFrequencies.get(a)!;
    if (freqDiff !== 0) return freqDiff;
    return a.localeCompare(b);
  });

  const themeAssignments = new Map<string, string>();
  const candidateSet = new Set(candidates);
  for (const note of notes) {
    const keywords = noteKeywords.get(note.id) ?? [];
    let assigned: string | null = null;

    const tagBased = classifyTheme(note);
    if (tagBased !== "other") {
      assigned = tagBased;
    } else {
      for (const kw of keywords) {
        if (candidateSet.has(kw)) {
          assigned = kw;
          break;
        }
      }
    }

    themeAssignments.set(note.id, assigned ?? "other");
  }

  return {
    themeAssignments,
    promotedThemes: candidates,
    keywordFrequencies,
  };
}

export function classifyThemeWithGraduation(
  note: Note,
  promotedThemes: Set<string> | string[]
): string {
  const promotedSet = promotedThemes instanceof Set ? promotedThemes : new Set(promotedThemes);
  const tagBased = classifyTheme(note);
  if (tagBased !== "other") return tagBased;

  const keywords = extractKeywords(note);
  for (const kw of keywords) {
    if (promotedSet.has(kw)) {
      return kw;
    }
  }

  return "other";
}
