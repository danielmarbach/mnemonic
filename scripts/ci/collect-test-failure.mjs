#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export async function main() {
  const inputPath = requiredArg("input");
  const outDir = requiredArg("outdir");
  const command = args.command ?? "npm test";

  const rawOutput = await fs.readFile(path.resolve(inputPath), "utf-8");
  const summary = summarizeVitestFailure(rawOutput, {
    command,
    workflow: process.env["GITHUB_WORKFLOW"] ?? "local",
    job: process.env["GITHUB_JOB"] ?? "local",
    event: process.env["GITHUB_EVENT_NAME"] ?? "local",
    ref: process.env["GITHUB_REF"] ?? "local",
    sha: process.env["GITHUB_SHA"] ?? "local",
    runId: process.env["GITHUB_RUN_ID"] ?? "local",
    runUrl: buildRunUrl(),
    runnerOs: process.env["RUNNER_OS"] ?? process.platform,
    nodeVersion: process.version.replace(/^v/, ""),
  });

  await fs.mkdir(path.resolve(outDir), { recursive: true });
  await fs.writeFile(path.join(outDir, "ci-failure-raw.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
  await fs.writeFile(path.join(outDir, "ci-learning.md"), renderMarkdown(summary), "utf-8");
}

export function summarizeVitestFailure(output, metadata) {
  const cleaned = sanitizeOutput(output);
  const failedTests = extractFailedTests(cleaned);
  const primaryError = extractPrimaryError(cleaned);
  const primaryTestFile = failedTests[0]?.split(" > ")[0] ?? "unknown";
  const failureSignature = [
    "vitest",
    primaryTestFile,
    slugify(normalizeErrorForSignature(primaryError)),
  ].join("|");

  return {
    workflow: metadata.workflow,
    job: metadata.job,
    event: metadata.event,
    ref: metadata.ref,
    sha: metadata.sha,
    run_id: metadata.runId,
    run_url: metadata.runUrl,
    runner_os: metadata.runnerOs,
    node_version: metadata.nodeVersion,
    command: metadata.command,
    framework: "vitest",
    failed_tests: failedTests,
    primary_test_file: primaryTestFile,
    primary_error: primaryError,
    failure_signature: failureSignature,
    lesson: inferLesson(primaryError, failedTests),
    key_excerpt: extractKeyExcerpt(cleaned),
  };
}

export function renderMarkdown(summary) {
  const lines = [];
  lines.push("# CI Failure Learning");
  lines.push("");
  lines.push(`- Workflow: ${summary.workflow}`);
  lines.push(`- Job: ${summary.job}`);
  lines.push(`- Event: ${summary.event}`);
  lines.push(`- Ref: ${summary.ref}`);
  lines.push(`- SHA: ${summary.sha}`);
  lines.push(`- Run ID: ${summary.run_id}`);
  if (summary.run_url) lines.push(`- Run URL: ${summary.run_url}`);
  lines.push(`- Runner OS: ${summary.runner_os}`);
  lines.push(`- Node.js: ${summary.node_version}`);
  lines.push(`- Command: ${summary.command}`);
  lines.push(`- Failure signature: \`${summary.failure_signature}\``);
  lines.push("");
  lines.push("## Failed Tests");
  lines.push("");
  if (summary.failed_tests.length === 0) {
    lines.push("- No individual failed tests could be parsed from the output.");
  } else {
    for (const failedTest of summary.failed_tests) {
      lines.push(`- ${failedTest}`);
    }
  }
  lines.push("");
  lines.push("## Primary Error");
  lines.push("");
  lines.push(summary.primary_error);
  lines.push("");
  lines.push("## Proposed Lesson");
  lines.push("");
  lines.push(summary.lesson);
  lines.push("");
  lines.push("## Key Excerpt");
  lines.push("");
  lines.push("```text");
  lines.push(summary.key_excerpt);
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function sanitizeOutput(output) {
  return stripAnsi(output)
    .replace(/\/Users\/[^\s:]+/g, "<user-path>")
    .replace(/\/home\/runner\/work\/[^\s:]+/g, "<repo>")
    .replace(/\/tmp\/[A-Za-z0-9._-]+/g, "<tmp>")
    .replace(/[A-Fa-f0-9]{7,40}/g, "<hash>");
}

function extractFailedTests(output) {
  const matches = [...output.matchAll(/^ FAIL\s+(.+)$/gm)];
  return matches.map((match) => match[1].trim());
}

function extractPrimaryError(output) {
  const errorMatch = output.match(/^(Error:\s+.+)$/m);
  if (errorMatch) {
    return errorMatch[1].trim();
  }

  const failLine = output.match(/^ FAIL\s+(.+)$/m);
  if (failLine) {
    return `Vitest failure in ${failLine[1].trim()}`;
  }

  return "Vitest failed without a parsed error message";
}

function normalizeErrorForSignature(error) {
  return error
    .toLowerCase()
    .replace(/<repo>/g, "repo")
    .replace(/<user-path>/g, "path")
    .replace(/<tmp>/g, "tmp")
    .replace(/<hash>/g, "hash");
}

function inferLesson(primaryError, failedTests) {
  const lowered = primaryError.toLowerCase();
  const primaryTestFile = failedTests[0]?.split(" > ")[0];

  if (lowered.includes("enoent") && lowered.includes("mcp-local.sh")) {
    return "Avoid machine-specific script paths in tests. Resolve local helper scripts relative to the repository or the current test file so they work on CI runners and developer machines.";
  }

  if (lowered.includes("connection refused") || lowered.includes("ollama")) {
    return "Keep CI tests hermetic. Prefer a fake local embeddings endpoint or graceful best-effort embedding behavior over requiring a live Ollama daemon in CI.";
  }

  if (lowered.includes("timed out")) {
    return "This failure looks like a slow-but-valid integration path on CI. Increase the explicit test timeout or reduce process startup overhead so the test remains reliable on shared runners.";
  }

  if (primaryTestFile) {
    return `Review ${primaryTestFile} for assumptions that depend on local machine state, transient environment details, or missing test isolation.`;
  }

  return "Review the failing command for environment assumptions, portability issues, and missing isolation before promoting this failure into long-term memory.";
}

function extractKeyExcerpt(output) {
  const lines = output.split("\n");
  const failIndex = lines.findIndex((line) => line.startsWith(" FAIL "));
  const start = failIndex >= 0 ? failIndex : Math.max(0, lines.length - 12);
  return lines.slice(start, start + 12).join("\n").trim();
}

function slugify(value) {
  return value
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function requiredArg(name) {
  const value = args[name];
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

function buildRunUrl() {
  const serverUrl = process.env["GITHUB_SERVER_URL"];
  const repository = process.env["GITHUB_REPOSITORY"];
  const runId = process.env["GITHUB_RUN_ID"];
  if (!serverUrl || !repository || !runId) {
    return undefined;
  }
  return `${serverUrl}/${repository}/actions/runs/${runId}`;
}
