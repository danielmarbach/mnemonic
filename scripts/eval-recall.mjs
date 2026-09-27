#!/usr/bin/env node
// Deterministic recall-quality eval over tests/fixtures/recall-eval.
// Usage: node scripts/eval-recall.mjs [--json] [--ollama <url>] [--update-baseline]

import { execFile, spawn } from "child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import http from "http";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const fixtureDir = path.join(repoRoot, "tests", "fixtures", "recall-eval");
export const baselinePath = path.join(fixtureDir, "baseline.json");

const HASH_DIMENSIONS = 512;
const RECALL_LIMIT = 10;
const STOPWORDS = new Set(
  "a an and are as at be by do does for from how in is it of on or our the to we what when why with".split(
    " ",
  ),
);

function hashToken(token) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Feature-hashed bag of words: deterministic, offline, and topical enough to exercise fusion. */
export function hashEmbed(text) {
  const vector = new Array(HASH_DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token));
  for (const token of tokens) {
    const hash = hashToken(token);
    vector[hash % HASH_DIMENSIONS] += hash & 0x80000000 ? -1 : 1;
  }
  const norm = Math.hypot(...vector) || 1;
  return vector.map((value) => value / norm);
}

async function startHashEmbeddingServer() {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }
    let raw = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const { input } = JSON.parse(raw);
      const inputs = Array.isArray(input) ? input : [input];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ embeddings: inputs.map((text) => hashEmbed(String(text))) }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function startMcpSession(entryPoint, env) {
  const child = spawn("node", [entryPoint], {
    cwd: repoRoot,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let buffer = "";
  let stderr = "";
  let nextId = 1;
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = message.id === undefined ? undefined : pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
      } else {
        waiter.resolve(message.result);
      }
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("close", (code) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
    }
    pending.clear();
  });

  const call = (method, params) => {
    const id = nextId++;
    const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    return result;
  };
  const ready = call("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "eval-recall", version: "1.0" },
  }).then(() =>
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
    ),
  );

  return {
    callTool: async (name, args) => {
      await ready;
      const result = await call("tools/call", { name, arguments: args });
      if (result.isError) {
        throw new Error(`${name} failed: ${result.content?.[0]?.text ?? "unknown error"}`);
      }
      return result;
    },
    close: async () => {
      child.stdin.end();
      await new Promise((resolve) => child.once("close", resolve));
    },
  };
}

async function prepareEnvironment(fixture) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mnemonic-recall-eval-"));
  const vaultDir = path.join(root, "main-vault");
  const repoDir = path.join(root, "alpha");
  await cp(path.join(fixtureDir, "main-vault"), vaultDir, { recursive: true });
  await cp(path.join(fixtureDir, "project-vault"), path.join(repoDir, ".mnemonic"), {
    recursive: true,
  });
  await execFileAsync("git", ["init", "-q"], { cwd: repoDir });
  await execFileAsync("git", ["remote", "add", "origin", fixture.currentProject.remote], {
    cwd: repoDir,
  });
  return { root, vaultDir, repoDir };
}

function summarize(rows) {
  const kinds = [...new Set(rows.map((row) => row.kind))];
  return Object.fromEntries(
    kinds.map((kind) => {
      const group = rows.filter((row) => row.kind === kind);
      const mean = (select) =>
        Number((group.reduce((sum, row) => sum + select(row), 0) / group.length).toFixed(3));
      return [
        kind,
        {
          queries: group.length,
          mrrAt10: mean((row) => (row.rank ? 1 / row.rank : 0)),
          successAt1: mean((row) => (row.passed && row.rank === 1 ? 1 : 0)),
          successAt5: mean((row) => (row.passed && row.rank && row.rank <= 5 ? 1 : 0)),
        },
      ];
    }),
  );
}

/**
 * Runs every fixture query through recall and returns per-kind metrics plus per-query rows.
 * @param {{ entryPoint?: string, ollamaUrl?: string }} [options]
 */
export async function runRecallEval(options = {}) {
  const fixture = JSON.parse(await readFile(path.join(fixtureDir, "queries.json"), "utf-8"));
  const env = await prepareEnvironment(fixture);
  const embedder = options.ollamaUrl ? undefined : await startHashEmbeddingServer();
  const session = startMcpSession(options.entryPoint ?? path.join(repoRoot, "build", "index.js"), {
    ...process.env,
    VAULT_PATH: env.vaultDir,
    DISABLE_GIT: "true",
    OLLAMA_URL: options.ollamaUrl ?? embedder.url,
  });

  try {
    const detected = await session.callTool("detect_project", { cwd: env.repoDir });
    const detectedId = detected.structuredContent?.project?.id;
    if (detectedId !== fixture.currentProject.id) {
      throw new Error(
        `Fixture project id mismatch: expected ${fixture.currentProject.id}, got ${detectedId}`,
      );
    }

    const rows = [];
    for (const item of fixture.queries) {
      const result = await session.callTool("recall", {
        query: item.query,
        cwd: env.repoDir,
        limit: RECALL_LIMIT,
      });
      const ids = (result.structuredContent?.results ?? []).map((entry) => entry.id);
      const position = ids.indexOf(item.expected);
      const rank = position >= 0 ? position + 1 : undefined;
      const outrankedPosition = item.mustOutrank ? ids.indexOf(item.mustOutrank) : -1;
      const passed = rank !== undefined && (outrankedPosition < 0 || position < outrankedPosition);
      rows.push({
        kind: item.kind,
        query: item.query,
        expected: item.expected,
        rank,
        passed,
        top: ids[0],
      });
    }

    return { embedder: options.ollamaUrl ? "ollama" : "hash", metrics: summarize(rows), rows };
  } finally {
    await session.close();
    await embedder?.close();
    await rm(env.root, { recursive: true, force: true });
  }
}

function formatReport(report) {
  const lines = [`Recall eval (${report.embedder} embeddings, top ${RECALL_LIMIT})`, ""];
  lines.push("kind              queries  MRR@10  S@1    S@5");
  for (const [kind, metric] of Object.entries(report.metrics)) {
    lines.push(
      `${kind.padEnd(18)}${String(metric.queries).padEnd(9)}${metric.mrrAt10.toFixed(3).padEnd(8)}${metric.successAt1.toFixed(3).padEnd(7)}${metric.successAt5.toFixed(3)}`,
    );
  }
  const misses = report.rows.filter((row) => !row.passed || row.rank !== 1);
  if (misses.length > 0) {
    lines.push("", "Not ranked first:");
    for (const row of misses) {
      lines.push(
        `  [${row.kind}] "${row.query}" -> rank ${row.rank ?? "miss"}${row.passed ? "" : " (fail)"}, top: ${row.top ?? "none"}`,
      );
    }
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ollamaIndex = args.indexOf("--ollama");
  const ollamaUrl =
    ollamaIndex >= 0 ? (args[ollamaIndex + 1] ?? "http://localhost:11434") : undefined;
  const report = await runRecallEval({ ollamaUrl });
  if (args.includes("--update-baseline")) {
    if (ollamaUrl) {
      throw new Error("The baseline is recorded with hash embeddings only; drop --ollama.");
    }
    await writeFile(
      baselinePath,
      `${JSON.stringify({ embedder: report.embedder, metrics: report.metrics }, null, 2)}\n`,
    );
  }
  console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatReport(report));
}
