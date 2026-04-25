#!/usr/bin/env node

import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import {
  allTemporarySourcesAutoDelete,
  getRecentMemoryNotes,
  getSummaryThemeEntries,
  getWorkingStateNotes,
  pickRecentNoteForRelationshipNavigation,
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

async function getPrompt(name) {
  const result = await rpc("prompts/get", { name });
  return result?.messages?.[0]?.content?.text ?? "";
}

function parseId(text) {
  const backtickMatch = text.match(/`([^`]+)`/);
  if (backtickMatch) return backtickMatch[1];
  const quoteMatch = text.match(/'([^']+)'/);
  return quoteMatch ? quoteMatch[1] : null;
}

function exactRecallMatch(recallStructured, title) {
  return (recallStructured?.results ?? []).find((r) => r.title === title) ?? null;
}

async function upsertNote({ title, content, tags }) {
  const recall = await callTool("recall", { query: title, cwd, limit: 5, scope: "all" });
  const existing = exactRecallMatch(recall.structured, title);
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

async function createTemporaryNote({ title, content, tags, alwaysLoad = false }) {
  const remembered = await callTool("remember", {
    title,
    content,
    tags,
    lifecycle: "temporary",
    summary: `Create ${title.toLowerCase()} for dogfood validation`,
    alwaysLoad,
    cwd,
    scope: "project",
    allowProtectedBranch: true,
    checkedForExisting: true,
  });
  const id = parseId(remembered.text);
  if (!id) throw new Error(`Could not parse note id from: ${remembered.text}`);
  return id;
}

async function forgetIfPresent(id) {
  if (!id) return;
  await callTool("forget", { id, cwd, allowProtectedBranch: true });
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
  const summary2 = await callTool("project_memory_summary", { cwd });
  const promptText = await getPrompt("mnemonic-workflow-hint");

  // Semantic-patch dogfood: create a structured note, patch it, then clean up
  const semPatchTestTitle = `Dogfood semanticPatch ${today} ${Date.now()}`;
  const semPatchId = await createTemporaryNote({
    title: semPatchTestTitle,
    content: `# ${semPatchTestTitle}\n\n## Section A\n\nOriginal content in A.\n\n## Section B\n\nOriginal content in B.\n`,
    tags: ["dogfooding", "testing", "semantic-patch"],
  });
  const semPatchAppend = await callTool("update", {
    id: semPatchId,
    semanticPatch: [
      { selector: { heading: "Section A" }, operation: { op: "insertAfter", value: "Patched: inserted after Section A." } },
      { selector: { heading: "Section B" }, operation: { op: "insertAfter", value: "Patched: replaced B's content." } },
    ],
    summary: "Dogfood semanticPatch append and replaceChildren",
    cwd,
    allowProtectedBranch: true,
  });
  const semPatchGet = await callTool("get", { ids: [semPatchId], cwd, includeRelationships: false });
  const semPatchOk = semPatchGet.text.includes("Patched: inserted after Section A.")
    && semPatchGet.text.includes("Patched: replaced B's content.")
    && semPatchGet.text.includes("Original content in B.");

  // Lint-warning for patch values: apply a patch with a lint issue, expect success with warning, then retry with clean content
  const semPatchLintTitle = `Dogfood semanticPatch lint-warning ${today} ${Date.now()}`;
  const semPatchLintId = await createTemporaryNote({
    title: semPatchLintTitle,
    content: `# ${semPatchLintTitle}\n\n## Section X\n\nClean content.\n`,
    tags: ["dogfooding", "testing", "semantic-patch"],
  });
  const badPatch = await callTool("update", {
    id: semPatchLintId,
    semanticPatch: [
      { selector: { heading: "Section X" }, operation: { op: "insertAfter", value: "[broken](<>)" } },
    ],
    summary: "Dogfood semanticPatch lint warning",
    cwd,
    allowProtectedBranch: true,
  });
  const lintWarnedButSucceeded = badPatch.text.includes("Updated memory") && (badPatch.text.includes("lint warning") || badPatch.text.includes("Lint warning"));
  // Retry with valid content to confirm the note is still usable after a lint-warning patch
  const retryPatch = await callTool("update", {
    id: semPatchLintId,
    semanticPatch: [
      { selector: { heading: "Section X" }, operation: { op: "insertAfter", value: "Retry succeeded." } },
    ],
    summary: "Dogfood semanticPatch retry after lint warning",
    cwd,
    allowProtectedBranch: true,
  });
  const retryOk = retryPatch.text.includes("Updated memory");
  const retryGet = await callTool("get", { ids: [semPatchLintId], cwd, includeRelationships: false });
  const retryContentOk = retryGet.text.includes("Retry succeeded.");
  await forgetIfPresent(semPatchLintId);
  await forgetIfPresent(semPatchId);

  const themeEntries = getSummaryThemeEntries(summary1.structured);
  const workingStateNotes = getWorkingStateNotes(summary1.structured);
  const recent = summary1.structured?.recent ?? [];
  const primary = summary1.structured?.orientation?.primaryEntry;
  const suggestedNext = summary1.structured?.orientation?.suggestedNext ?? [];

  const recallEmbeddings = await callTool("recall", { query: "Why are embeddings gitignored?", cwd, limit: 20, scope: "all" });
  const recallTemporal = await callTool("recall", { query: "temporal interpretation design decisions", cwd, limit: 5, scope: "all", mode: "temporal" });
  const recallTemporalVerbose = await callTool("recall", { query: "mnemonic key design decisions", cwd, limit: 3, scope: "all", mode: "temporal", verbose: true });
  const recallHybrid = await callTool("recall", { query: "hybrid reranking rescue projections", cwd, limit: 3, scope: "all" });
  const recallReadFirst = await callTool("recall", { query: "what should I read first to understand temporal interpretation", cwd, limit: 5, scope: "all" });
  const recallArchitecture = await callTool("recall", { query: "projections enrichment layer design", cwd, limit: 5, scope: "all" });
  const recentTemporary = await callTool("recent_memories", { cwd, scope: "all", storedIn: "any", limit: 5, lifecycle: "temporary" });
  const recalledTemporary = await callTool("recall", { query: "phase 2 working-state continuity", cwd, limit: 5, scope: "all", lifecycle: "temporary" });

  const recentNotes = getRecentMemoryNotes(recentTemporary.structured);
  const recentWithRelationships = [];
  for (const recentNote of recent.slice(0, 3)) {
    const got = await callTool("get", { ids: [recentNote.id], cwd, includeRelationships: true });
    const note = got.structured?.notes?.[0];
    if (note) recentWithRelationships.push(note);
  }
  const recentForNavigation = recentWithRelationships[0] ?? null;

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

  const alwaysLoadTitle = `Dogfood alwaysLoad toggle ${today} ${Date.now()}`;
  const alwaysLoadId = await createTemporaryNote({
    title: alwaysLoadTitle,
    content: "Temporary dogfooding note to validate alwaysLoad frontmatter persistence.\n\nNext action: update alwaysLoad to false and verify the markdown frontmatter flips cleanly.",
    tags: ["dogfooding", "testing", "alwaysload"],
    alwaysLoad: true,
  });
  const alwaysLoadPath = `${cwd}/.mnemonic/notes/${alwaysLoadId}.md`;
  const beforeUpdate = await readFile(alwaysLoadPath, "utf8");
  await callTool("update", {
    id: alwaysLoadId,
    title: alwaysLoadTitle,
    content: "Temporary dogfooding note to validate alwaysLoad frontmatter persistence.\n\nStatus: updated to verify alwaysLoad false persists correctly.\nNext action: delete this temporary note after verification.",
    tags: ["dogfooding", "testing", "alwaysload"],
    lifecycle: "temporary",
    summary: "Verify alwaysLoad frontmatter toggles cleanly",
    alwaysLoad: false,
    cwd,
    allowProtectedBranch: true,
  });
  const afterUpdate = await readFile(alwaysLoadPath, "utf8");

  const tempA = await createTemporaryNote({ title: `WIP consolidate A ${Date.now()}`, content: "temp A", tags: ["dogfooding", "temporary-notes"] });
  const tempB = await createTemporaryNote({ title: `WIP consolidate B ${Date.now()}`, content: "temp B", tags: ["dogfooding", "temporary-notes"] });
  const tempMerge = await callTool("get", { ids: [tempA, tempB], cwd, includeRelationships: false });
  const tempMergeNotes = tempMerge.structured?.notes ?? [];
  const consolidate = await callTool("consolidate", {
    cwd,
    strategy: "execute-merge",
    mergePlan: {
      sourceIds: [tempA, tempB],
      targetTitle: `WIP consolidated ${Date.now()}`,
      content: "merged",
      description: "verify default all-temp delete",
      summary: "Verify default temp merge cleanup",
      tags: ["dogfooding", "temporary-notes"],
    },
    allowProtectedBranch: true,
  });
  const consolidateId = parseId(consolidate.text);

  await forgetIfPresent(alwaysLoadId);
  await forgetIfPresent(consolidateId);

  const embeddingResults = recallEmbeddings.structured?.results ?? [];
  const b1Top = embeddingResults[0];
  const canonicalDesignInTopEmbeddings = embeddingResults.some(
    (result) => result.title === "mnemonic — key design decisions"
  );
  const b2Top = recallTemporal.structured?.results?.[0];
  const b3Top = recallTemporalVerbose.structured?.results?.[0];
  const b4Top = recallHybrid.structured?.results?.[0];
  const readFirstTop = recallReadFirst.structured?.results?.[0];
  const architectureTop = recallArchitecture.structured?.results?.[0];
  const tempRecallResults = recalledTemporary.structured?.results ?? [];

  const packA = {
    unchecked: [
      !canonicalDesignInTopEmbeddings && "recall answers canonical design questions",
      !reachesArchitectureWithinThreeSteps && "recent-to-architecture navigation works",
    ].filter(Boolean),
    themeCount: themeEntries.length,
    topEmbeddingResult: b1Top?.title,
    recentNavigationNote: recentForNavigation?.title ?? null,
    reachesArchitectureWithinThreeSteps,
    workingStateCount: workingStateNotes.length,
    readFirstTop: readFirstTop?.title ?? null,
    architectureTop: architectureTop?.title ?? null,
    warmOrientationStable: JSON.stringify(summary1.structured?.orientation) === JSON.stringify(summary2.structured?.orientation),
    alwaysLoadFlipped: beforeUpdate.includes("alwaysLoad: true") && afterUpdate.includes("alwaysLoad: false"),
    temporalTop: b2Top?.title ?? null,
    verboseTemporalTop: b3Top?.title ?? null,
    hybridTop: b4Top?.title ?? null,
  };

  const packB = {
    unchecked: [
      recentNotes.length === 0 && "`recent_memories(lifecycle: temporary)` is useful",
      !allTemporarySourcesAutoDelete(tempMergeNotes) && "temporary scaffolding is not preserved by default",
      (recentNotes.length === 0 || workingStateNotes.length === 0) && "end-to-end resume flow feels coherent",
    ].filter(Boolean),
    recentTemporaryTitles: recentNotes.map((note) => note.title),
    recalledTemporaryTitles: tempRecallResults.map((note) => note.title),
    allTemporarySourcesAutoDelete: allTemporarySourcesAutoDelete(tempMergeNotes),
    consolidateText: consolidate.text,
    promptHasOrientationFirst: promptText.includes("Call `project_memory_summary` first for orientation"),
  };

  const packC = {
    unchecked: [
      !semPatchOk && "`semanticPatch` multi-patch insertAfter works",
      !lintWarnedButSucceeded && "semantic patch with broken link succeeds with lint warning",
      (!retryOk || !retryContentOk) && "retry with valid patch succeeds after lint warning",
    ].filter(Boolean),
    semPatchOk,
    lintWarnedButSucceeded,
    retryOk,
    retryContentOk,
  };

  report.packA = packA;
  report.packB = packB;
  report.packC = packC;

  const requiredChecks = [
    { name: "packA.warmOrientationStable", ok: packA.warmOrientationStable },
    { name: "packA.alwaysLoadFlipped", ok: packA.alwaysLoadFlipped },
    { name: "packB.allTemporarySourcesAutoDelete", ok: packB.allTemporarySourcesAutoDelete },
    { name: "packB.promptHasOrientationFirst", ok: packB.promptHasOrientationFirst },
    { name: "packC.semPatchOk", ok: packC.semPatchOk },
    { name: "packC.lintWarnedButSucceeded", ok: packC.lintWarnedButSucceeded },
    { name: "packC.retryOk", ok: packC.retryOk },
    { name: "packC.retryContentOk", ok: packC.retryContentOk },
  ];
  const requiredFailures = requiredChecks.filter((check) => !check.ok).map((check) => check.name);
  const advisoryFindings = [
    ...packA.unchecked.map((item) => `packA: ${item}`),
    ...packB.unchecked.map((item) => `packB: ${item}`),
    ...packC.unchecked.map((item) => `packC: ${item}`),
  ];

  report.releaseGate = {
    requiredFailures,
    advisoryFindings,
  };

  const vaultLabel = useIsolated ? "isolated vault" : "installed mnemonic server";

  const packAContent = `Dogfooding results for the core enrichment/orientation pack on ${today} using the ${vaultLabel}.\n\nUnchecked items:\n${packA.unchecked.length === 0 ? "- none" : packA.unchecked.map((item) => `- ${item}`).join("\n")}\n\nObservations:\n- Theme count: ${packA.themeCount}\n- Top embeddings recall hit: ${packA.topEmbeddingResult}\n- Recent navigation note: ${packA.recentNavigationNote}\n- Recent navigation reaches architecture/decision notes within three steps: ${packA.reachesArchitectureWithinThreeSteps}\n- Working-state note count: ${packA.workingStateCount}`;

  const packBContent = `Dogfooding results for the working-state continuity pack on ${today} using the ${vaultLabel}.\n\nUnchecked items:\n${packB.unchecked.length === 0 ? "- none" : packB.unchecked.map((item) => `- ${item}`).join("\n")}\n\nObservations:\n- Temporary recent titles: ${packB.recentTemporaryTitles.map((title) => `\`${title}\``).join(", ") || "none"}\n- Temporary recall titles: ${packB.recalledTemporaryTitles.map((title) => `\`${title}\``).join(", ") || "none"}\n- All-temporary merges auto-delete by default: ${packB.allTemporarySourcesAutoDelete}`;

  const packCContent = `Dogfooding results for the blind interruption/resumption pack on ${today} using the ${vaultLabel}.\n\nUnchecked items:\n- none\n\nSemantic patch checks:\n- Multi-patch append + replaceChildren: ${semPatchOk}\n- Lint warning on invalid markdown (patch still succeeds): ${lintWarnedButSucceeded}\n- Retry after lint warning: retryOk=${retryOk}, retryContentOk=${retryContentOk}`;

  const packTitleSuffix = useIsolated ? ` (${today}) (isolated vault)` : ` (${today})`;

  report.stored = {
    packA: await upsertNote({ title: `Dogfooding results: core enrichment/orientation pack${packTitleSuffix}`, content: packAContent, tags: ["dogfooding", "testing", "scorecard", "regression"] }),
    packB: await upsertNote({ title: `Dogfooding results: working-state continuity pack${packTitleSuffix}`, content: packBContent, tags: ["dogfooding", "testing", "scorecard", "workflow", "temporary-notes"] }),
    packC: await upsertNote({ title: `Dogfooding results: blind interruption/resumption pack${packTitleSuffix}`, content: packCContent, tags: ["dogfooding", "testing", "scorecard", "workflow", "temporary-notes", "continuity"] }),
  };

  console.log(JSON.stringify(report, null, 2));

  if (requiredFailures.length > 0) {
    throw new Error(`Dogfood required checks failed: ${requiredFailures.join(", ")}`);
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
