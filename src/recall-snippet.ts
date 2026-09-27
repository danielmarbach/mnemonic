import { tokenize } from "./lexical.js";

const DEFAULT_SNIPPET_LENGTH = 300;
// No stopword list, so it works in any language: terms that occur in many of the note's
// paragraphs weigh little, terms unique to one paragraph weigh most.
function queryTokens(query: string): Set<string> {
  return new Set(tokenize(query));
}

function isHeadingOnly(paragraph: string): boolean {
  return paragraph.split("\n").every((line) => /^#{1,6}\s/.test(line.trim()) || !line.trim());
}

/**
 * Cut `text` to at most `maxLength` characters around the first query match,
 * on word boundaries, marking removed text with an ellipsis.
 */
function windowAroundMatch(text: string, matchedTokens: string[], maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const lower = text.toLowerCase();
  const positions = matchedTokens
    .map((token) => lower.indexOf(token))
    .filter((position) => position >= 0);
  const firstMatch = positions.length > 0 ? Math.min(...positions) : 0;

  let start = Math.max(0, firstMatch - Math.floor(maxLength / 3));
  if (start > 0) {
    const nextSpace = text.indexOf(" ", start);
    start = nextSpace >= 0 && nextSpace < firstMatch ? nextSpace + 1 : start;
  }
  let end = Math.min(text.length, start + maxLength);
  if (end < text.length) {
    const lastSpace = text.lastIndexOf(" ", end);
    end = lastSpace > start ? lastSpace : end;
  }

  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/**
 * Pick the body paragraph that shares the most distinct query terms and return a
 * bounded window of it, or undefined when nothing matches or it would only repeat
 * the summary.
 */
export function selectQuerySnippet(
  content: string,
  query: string,
  summary: string,
  maxLength = DEFAULT_SNIPPET_LENGTH,
): string | undefined {
  const tokens = queryTokens(query);
  if (tokens.size === 0) {
    return undefined;
  }

  const paragraphs = content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !paragraph.startsWith("```") && !isHeadingOnly(paragraph))
    .map((paragraph) => ({ text: paragraph, tokens: new Set(tokenize(paragraph)) }));

  const paragraphFrequency = new Map<string, number>();
  for (const token of tokens) {
    paragraphFrequency.set(token, paragraphs.filter((p) => p.tokens.has(token)).length);
  }

  let best: { text: string; matched: string[]; score: number } | undefined;
  for (const paragraph of paragraphs) {
    const matched = [...tokens].filter((token) => paragraph.tokens.has(token));
    const score = matched.reduce((sum, token) => sum + 1 / (paragraphFrequency.get(token) ?? 1), 0);
    if (score > (best?.score ?? 0)) {
      best = { text: paragraph.text.replace(/\s+/g, " "), matched, score };
    }
  }

  if (!best) {
    return undefined;
  }

  const snippet = windowAroundMatch(best.text, best.matched, maxLength);
  const comparableSummary = summary.replace(/[`*_]/g, "").trim();
  const comparableSnippet = snippet.replace(/[`*_]/g, "").replace(/^…/, "").trim();
  if (comparableSummary && comparableSnippet.startsWith(comparableSummary.slice(0, 120))) {
    return undefined;
  }
  return snippet;
}
