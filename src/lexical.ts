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

const COMPOUND_SEPARATOR = /[_\-.:/]/u;
const CAMEL_BOUNDARY = /\p{Ll}\p{Lu}|\p{Lu}\p{Lu}\p{Ll}/u;
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/**
 * True for code-like words: camelCase, PascalCase with inner capitals, or alphanumeric
 * segments joined by `_`, `-`, `.`, `:` or `/` (snake_case, kebab-case, versions, paths).
 */
export function isCompoundIdentifier(word: string): boolean {
  const core = word.replace(EDGE_PUNCTUATION, "");
  if (core.length < 3) return false;
  if (CAMEL_BOUNDARY.test(core)) return true;
  return (
    core.split(COMPOUND_SEPARATOR).filter((segment) => /[\p{L}\p{N}]/u.test(segment)).length > 1
  );
}

/**
 * Extra tokens for one compound identifier: the separator-free joined form, so
 * `OUTBOX_POLL_INTERVAL_MS` and `outboxPollIntervalMs` share `outboxpollintervalms`,
 * plus camelCase parts, which normalizeText keeps glued together.
 */
function compoundIdentifierTokens(word: string): string[] {
  const core = word.replace(EDGE_PUNCTUATION, "");
  const joined = core.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const camelParts = core
    .split(COMPOUND_SEPARATOR)
    .filter((segment) => CAMEL_BOUNDARY.test(segment))
    .flatMap((segment) =>
      segment
        .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
        .toLowerCase()
        .split(" "),
    );
  return [joined, ...camelParts].filter(Boolean);
}

/**
 * Joined-form keys for the compound identifiers in a query, e.g. `rrfk` for `RRF_K`.
 * Documents carry the same keys as tokens, so a key match means the exact identifier
 * (in any spelling) appears in the note.
 */
export function queryIdentifierKeys(query: string): string[] {
  const keys = new Set<string>();
  for (const word of query.split(/\s+/)) {
    if (!isCompoundIdentifier(word)) continue;
    const [joined] = compoundIdentifierTokens(word);
    if (joined) {
      keys.add(joined);
    }
  }
  return [...keys];
}

/**
 * Tokenize normalized text into individual tokens.
 *
 * Compound identifiers additionally contribute their joined form and camelCase parts;
 * text without identifiers tokenizes exactly as `normalizeText(text).split(" ")`.
 */
export function tokenize(text: string): string[] {
  const tokens = normalizeText(text).split(" ").filter(Boolean);
  const seen = new Set(tokens);
  for (const word of text.split(/\s+/)) {
    if (!isCompoundIdentifier(word)) continue;
    for (const token of compoundIdentifierTokens(word)) {
      if (!seen.has(token)) {
        seen.add(token);
        tokens.push(token);
      }
    }
  }
  return tokens;
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
 * Compute normalized term frequency for a token list.
 */
export function computeTermFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  if (tokens.length === 0) return frequencies;

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  for (const [token, count] of frequencies) {
    frequencies.set(token, count / tokens.length);
  }

  return frequencies;
}

/**
 * Compute smoothed inverse document frequency for a tokenized corpus.
 */
export function computeInverseDocumentFrequency(documents: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  if (documents.length === 0) return idf;

  const documentFrequencies = new Map<string, number>();
  for (const document of documents) {
    for (const token of new Set(document)) {
      documentFrequencies.set(token, (documentFrequencies.get(token) ?? 0) + 1);
    }
  }

  for (const [token, frequency] of documentFrequencies) {
    idf.set(token, Math.log((1 + documents.length) / (1 + frequency)) + 1);
  }

  return idf;
}

/**
 * Compute cosine similarity between a query and document TF-IDF vectors.
 */
export function computeTfIdfCosineSimilarity(
  query: string,
  document: string,
  corpusEntries: string[],
): number {
  const corpusTokens = corpusEntries.map((entry) => tokenize(entry));
  const queryTokens = tokenize(query);
  const documentTokens = tokenize(document);

  if (queryTokens.length === 0 || documentTokens.length === 0 || corpusTokens.length === 0) {
    return 0;
  }

  const idf = computeInverseDocumentFrequency(corpusTokens);
  const queryTf = computeTermFrequency(queryTokens);
  const documentTf = computeTermFrequency(documentTokens);
  const vocabulary = new Set([...queryTf.keys(), ...documentTf.keys()]);

  let dotProduct = 0;
  let queryMagnitude = 0;
  let documentMagnitude = 0;

  for (const token of vocabulary) {
    const weight = idf.get(token) ?? 0;
    const queryWeight = (queryTf.get(token) ?? 0) * weight;
    const documentWeight = (documentTf.get(token) ?? 0) * weight;
    dotProduct += queryWeight * documentWeight;
    queryMagnitude += queryWeight * queryWeight;
    documentMagnitude += documentWeight * documentWeight;
  }

  if (queryMagnitude === 0 || documentMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(documentMagnitude));
}

export interface PreparedTfIdfDocument {
  id: string;
  text: string;
  tokens: string[];
}

export interface PreparedTfIdfCorpus {
  documents: PreparedTfIdfDocument[];
  idf: Map<string, number>;
}

export function prepareTfIdfCorpus(
  documents: Array<{ id: string; text: string }>,
): PreparedTfIdfCorpus {
  return prepareTfIdfCorpusFromTokenizedDocuments(
    documents.map((document) => ({
      id: document.id,
      text: document.text,
      tokens: tokenize(document.text),
    })),
  );
}

