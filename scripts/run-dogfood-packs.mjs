#!/usr/bin/env node

import { spawn } from "child_process";
import path from "path";
import {
  getRecentMemoryNotes,
  getSummaryThemeEntries,
  getWorkingStateNotes,
} from "./dogfooding-runner-helpers.mjs";
import { createIsolatedDogfoodVault } from "./dogfooding-isolated-vault.mjs";

const useIsolated = process.argv.includes("--isolated");
let cwd = process.argv[2] && !process.argv[2].startsWith("--") ? new URL(`file://${process.argv[2]}`).pathname : process.cwd();
const today = new Date().toISOString().slice(0, 10);
const mnemonicEntrypoint = process.env.MNEMONIC_ENTRYPOINT;
let sessionChild;
let sessionStdoutBuffer = "";
let sessionNextId = 1;
const pendingResponses = new Map();

function spawnMnemonic() {
  if (mnemonicEntrypoint) {
    const entryPath = path.isAbsolute(mnemonicEntrypoint)
      ? mnemonicEntrypoint
      : path.resolve(process.cwd(), mnemonicEntrypoint);
    return spawn("node", [entryPath], { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
  }

  return spawn("mnemonic", [], { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
}

function ensureSession() {
  if (sessionChild) {
    return sessionChild;
  }

  sessionChild = spawnMnemonic();
  sessionChild.stdout.on("data", (chunk) => {
    sessionStdoutBuffer += chunk.toString();
    const lines = sessionStdoutBuffer.split("\n");
    sessionStdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pendingResponses.get(message.id);
      if (!waiter) continue;
      pendingResponses.delete(message.id);
      waiter.resolve(message.result);
    }
  });
  sessionChild.stderr.on("data", () => {
    // best-effort for the dogfood runner
  });
  sessionChild.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "dogfood-runner", version: "1.0" },
    },
  }) + "\n");
  return sessionChild;
}

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const child = ensureSession();
    const id = sessionNextId++;
    pendingResponses.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

async function callTool(name, args) {
  const result = await rpc("tools/call", { name, arguments: args });
  return { text: result?.content?.[0]?.text ?? "", structured: result?.structuredContent };
}

