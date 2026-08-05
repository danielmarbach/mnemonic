/**
 * Type declarations for `update-pr-description.mjs`.
 * The script is plain ESM JavaScript; this file provides the types consumed by
 * the tests that import it. Keep the shapes in sync with the implementation.
 */

/** Frontmatter subset consumed by the generator (parsed from YAML by `parseFrontmatter`). */
export interface NoteFrontmatter {
  title?: string;
  tags?: string | string[];
  role?: string;
  lifecycle?: string;
}

/** A parsed mnemonic note as consumed by the description generator. */
export interface ParsedNote {
  file: string;
  frontmatter: NoteFrontmatter;
  body: string;
}

/** RPIR workflow role / permanence classification. */
export type NoteClass = "research" | "plan" | "review" | "context" | "permanent";

/** Routing tier assigned by `routeTier`. */
export type RoutingTier = "A" | "B" | "C" | "D";

/** Semantic complexity level assigned by `scoreSemanticPaths`. */
export type SemanticComplexity = "low" | "normal" | "medium" | "high";

/** Result of `scoreSemanticPaths`. */
export interface SemanticScore {
  isTrivial: boolean;
  complexity: SemanticComplexity;
}

/** PR size statistics used for tier routing. */
export interface PrStats {
  changedFiles: number;
  additions: number;
  deletions: number;
  commits: number;
}

/** Hardcoded p75/p90 routing thresholds. */
export interface TierThresholds {
  files: { p75: number; p90: number };
  lines: { p75: number; p90: number };
  commits: { p75: number; p90: number };
}

/** Result of `parseFrontmatter`. */
export interface ParsedFrontmatter {
  frontmatter: NoteFrontmatter;
  body: string;
}

/** CLI entry point (invoked when run directly as a script). */
export declare function main(): Promise<void>;

/** Builds the opening line of the multi-note Summary section. */
export declare function buildSummaryIntro(hasBugs: boolean, hasEnhancements: boolean): string;

/** Classifies a note into its RPIR workflow role or 'permanent'. */
export declare function classifyNote(note: ParsedNote): NoteClass;

/** Generates the deterministic PR description from the given notes. */
export declare function generateDescription(notes: ParsedNote[]): string;

/** Generates the PR title from the given notes. */
export declare function generateTitle(notes: ParsedNote[]): string;

/** Returns true when the given text is likely a weak or unhelpful AI summary. */
export declare function isWeakSummary(text: string): boolean;

/** Parses the YAML frontmatter and markdown body from a mnemonic note file. */
export declare function parseFrontmatter(content: string): ParsedFrontmatter;

/** Routes a PR to one of four tiers based on size thresholds and semantic complexity. */
export declare function routeTier(
  stats: PrStats,
  changedPaths: string[],
  thresholds: TierThresholds,
): RoutingTier;

/** Scores the semantic complexity of a PR's changed file paths. */
export declare function scoreSemanticPaths(paths: string[]): SemanticScore;

/** Returns notes sorted by priority (bug > enhancement > design > other), stable. */
export declare function sortNotesByPriority(notes: ParsedNote[]): ParsedNote[];
