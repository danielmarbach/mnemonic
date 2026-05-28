// ── Error message extraction ─────────────────────────────────────────────────

export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ── Debug logging ─────────────────────────────────────────────────────────────

export function debugLog(scope: string, message: string): void {
  if (process.env.MNEMONIC_DEBUG) {
    console.error(`[${scope}] ${message}`);
  }
}

// ── Result type ───────────────────────────────────────────────────────────────

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ── attempt: fail-soft wrapper ────────────────────────────────────────────────

/**
 * Wrap an operation that may fail, returning a `Result` instead of throwing.
 * On failure, logs the error via `debugLog` with the given scope.
 *
 * Use `attempt` for every fail-soft path where the operation should not crash
 * the program. The returned `Result` forces callers to handle both outcomes
 * explicitly and makes fail-soft behavior scannable via ESLint.
 *
 * @example
 * // Fail-soft with explicit handling
 * const result = await attempt("cache:build", () => buildCache(projectId));
 * if (!result.ok) return undefined; // fallback
 * return result.value;
 *
 * @example
 * // Fail-soft with immediate default
 * const notes = await attempt("vault:list", () => vault.storage.listNotes(), []);
 * // notes is Note[] regardless — either the real list or []
 */
export async function attempt<T, E = Error>(
  scope: string,
  fn: () => Promise<T> | T,
  fallback?: T,
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    const message = getErrorMessage(error);
    debugLog(scope, `fail-soft: ${message}`);
    if (fallback !== undefined) {
      return { ok: true, value: fallback };
    }
    return { ok: false, error: error as E };
  }
}

export function attemptSync<T, E = Error>(scope: string, fn: () => T, fallback?: T): Result<T, E> {
  try {
    const value = fn();
    return { ok: true, value };
  } catch (error) {
    const message = getErrorMessage(error);
    debugLog(scope, `fail-soft: ${message}`);
    if (fallback !== undefined) {
      return { ok: true, value: fallback };
    }
    return { ok: false, error: error as E };
  }
}