function parseId(text) {
  const backtickMatch = text.match(/`([^`]+)`/);
  if (backtickMatch) return backtickMatch[1];
  const quoteMatch = text.match(/'([^']+)'/);
  return quoteMatch ? quoteMatch[1] : null;
}

async function upsertNote({ title, content, tags }) {
  const recall = await callTool("recall", { query: title, cwd, limit: 5, scope: "all" });
  const existing = (recall.structured?.results ?? []).find((r) => r.title === title) ?? null;
  if (existing) {
    await callTool("get", { ids: [existing.id], cwd, includeRelationships: false });
    const updated = await callTool("update", {
      id: existing.id,
      title,
      content,
      tags,
      lifecycle: "permanent",
      summary: `Record ${title.toLowerCase()} results`,
      alwaysLoad: false,
      cwd,
      allowProtectedBranch: true,
    });
    return { id: existing.id, action: "update", text: updated.text };
  }
  const remembered = await callTool("remember", {
    title,
    content,
    tags,
    lifecycle: "permanent",
    summary: `Record ${title.toLowerCase()} results`,
    alwaysLoad: false,
    cwd,
    scope: "project",
    allowProtectedBranch: true,
    checkedForExisting: true,
  });
  return { id: parseId(remembered.text), action: "remember", text: remembered.text };
}

let _isolated = null;

async function main() {
  let isolated = null;

  if (useIsolated) {
    const sourceVault = path.join(cwd, ".mnemonic");
    isolated = await createIsolatedDogfoodVault(sourceVault);
    _isolated = isolated;
    cwd = path.dirname(isolated.vaultPath);
    console.error(`[isolated] vault at ${isolated.vaultPath}`);
  }

  const report = {};
  const summary1 = await callTool("project_memory_summary", { cwd });

  const themeEntries = getSummaryThemeEntries(summary1.structured);
  const workingStateNotes = getWorkingStateNotes(summary1.structured);
  const recent = summary1.structured?.recent ?? [];

  const recallEmbeddings = await callTool("recall", { query: "Why are embeddings gitignored?", cwd, limit: 20, scope: "all" });
  const recallTemporal = await callTool("recall", { query: "temporal interpretation design decisions", cwd, limit: 5, scope: "all", mode: "temporal" });
  const recallTemporalVerbose = await callTool("recall", { query: "mnemonic key design decisions", cwd, limit: 3, scope: "all", mode: "temporal", verbose: true });
  const recallHybrid = await callTool("recall", { query: "hybrid reranking rescue projections", cwd, limit: 3, scope: "all" });
  const recallReadFirst = await callTool("recall", { query: "what should I read first to understand temporal interpretation", cwd, limit: 5, scope: "all" });
  const recallArchitecture = await callTool("recall", { query: "projections enrichment layer design", cwd, limit: 5, scope: "all" });
  const recallRecentWeek = await callTool("recall", { query: "recent changes this week", cwd, limit: 5, scope: "all" });
  const recentTemporary = await callTool("recent_memories", { cwd, scope: "all", storedIn: "any", limit: 5, lifecycle: "temporary" });
  const recalledTemporary = await callTool("recall", { query: "phase 2 working-state continuity", cwd, limit: 5, scope: "all", lifecycle: "temporary" });

  const recentNotes = getRecentMemoryNotes(recentTemporary.structured);
  const recentWithRelationships = [];
  for (const recentNote of recent.slice(0, 3)) {
    const got = await callTool("get", { ids: [recentNote.id], cwd, includeRelationships: true });
    const note = got.structured?.notes?.[0];
    if (note) recentWithRelationships.push(note);
  }

  const architectureOrDecision = /architecture|decision/i;
  let reachesArchitectureWithinThreeSteps = false;
  for (const seed of recentWithRelationships) {
    if (architectureOrDecision.test(seed.title)) {
      reachesArchitectureWithinThreeSteps = true;
      break;
    }

    const hop1Relationships = seed.relationships?.shown ?? [];
    if (hop1Relationships.some((rel) => architectureOrDecision.test(rel.title))) {
      reachesArchitectureWithinThreeSteps = true;
      break;
    }

    for (const rel of hop1Relationships.slice(0, 3)) {
      const hop1 = await callTool("get", { ids: [rel.id], cwd, includeRelationships: true });
      const note1 = hop1.structured?.notes?.[0];
      if (!note1) continue;
      const hop2Titles = note1.relationships?.shown?.map((r) => r.title) ?? [];
      if (architectureOrDecision.test(note1.title) || hop2Titles.some((title) => architectureOrDecision.test(title))) {
        reachesArchitectureWithinThreeSteps = true;
        break;
      }
    }

    if (reachesArchitectureWithinThreeSteps) {
      break;
    }
  }

  const embeddingResults = recallEmbeddings.structured?.results ?? [];
  const b1Top = embeddingResults[0];
  const canonicalDesignInTopEmbeddings = embeddingResults.some(
    (result) => result.title === "mnemonic — key design decisions"
  );
  const b2Top = recallTemporal.structured?.results?.[0];
  const b3Top = recallTemporalVerbose.structured?.results?.[0];
  const b4Top = recallHybrid.structured?.results?.[0];
  const b5Results = recallRecentWeek.structured?.results ?? [];
  const b5HasResults = b5Results.length > 0;
  const readFirstTop = recallReadFirst.structured?.results?.[0];
  const architectureTop = recallArchitecture.structured?.results?.[0];
  const tempRecallResults = recalledTemporary.structured?.results ?? [];

  const packA = {
    advisory: [
      !canonicalDesignInTopEmbeddings && "recall answers canonical design questions",
      !reachesArchitectureWithinThreeSteps && "recent-to-architecture navigation works",
      !b5HasResults && "temporal filter not over-excluding",
    ].filter(Boolean),
    themeCount: themeEntries.length,
    topEmbeddingResult: b1Top?.title,
    reachesArchitectureWithinThreeSteps,
    workingStateCount: workingStateNotes.length,
    readFirstTop: readFirstTop?.title ?? null,
    architectureTop: architectureTop?.title ?? null,
    temporalTop: b2Top?.title ?? null,
    verboseTemporalTop: b3Top?.title ?? null,
    hybridTop: b4Top?.title ?? null,
    temporalFilterNotOverExcluding: b5HasResults,
  };

  const packB = {
    advisory: [
      recentNotes.length === 0 && "`recent_memories(lifecycle: temporary)` is useful",
      (recentNotes.length === 0 || workingStateNotes.length === 0) && "end-to-end resume flow feels coherent",
    ].filter(Boolean),
    recentTemporaryTitles: recentNotes.map((note) => note.title),
    recalledTemporaryTitles: tempRecallResults.map((note) => note.title),
  };

  report.packA = packA;
  report.packB = packB;

  const advisoryFindings = [
    ...packA.advisory.map((item) => `packA: ${item}`),
    ...packB.advisory.map((item) => `packB: ${item}`),
  ];

  report.advisoryFindings = advisoryFindings;

  const vaultLabel = useIsolated ? "isolated vault" : "installed mnemonic server";

  const packAContent = `Dogfooding results for the core enrichment/orientation pack on ${today} using the ${vaultLabel}.\n\nAdvisory findings:\n${packA.advisory.length === 0 ? "- none" : packA.advisory.map((item) => `- ${item}`).join("\n")}\n\nObservations:\n- Theme count: ${packA.themeCount}\n- Top embeddings recall hit: ${packA.topEmbeddingResult}\n- Recent navigation reaches architecture/decision notes within three steps: ${packA.reachesArchitectureWithinThreeSteps}\n- Working-state note count: ${packA.workingStateCount}\n- Temporal filter returns results: ${packA.temporalFilterNotOverExcluding}`;

  const packBContent = `Dogfooding results for the working-state continuity pack on ${today} using the ${vaultLabel}.\n\nAdvisory findings:\n${packB.advisory.length === 0 ? "- none" : packB.advisory.map((item) => `- ${item}`).join("\n")}\n\nObservations:\n- Temporary recent titles: ${packB.recentTemporaryTitles.map((title) => `\`${title}\``).join(", ") || "none"}\n- Temporary recall titles: ${packB.recalledTemporaryTitles.map((title) => `\`${title}\``).join(", ") || "none"}`;

  const packTitleSuffix = useIsolated ? ` (${today}) (isolated vault)` : ` (${today})`;

  report.stored = {
    packA: await upsertNote({ title: `Dogfooding results: core enrichment/orientation pack${packTitleSuffix}`, content: packAContent, tags: ["dogfooding", "testing", "scorecard", "regression"] }),
    packB: await upsertNote({ title: `Dogfooding results: working-state continuity pack${packTitleSuffix}`, content: packBContent, tags: ["dogfooding", "testing", "scorecard", "workflow", "temporary-notes"] }),
  };

  console.log(JSON.stringify(report, null, 2));

  if (advisoryFindings.length > 0) {
    console.error(`Advisory findings (non-blocking): ${advisoryFindings.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}).finally(async () => {
  if (sessionChild) {
    sessionChild.stdin.end();
  }
  if (_isolated) {
    await _isolated.cleanup();
    console.error("[isolated] cleaned up");
  }
});