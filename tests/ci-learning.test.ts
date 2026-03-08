import { describe, expect, it } from "vitest";

import {
  renderMarkdown,
  sanitizeOutput,
  summarizeVitestFailure,
} from "../scripts/ci/collect-test-failure.mjs";

describe("CI failure learning summarizer", () => {
  it("extracts failed tests, normalizes paths, and creates a stable signature", () => {
    const output = `
 RUN  v4.0.18 /home/runner/work/mnemonic/mnemonic

 FAIL  tests/mcp.integration.test.ts > local MCP script > supports global remember and forget with git disabled
Error: spawn ./scripts/mcp-local.sh ENOENT
 at /Users/example/dev/mnemonic/tests/mcp.integration.test.ts:12:34
`;

    const summary = summarizeVitestFailure(output, {
      command: "npm test",
      workflow: "CI",
      job: "build-and-test",
      event: "pull_request",
      ref: "refs/pull/1/merge",
      sha: "abcdef1234567",
      runId: "1234",
      runUrl: "https://github.com/example/repo/actions/runs/1234",
      runnerOs: "Linux",
      nodeVersion: "20",
    });

    expect(summary.failed_tests).toEqual([
      "tests/mcp.integration.test.ts > local MCP script > supports global remember and forget with git disabled",
    ]);
    expect(summary.failure_signature).toBe(
      "vitest|tests/mcp.integration.test.ts|error-spawn-scripts-mcp-local-sh-enoent"
    );
    expect(summary.lesson).toContain("machine-specific script paths");
  });

  it("provides a specific lesson for timeout failures", () => {
    const output = `
 FAIL  tests/mcp.integration.test.ts > local MCP script > supports global remember and forget with git disabled
Error: Test timed out in 5000ms.
`;

    const summary = summarizeVitestFailure(output, {
      command: "npm test",
      workflow: "CI",
      job: "build-and-test",
      event: "push",
      ref: "refs/heads/main",
      sha: "abcdef1234567",
      runId: "1234",
      runUrl: "https://github.com/example/repo/actions/runs/1234",
      runnerOs: "Linux",
      nodeVersion: "20",
    });

    expect(summary.failure_signature).toBe(
      "vitest|tests/mcp.integration.test.ts|error-test-timed-out-in-5000ms"
    );
    expect(summary.lesson).toContain("Increase the explicit test timeout");
  });

  it("renders a readable markdown artifact", () => {
    const markdown = renderMarkdown({
      workflow: "CI",
      job: "build-and-test",
      event: "pull_request",
      ref: "refs/pull/1/merge",
      sha: "abc123",
      run_id: "42",
      run_url: "https://github.com/example/repo/actions/runs/42",
      runner_os: "Linux",
      node_version: "20",
      command: "npm test",
      framework: "vitest",
      failed_tests: ["tests/example.test.ts > suite > test"],
      primary_test_file: "tests/example.test.ts",
      primary_error: "Error: Example failure",
      failure_signature: "vitest|tests/example.test.ts|error-example-failure",
      lesson: "Check the test assumptions.",
      key_excerpt: "FAIL  tests/example.test.ts",
    });

    expect(markdown).toContain("# CI Failure Learning");
    expect(markdown).toContain("Failure signature: `vitest|tests/example.test.ts|error-example-failure`");
    expect(markdown).toContain("## Proposed Lesson");
  });

  it("sanitizes repo and user-specific paths", () => {
    const sanitized = sanitizeOutput(
      "Error at /home/runner/work/mnemonic/mnemonic/tests/example.test.ts and /Users/alice/dev/mnemonic/file.ts"
    );

    expect(sanitized).toContain("<repo>");
    expect(sanitized).toContain("<user-path>");
  });
});
