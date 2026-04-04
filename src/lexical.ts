// ── Lexical normalization and scoring for hybrid recall ───────────────────────

/**
 * Normalize text for lightweight lexical matching.
 * Lowercases, strips punctuation, and collapses whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenize normalized text into individual tokens.
 */
export function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

/**
 * Compute Jaccard similarity between two token sets.
 * Returns 0 when both sets are empty.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute bigram Jaccard similarity between two strings.
 * Better for phrase-level matching than unigram Jaccard.
 */
export function bigramJaccardSimilarity(a: string, b: string): number {
  const aBigrams = new Set(bigrams(normalizeText(a)));
  const bBigrams = new Set(bigrams(normalizeText(b)));
  return jaccardSimilarity(aBigrams, bBigrams);
}

/**
 * Generate character bigrams from a string.
 */
function bigrams(text: string): string[] {
  const normalized = text.replace(/\s+/g, "");
  if (normalized.length < 2) return [];
  const result: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    result.push(normalized.slice(i, i + 2));
  }
  return result;
}

/**
 * Check if one string contains another as a substring (case-insensitive).
 */
export function containsSubstring(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Compute a composite lexical score between a query and projection text.
 *
 * Returns a value in [0, 1] combining:
 * - substring match bonus (0.4 weight) — exact phrase containment
 * - bigram Jaccard (0.35 weight) — phrase-level overlap
 * - unigram Jaccard (0.25 weight) — token-level overlap
 */
export function computeLexicalScore(query: string, projectionText: string): number {
  const queryNorm = normalizeText(query);
  const projNorm = normalizeText(projectionText);

  if (!queryNorm || !projNorm) return 0;

  // Substring bonus: does the query appear in the projection?
  const substringScore = containsSubstring(projNorm, queryNorm) ? 1.0 : 0;

  // Bigram Jaccard for phrase-level matching
  const bigramScore = bigramJaccardSimilarity(query, projectionText);

  // Unigram Jaccard for token-level matching
  const queryTokens = new Set(tokenize(query));
  const projTokens = new Set(tokenize(projectionText));
  const unigramScore = jaccardSimilarity(queryTokens, projTokens);

  return 0.4 * substringScore + 0.35 * bigramScore + 0.25 * unigramScore;
}

/**
 * Maximum number of candidates to consider for lexical rescue.
 */
export const LEXICAL_RESCUE_CANDIDATE_LIMIT = 20;

/**
 * Minimum lexical score to consider a rescue candidate.
 */
export const LEXICAL_RESCUE_THRESHOLD = 0.15;

/**
 * Maximum number of rescued candidates to return.
 */
export const LEXICAL_RESCUE_RESULT_LIMIT = 3;

/**
 * Confidence gate: determines whether semantic results are weak enough
 * to warrant lexical rescue.
 *
 * Returns true when the top semantic score is below the threshold
 * OR when there are no semantic results.
 */
export function shouldTriggerLexicalRescue(
  topSemanticScore: number | undefined,
  semanticResultCount: number
): boolean {
  if (semanticResultCount === 0) return true;
  if (topSemanticScore === undefined) return true;
  // Trigger rescue when the best semantic match is weak
  return topSemanticScore < 0.35;
}
