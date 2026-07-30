#!/usr/bin/env node
/**
 * Pack D — Document-source attachment dogfood pack.
 *
 * Drives the LOCAL build (build/index.js) over stdio against an isolated temp
 * environment and exercises the full document-source contract:
 *
 *   D1  add_attachment (kind: document-source) persisted config
 *   D2  list_attachments shows the document-source
 *   D3  sync indexes documents/chunks from a pinned git revision
 *   D4  recall surfaces document-chunk candidates (lexical channel)
 *   D5  get resolves chunk: and doc: retrieval handles to exact source text
 *   D6  mutation tools reject doc:/chunk: handles (ImmutableDocumentSourceError)
 *   D7  scope guard: document chunks excluded from scope: "global"
 *   D8  mode guard: document chunks excluded from temporal/workflow mode + tag/lifecycle filters
 *   D9  per-document chunk cap (<= 5 chunks per documentId)
 *   D10 teardown: remove_attachment by projectSlug
 *
 * Isolation: reuses the shared `createIsolatedDogfoodVault` helper for the
 * consumer workspace (temp copy of the mnemonic project vault). Two extra
 * pieces the shared helper does not cover, because packs A/B/C never needed
 * them:
 *   - a temp VAULT_PATH (main vault) so attachment-config writes stay isolated
 *     (attachments persist config to the main vault, not the project vault);
 *   - a temp document-source repo (the external thing being attached).
 *
 * The copied workspace's `origin` is removed so project-vault git sync cannot
 * reach the real mnemonic remote; the temp document-source repo carries its own
 * origin, which is the only remote sync ever touches.
 *
 * Generations are in-memory (MVP), so add -> sync -> recall -> get MUST run in
 * one spawned session.
 *
 * Usage:
 *   node scripts/dogfood-document-source.mjs
 *   MNEMONIC_ENTRYPOINT=build/index.js node scripts/dogfood-document-source.mjs
 */
import { spawn, execSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIsolatedDogfoodVault } from "./dogfooding-isolated-vault.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENTRYPOINT = process.env.MNEMONIC_ENTRYPOINT
  ? path.resolve(ROOT, process.env.MNEMONIC_ENTRYPOINT)
  : path.join(ROOT, "build", "index.js");

// Distinctive tokens so lexical recall is unambiguous and not confounded by
// existing vault vocabulary.
const ZETA = "zeta-workflow-engine";
const FLORGNART = "florgnart-bottleneck";

const bigZetaDoc = `# Zeta Workflow Engine

The ${ZETA} orchestrates durable sagas across bounded contexts.

## Zeta Saga Initiation

When a ${ZETA} saga starts, the coordinator emits a starter event on the bus.

## Zeta Compensation Ordering

The ${ZETA} reverses steps in strict reverse-completion order.

## Zeta Checkpoint Storage

Every ${ZETA} transition is persisted to the checkpoint table before ack.

## Zeta Timeout Handling

The ${ZETA} escalates stalled steps to the timeout warden after 30s.

## Zeta Idempotency Keys

Each ${ZETA} command carries a client-supplied idempotency key.

## Zeta Retry Backoff

The ${ZETA} applies exponential backoff with full jitter on retries.

## Zeta Parallel Fan-out

A ${ZETA} step may fan out sibling commands that complete out of order.

## Zeta Observability Hooks

The ${ZETA} emits structured spans for every state transition.

## Zeta Versioning Contract

A ${ZETA} saga definition is versioned and immutable once published.

## Zeta Failure Semantics

A ${ZETA} step either succeeds durably or triggers compensation.

## Zeta Concurrency Limits

The ${ZETA} caps in-flight sagas per tenant to prevent overload.
`;

const florgnartDoc = `# Florgnart Incident Runbook

## Diagnosing a ${FLORGNART}

A ${FLORGNART} manifests as a stalled queue with rising consumer lag.

## Mitigating the ${FLORGNART}

Shed load at the edge and drain the ${FLORGNART} backlog before scaling consumers.
`;

let child;
let buf = "";
let nextId = 1;
const pending = new Map();

