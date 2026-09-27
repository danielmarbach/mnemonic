/**
 * Type declarations for `eval-recall.mjs`.
 * Keep the shapes in sync with the implementation.
 */

export type RecallEvalKind = "title" | "body" | "identifier" | "project-affinity" | "supersession";

export interface RecallEvalMetric {
  queries: number;
  mrrAt10: number;
  successAt1: number;
  successAt5: number;
}

export interface RecallEvalRow {
  kind: RecallEvalKind;
  query: string;
  expected: string;
  /** 1-based position of the expected note in the top results, undefined when missing. */
  rank: number | undefined;
  /** Expected note found and, for supersession queries, ranked above the superseded note. */
  passed: boolean;
  top: string | undefined;
}

export interface RecallEvalReport {
  embedder: "hash" | "ollama";
  metrics: Partial<Record<RecallEvalKind, RecallEvalMetric>>;
  rows: RecallEvalRow[];
}

export declare const fixtureDir: string;
export declare const baselinePath: string;

export declare function hashEmbed(text: string): number[];

export declare function runRecallEval(options?: {
  entryPoint?: string;
  ollamaUrl?: string;
}): Promise<RecallEvalReport>;
