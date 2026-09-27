import { readFile } from "fs/promises";
import { describe, expect, it } from "vitest";

import {
  baselinePath,
  runRecallEval,
  type RecallEvalKind,
  type RecallEvalMetric,
} from "../scripts/eval-recall.mjs";
import "./helpers/mcp.js";

type Baseline = { metrics: Partial<Record<RecallEvalKind, RecallEvalMetric>> };

describe("recall eval harness", () => {
  it("does not regress below the recorded baseline", async () => {
    const baseline = JSON.parse(await readFile(baselinePath, "utf-8")) as Baseline;
    const report = await runRecallEval();

    for (const [kind, expected] of Object.entries(baseline.metrics)) {
      const actual = report.metrics[kind as RecallEvalKind];
      expect(actual, `missing metrics for ${kind}`).toBeDefined();
      expect(actual?.queries, `${kind} query count`).toBe(expected.queries);
      for (const metric of ["mrrAt10", "successAt1", "successAt5"] as const) {
        expect(actual?.[metric], `${kind} ${metric}`).toBeGreaterThanOrEqual(expected[metric]);
      }
    }
  }, 120_000);

  it("is deterministic across runs", async () => {
    const [first, second] = [await runRecallEval(), await runRecallEval()];
    expect(second.rows).toEqual(first.rows);
  }, 120_000);
});
