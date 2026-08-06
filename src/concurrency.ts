/**
 * Bounded-concurrency primitives.
 *
 * The single shared scheduling primitive for "map independent async work over a
 * collection without opening a descriptor / firing a request for every item at
 * once". Prefer this over hand-rolled `Array.from({ length }, async () => { while
 * (true) { ... } })` worker pools: it preserves input order in the result by
 * construction (each result is placed at its source index), so callers never
 * need a "workers append in completion order, sort afterward for determinism"
 * step.
 *
 * Design rule for callers:
 *  - Return a value per item and reduce post-loop. Do NOT mutate shared arrays
 *    or Maps from inside the per-item function — that reintroduces the
 *    nondeterministic-completion-order problem this helper exists to remove.
 *  - Express a "skip" as a sentinel return value (e.g. `null`) and filter after,
 *    rather than a `continue` inside the loop.
 *  - Keep each caller's own concurrency constant / config knob (the bound is
 *    domain-specific: bulk file reads, embedding backfills, note hydration all
 *    want different limits).
 *
 * Reserve a hand-rolled (or serial) loop only when the per-item body has an
 * intrinsic side effect on a shared structure that cannot be expressed as a
 * return value without a tagged-union dispatch that obscures the real axis of
 * change (e.g. `reconcile` unlinking files mid-loop, or a worker mutating a
 * shared `Map` while iterating). The concurrency parameter IS the file-
 * descriptor bound for file reads: N in-flight `fs.readFile` calls means at
 * most N open descriptors. Fixed-size `Promise.all` batching is the SAME bound
 * with sync barriers between batches (worse throughput for the same cap) —
 * prefer `mapWithConcurrency` over hand-rolled batching for bulk file reads.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await fn(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}