function ensureSession(env) {
  if (child) return child;
  child = spawn("node", [ENTRYPOINT], { cwd: ROOT, env, stdio: ["pipe", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      const w = pending.get(msg.id);
      if (!w) continue;
      pending.delete(msg.id);
      w.resolve(msg);
    }
  });
  child.stderr.on("data", () => {});
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "dogfood-document-source", version: "1.0" },
      },
    }) + "\n",
  );
  return child;
}

function rpc(method, params, env) {
  return new Promise((resolve, reject) => {
    const c = ensureSession(env);
    const id = nextId++;
    pending.set(id, { resolve, reject });
    c.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

async function call(name, args, env) {
  const msg = await rpc("tools/call", { name, arguments: args }, env);
  const result = msg.result ?? msg;
  return {
    text: result?.content?.[0]?.text ?? "",
    structured: result?.structuredContent,
    isError: result?.isError === true,
  };
}

function git(repo, ...args) {
  return execSync(`git -C ${JSON.stringify(repo)} ${args.map((a) => JSON.stringify(a)).join(" ")}`, {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString().trim();
}

async function setupDocumentSourceRepo(base) {
  const docsource = path.join(base, "docsource");
  await mkdir(path.join(docsource, "docs"), { recursive: true });
  await writeFile(path.join(docsource, "docs", "zeta.md"), bigZetaDoc);
  await writeFile(path.join(docsource, "docs", "florgnart.md"), florgnartDoc);
  await writeFile(path.join(docsource, "README.md"), "# docsource\nNot under docs/, excluded by include glob.\n");
  git(docsource, "init", "-b", "main");
  for (const [k, v] of [["user.email", "dogfood@example.com"], ["user.name", "dogfood"], ["commit.gpgsign", "false"]])
    git(docsource, "config", k, v);
  git(docsource, "add", ".");
  git(docsource, "commit", "-m", "docs");
  // add_attachment requires `origin`; document-sync resolves `origin/HEAD`.
  git(docsource, "remote", "add", "origin", docsource);
  git(docsource, "fetch", "origin");
  git(docsource, "remote", "set-head", "origin", "-a");
  return docsource;
}

async function setupTempMainVault() {
  const mainVault = await mkdtemp(path.join(tmpdir(), "mnemonic-docsource-main-"));
  git(mainVault, "init", "-b", "main");
  for (const [k, v] of [["user.email", "dogfood@example.com"], ["user.name", "dogfood"], ["commit.gpgsign", "false"]])
    git(mainVault, "config", k, v);
  return mainVault;
}

const checks = [];
function record(id, label, pass, detail) {
  checks.push({ id, label, pass, detail });
}

async function main() {
  // Reuse the shared isolated-vault helper for the consumer workspace.
  const isolated = await createIsolatedDogfoodVault(path.join(ROOT, ".mnemonic"));
  const cwd = isolated.tempRoot;
  // Neutralize the copied origin so project-vault sync cannot reach the real
  // mnemonic remote. Identity then falls back to the temp folder name, which is
  // consistent across all tool calls in this session.
  try {
    git(cwd, "remote", "remove", "origin");
  } catch {}
  // Keep the workspace hermetic from the host's git signing agent.
  try {
    git(cwd, "config", "commit.gpgsign", "false");
  } catch {}

  const mainVault = await setupTempMainVault();
  const docsource = await setupDocumentSourceRepo(cwd);
  const env = {
    ...process.env,
    VAULT_PATH: mainVault,
    // Belt-and-suspenders: force unsigned commits for any server-side vault
    // writes so the run never depends on the host's GPG/SSH signing agent.
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "commit.gpgsign",
    GIT_CONFIG_VALUE_0: "false",
  };
  const cwdArg = { cwd };

  const cleanup = async () => {
    child?.stdin.end();
    await isolated.cleanup().catch(() => {});
    await rm(mainVault, { recursive: true, force: true }).catch(() => {});
  };

  try {
    // D1 — add_attachment
    const add = await call(
      "add_attachment",
      { ...cwdArg, localPath: docsource, kind: "document-source", root: ".", include: ["**/*.md"], acceptedMediaTypes: ["text/markdown"] },
      env,
    );
    const added = add.structured?.attachment;
    record(
      "D1",
      "add_attachment persists document-source config",
      added?.kind === "document-source" &&
        Boolean(added?.attachmentId) &&
        Array.isArray(added?.acceptedMediaTypes) &&
        added.acceptedMediaTypes.includes("text/markdown"),
      {
        attachmentId: added?.attachmentId,
        projectSlug: added?.projectSlug,
        root: added?.root,
        include: added?.include,
        exclude: added?.exclude,
        acceptedMediaTypes: added?.acceptedMediaTypes,
        isError: add.isError,
        text: add.text.slice(0, 200),
      },
    );

    // D2 — list_attachments
    const list = await call("list_attachments", cwdArg, env);
    const listed = (list.structured?.attachments ?? []).find((a) => a.attachmentId === added?.attachmentId);
    record("D2", "list_attachments shows the document-source (enabled)", listed?.kind === "document-source" && listed?.enabled === true, { listed });

    // D3 — sync indexes documents
    const sync = await call("sync", cwdArg, env);
    const docSyncLine = sync.text.split("\n").find((l) => l.startsWith("doc-source:"));
    const indexedMatch = docSyncLine?.match(/Indexed (\d+) documents, (\d+) chunks/);
    record(
      "D3",
      "sync indexes documents/chunks from pinned revision",
      Boolean(indexedMatch) && Number(indexedMatch[1]) >= 2 && Number(indexedMatch[2]) >= 2,
      { docSyncLine, structuredKeys: sync.structured ? Object.keys(sync.structured) : [], fullText: sync.text },
    );

    // D4 — recall surfaces document chunks (lexical channel)
    const recall = await call("recall", { ...cwdArg, query: ZETA, limit: 10, scope: "all" }, env);
    const dcs = recall.structured?.documentChunks ?? [];
    record(
      "D4",
      "recall surfaces document-chunk candidates with full contract",
      dcs.length > 0 &&
        dcs.every(
          (d) =>
            d.kind === "document-chunk" &&
            typeof d.chunkId === "string" &&
            typeof d.documentId === "string" &&
            typeof d.retrievalHandle === "string" &&
            d.retrievalHandle.startsWith("chunk:") &&
            Array.isArray(d.headingAncestry) &&
            typeof d.excerpt === "string",
        ),
      { count: dcs.length, sample: dcs.slice(0, 2), sourcePaths: [...new Set(dcs.map((d) => d.sourcePath))], textHasDocumentResults: recall.text.includes("Document Results") },
    );

    // D5 — get resolves chunk: and doc: handles
    const chunkHandle = dcs[0]?.retrievalHandle;
    const getChunk = await call("get", { ...cwdArg, ids: [chunkHandle] }, env);
    const gotDoc = getChunk.structured?.documents?.[0];
    record("D5a", "get(chunk:) resolves to exact document source text", Boolean(gotDoc) && typeof gotDoc.content === "string" && gotDoc.content.includes(ZETA), { retrievalHandle: chunkHandle, document: gotDoc, isError: getChunk.isError, text: getChunk.text.slice(0, 200) });

    const docHandle = dcs[0] ? `doc:${dcs[0].documentId}` : null;
    const getDoc = await call("get", { ...cwdArg, ids: [docHandle] }, env);
    const gotFull = getDoc.structured?.documents?.[0];
    record("D5b", "get(doc:) resolves to document-level source", Boolean(gotFull) && typeof gotFull.content === "string" && gotFull.content.includes(ZETA), { docHandle, document: gotFull, isError: getDoc.isError, text: getDoc.text.slice(0, 200) });

    // D6 — mutation rejection on doc: and chunk: handles
    const forgetDoc = await call("forget", { ...cwdArg, id: docHandle }, env);
    const forgetChunk = await call("forget", { ...cwdArg, id: chunkHandle }, env);
    const rejectPattern = /immutable|document|read-only|cannot be mutated/i;
    record("D6", "mutation tools reject doc:/chunk: handles", forgetDoc.isError && rejectPattern.test(forgetDoc.text) && forgetChunk.isError && rejectPattern.test(forgetChunk.text), { forgetDocText: forgetDoc.text.slice(0, 300), forgetChunkText: forgetChunk.text.slice(0, 300) });

    // D7 — scope guard (global excludes document chunks)
    const recallGlobal = await call("recall", { ...cwdArg, query: ZETA, limit: 10, scope: "global" }, env);
    record("D7", "scope guard: document chunks excluded from scope: global", !recallGlobal.structured?.documentChunks || recallGlobal.structured.documentChunks.length === 0, { count: recallGlobal.structured?.documentChunks?.length ?? 0 });

    // D8 — mode/filter guard
    const recallTemporal = await call("recall", { ...cwdArg, query: ZETA, limit: 10, mode: "temporal" }, env);
    const recallTagged = await call("recall", { ...cwdArg, query: ZETA, limit: 10, tags: ["dogfooding"] }, env);
    record(
      "D8",
      "mode/filter guard: document chunks excluded from temporal mode + tag filters",
      (!recallTemporal.structured?.documentChunks || recallTemporal.structured.documentChunks.length === 0) &&
        (!recallTagged.structured?.documentChunks || recallTagged.structured.documentChunks.length === 0),
      { temporalCount: recallTemporal.structured?.documentChunks?.length ?? 0, tagCount: recallTagged.structured?.documentChunks?.length ?? 0 },
    );

    // D9 — per-document chunk cap
    const perDoc = new Map();
    for (const d of dcs) perDoc.set(d.documentId, (perDoc.get(d.documentId) ?? 0) + 1);
    const maxPerDoc = Math.max(0, ...perDoc.values());
    record("D9", "per-document chunk cap enforced (<= 5 per documentId)", maxPerDoc <= 5, { perDoc: Object.fromEntries(perDoc), maxPerDoc, totalChunks: dcs.length });

    // D11 — regression: directory-prefixed include glob must scope by path
    //   `docs/**/*.md` should index the two docs/ files and exclude README.md.
    //   Current parser (document-sync.ts) corrupts ext -> "docs/md" and indexes 0.
    const addGlob = await call(
      "add_attachment",
      { ...cwdArg, localPath: docsource, kind: "document-source", root: ".", include: ["docs/**/*.md"], acceptedMediaTypes: ["text/markdown"] },
      env,
    );
    const syncGlob = await call("sync", cwdArg, env);
    const globLine = syncGlob.text.split("\n").find((l) => l.startsWith("doc-source:"));
    const globIndexed = globLine?.match(/Indexed (\d+) documents, (\d+) chunks/);
    record(
      "D11",
      "directory-prefixed include glob (docs/**/*.md) scopes by path",
      Boolean(globIndexed) && Number(globIndexed[1]) === 2,
      { globLine, attachmentId: addGlob.structured?.attachment?.attachmentId },
    );

    // D10 — teardown
    const slug = addGlob.structured?.attachment?.projectSlug ?? added?.projectSlug;
    const remove = await call("remove_attachment", { ...cwdArg, projectSlug: slug }, env);
    const listAfter = await call("list_attachments", cwdArg, env);
    const stillThere = (listAfter.structured?.attachments ?? []).some((a) => a.attachmentId === added?.attachmentId);
    record("D10", "remove_attachment detaches the document-source", !remove.isError && !stillThere, { isError: remove.isError, text: remove.text.slice(0, 200) });
  } finally {
    await cleanup();
  }

  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n=== Pack D: document-source attachment (local build) ===`);
  console.log(`entrypoint: ${ENTRYPOINT}`);
  console.log(`consumer (isolated): ${cwd}`);
  console.log(`result: ${passed}/${checks.length} passed\n`);
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.id}  ${c.label}`);
    console.log(`       ${JSON.stringify(c.detail)}`);
  }
  const failures = checks.filter((c) => !c.pass);
  if (failures.length) {
    console.log(`\nFAILURES:`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.label}`);
    process.exitCode = 1;
  }
}

main().catch(async (e) => {
  console.error(e.stack || e.message || String(e));
  child?.stdin.end();
  process.exit(1);
});
