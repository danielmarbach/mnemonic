/**
 * Type declarations for `dogfooding-runner-helpers.mjs`.
 * The script is plain ESM JavaScript; this file provides the types consumed by
 * the tests that import it. Keep the shapes in sync with the implementation.
 */

/**
 * Returns `Object.entries(summary?.themes ?? {})` — theme name to entry value.
 */
export declare function getSummaryThemeEntries(
  summary: { themes?: Record<string, unknown> } | null | undefined,
): [string, unknown][];

/**
 * Returns `recent?.notes ?? []` — the notes collected from recent memory.
 */
export declare function getRecentMemoryNotes(
  recent: { notes?: unknown[] } | null | undefined,
): unknown[];

/**
 * Returns `summary?.workingState?.notes ?? []` — notes describing the working state.
 */
export declare function getWorkingStateNotes(
  summary: { workingState?: { notes?: unknown[] } } | null | undefined,
): unknown[];