export function prepareTfIdfCorpusFromTokenizedDocuments(
  documents: PreparedTfIdfDocument[],
): PreparedTfIdfCorpus {
  return {
    documents,
    idf: computeInverseDocumentFrequency(documents.map((document) => document.tokens)),
  };
}

/**
 * Rank documents by TF-IDF cosine similarity for a query.
 */
export function rankDocumentsByTfIdf(
  query: string,
  documents: Array<{ id: string; text: string }>,
  limit: number,
  preparedCorpus?: PreparedTfIdfCorpus,
): Array<{ id: string; score: number }> {
  if (limit <= 0 || documents.length === 0) {
    return [];
  }

  const prepared = preparedCorpus ?? prepareTfIdfCorpus(documents);
  const queryTokens = tokenize(query);
  const idf = prepared.idf;

  return prepared.documents
    .map((document) => {
      const tfIdfScore = computeTfIdfCosineSimilarityWithPreparedData(
        queryTokens,
        document.tokens,
        idf,
      );
      const coverageScore = computeTfIdfWeightedQueryCoverage(queryTokens, document.tokens, idf);
      const titleScore = computeLexicalScore(query, extractProjectionTitle(document.text));
      return {
        id: document.id,
        score: tfIdfScore + 0.35 * coverageScore + 0.2 * titleScore,
      };
    })
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      return scoreDelta !== 0 ? scoreDelta : a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

function computeTfIdfCosineSimilarityWithPreparedData(
  queryTokens: string[],
  documentTokens: string[],
  idf: Map<string, number>,
): number {
  if (queryTokens.length === 0 || documentTokens.length === 0) {
    return 0;
  }

  const queryTf = computeTermFrequency(queryTokens);
  const documentTf = computeTermFrequency(documentTokens);
  const vocabulary = new Set([...queryTf.keys(), ...documentTf.keys()]);

  let dotProduct = 0;
  let queryMagnitude = 0;
  let documentMagnitude = 0;

  for (const token of vocabulary) {
    const weight = idf.get(token) ?? 0;
    const queryWeight = (queryTf.get(token) ?? 0) * weight;
    const documentWeight = (documentTf.get(token) ?? 0) * weight;
    dotProduct += queryWeight * documentWeight;
    queryMagnitude += queryWeight * queryWeight;
    documentMagnitude += documentWeight * documentWeight;
  }

  if (queryMagnitude === 0 || documentMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(documentMagnitude));
}

function computeTfIdfWeightedQueryCoverage(
  queryTokens: string[],
  documentTokens: string[],
  idf: Map<string, number>,
): number {
  const uniqueQueryTokens = Array.from(new Set(queryTokens));
  if (uniqueQueryTokens.length === 0) {
    return 0;
  }

  const documentTokenSet = new Set(documentTokens);
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const token of uniqueQueryTokens) {
    const weight = idf.get(token) ?? 0;
    totalWeight += weight;
    if (documentTokenSet.has(token)) {
      matchedWeight += weight;
    }
  }

  return totalWeight === 0 ? 0 : matchedWeight / totalWeight;
}

/**
 * Rank documents by IDF-weighted share of the query's tokens they contain, for the
 * full-text channel. Documents below the minimum score get no rank.
 */
export function rankDocumentsByQueryCoverage(
  query: string,
  documents: Array<{ id: string; tokens: string[] }>,
  limit: number,
  minimumScore: number,
): Array<{ id: string; score: number }> {
  const queryTokens = tokenize(query);
  if (limit <= 0 || documents.length === 0 || queryTokens.length === 0) {
    return [];
  }
  const idf = computeInverseDocumentFrequency(documents.map((document) => document.tokens));
  return documents
    .map((document) => ({
      id: document.id,
      score: computeTfIdfWeightedQueryCoverage(queryTokens, document.tokens, idf),
    }))
    .filter((entry) => entry.score > 0 && entry.score >= minimumScore)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function extractProjectionTitle(text: string): string {
  const titleLine = text.split("\n", 1)[0]?.trim();
  if (!titleLine) {
    return "";
  }

  return titleLine.startsWith("Title:") ? titleLine.slice("Title:".length).trim() : titleLine;
}

/**
 * Maximum number of candidates considered by the always-on lexical channel.
 */
export const LEXICAL_RETRIEVAL_CANDIDATE_LIMIT = 25;

/**
 * Maximum number of candidates returned by the always-on lexical channel.
 */
export const LEXICAL_RETRIEVAL_RESULT_LIMIT = 25;

/**
 * Minimum positive lexical signal for the always-on channel.
 */
export const LEXICAL_RETRIEVAL_THRESHOLD = 0.05;

/**
 * Maximum number of candidates returned by the full-text channel.
 */
export const FULL_TEXT_RETRIEVAL_RESULT_LIMIT = 25;

/**
 * Minimum IDF-weighted query coverage for the full-text channel.
 */
export const FULL_TEXT_RETRIEVAL_THRESHOLD = 0.5;

/**
 * Maximum number of candidates to consider for lexical rescue compatibility.
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
  semanticResultCount: number,
): boolean {
  if (semanticResultCount === 0) return true;
  if (topSemanticScore === undefined) return true;
  // Trigger rescue when the best semantic match is weak
  return topSemanticScore < 0.35;
}
