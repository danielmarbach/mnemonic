import { tokenize } from "./lexical.js";

const DEFAULT_SNIPPET_LENGTH = 300;
const MIN_QUERY_TOKEN_LENGTH = 2;
const SNIPPET_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "do",
  "does",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "we",
  "what",
  "when",
  "why",
  "with",
]);

function significantQueryTokens(query: string): Set<string> {
  return new Set(
    tokenize(query).filter(
      (token) => token.length >= MIN_QUERY_TOKEN_LENGTH && !SNIPPET_STOPWORDS.has(token),
    ),
  );
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
  const queryTokens = significantQueryTokens(query);
  if (queryTokens.size === 0) {
    return undefined;
  }

  let best: { text: string; matched: string[] } | undefined;
  for (const paragraph of content.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (!trimmed || trimmed.startsWith("```") || isHeadingOnly(trimmed)) {
      continue;
    }
    const paragraphTokens = new Set(tokenize(trimmed));
    const matched = [...queryTokens].filter((token) => paragraphTokens.has(token));
    if (matched.length > (best?.matched.length ?? 0)) {
      best = { text: trimmed.replace(/\s+/g, " "), matched };
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
