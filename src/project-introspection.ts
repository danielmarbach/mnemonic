import type { Note } from "./storage.js";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of",
  "in", "on", "at", "by", "with", "from", "as", "is", "was", "are", "were", "been",
  "be", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "shall", "can", "need", "needs", "note", "notes", "data",
  "this", "that", "these", "those", "it", "its", "we", "our", "you", "your",
  "when", "where", "which", "who", "whom", "whose", "why", "how", "what",
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

export function daysSinceUpdate(updatedAt: string): number {
  const updated = new Date(updatedAt);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
}

export function recencyScore(daysSince: number): number {
  const capped = Math.min(daysSince, 30);
  return 1.0 - capped / 30;
}

export function centralityBonus(relatedCount: number): number {
  return Math.min(0.2, Math.log(relatedCount + 1) * 0.1);
}

export function withinThemeScore(note: Note): number {
  const days = daysSinceUpdate(note.updatedAt);
  const recency = recencyScore(days);
  const centrality = centralityBonus(note.relatedTo?.length ?? 0);
  return recency + centrality;
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
  themeCache: Map<string, string>
): number {
  if (note.lifecycle !== "permanent") return -Infinity;

  const days = daysSinceUpdate(note.updatedAt);
  const recency = 1.0 / (1 + days / 7);

  const centrality = Math.log((note.relatedTo?.length ?? 0) + 1);

  const connectionDiversity = computeConnectionDiversity(note, themeCache);

  return 0.4 * centrality + 0.4 * connectionDiversity + 0.2 * recency;
}

export function buildThemeCache(notes: Note[]): Map<string, string> {
  const cache = new Map<string, string>();
  for (const note of notes) {
    cache.set(note.id, classifyTheme(note));
  }
  return cache;
}
