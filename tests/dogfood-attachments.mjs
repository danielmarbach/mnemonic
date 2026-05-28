#!/usr/bin/env node
// Dogfood script for multi-repo attachment scenarios.
// Creates two temp git repos, attaches one to the other, and exercises
// read-path recall, write-through, cross-vault relationships, and sync.

import { spawn } from "child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { execFileSync } from "child_process";
import os from "os";
import path from "path";
import { resolve } from "path";

const entry = resolve(process.cwd(), "build/index.js");

function createRepo(name) {
  const dir = mkdtempSync(path.join(os.tmpdir(), `mnemonic-dogfood-${name}-`));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["remote", "add", "origin", `git@github.com:test/${name}.git`], { cwd: dir });

  const vaultDir = path.join(dir, ".mnemonic");
  mkdirSync(path.join(vaultDir, "notes"), { recursive: true });
  mkdirSync(path.join(vaultDir, "embeddings"), { recursive: true });
  mkdirSync(path.join(vaultDir, "projections"), { recursive: true });
  writeFileSync(path.join(vaultDir, ".gitignore"), "embeddings/\nprojections/\n");
  writeFileSync(
    path.join(vaultDir, "config.json"),
    JSON.stringify({ schemaVersion: "1.3" }, null, 2) + "\n",
  );

  // Initial commit so git branch exists for attachment reads
  writeFileSync(path.join(dir, "README.md"), `# ${name}\n`);
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init", "-q"], { cwd: dir });
  execFileSync("git", ["checkout", "-b", "main"], { cwd: dir });
  execFileSync("git", ["branch", "-D", "master"], { cwd: dir });

  return dir;
}

const mainVaultDir = mkdtempSync(path.join(os.tmpdir(), "mnemonic-dogfood-main-"));
mkdirSync(path.join(mainVaultDir, "notes"), { recursive: true });
writeFileSync(path.join(mainVaultDir, ".gitignore"), "embeddings/\nprojections/\n");
writeFileSync(
  path.join(mainVaultDir, "config.json"),
  JSON.stringify({ schemaVersion: "1.3" }, null, 2) + "\n",
);

const consumingRepo = createRepo("consuming");
const attachedRepo = createRepo("attached");

const child = spawn("node", [entry], {
  env: { ...process.env, VAULT_PATH: mainVaultDir },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
let id = 1;
const pending = new Map();

child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const msgId = id++;
    const timeout = setTimeout(() => {
      pending.delete(msgId);
      reject(new Error(`timeout: ${method}`));
    }, 30000);
    pending.set(msgId, (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msgId, method, params }) + "\n");
  });
}

async function callTool(name, args) {
  const raw = await rpc("tools/call", { name, arguments: args });
  const result = raw?.result;
  return {
    text: result?.content?.[0]?.text ?? "",
    structured: result?.structuredContent,
    isError: result?.isError ?? false,
  };
}

function parseId(text) {
  const m = text.match(/`([^`]+)`/);
  return m ? m[1] : null;
}

const checks = [];
function check(label, condition) {
  checks.push({ label, ok: !!condition });
  console.log(`${label}:`, !!condition);
}

async function main() {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "dogfood-attachments", version: "1" },
  });

  // 1. Seed a note in the attached repo directly
  const attRemember = await callTool("remember", {
    title: "Attached repo architecture decision",
    content:
      "# Attached repo architecture decision\n\nWe chose federated reads over a centralised service.",
    lifecycle: "permanent",
    tags: ["architecture", "attachments"],
    scope: "project",
    cwd: attachedRepo,
    allowProtectedBranch: true,
  });
  const attachedNoteId = parseId(attRemember.text);
  check("1. remember in attached repo", attachedNoteId);

  // 2. Add read-only attachment
  const addRo = await callTool("add_attachment", {
    cwd: consumingRepo,
    localPath: attachedRepo,
    branch: "main",
    writable: false,
  });
  const roSlug = addRo.structured?.attachment?.projectSlug;
  check("2. add_attachment read-only returns slug", roSlug);

  // 3. list_attachments shows the entry
  const listRo = await callTool("list_attachments", { cwd: consumingRepo });
  const hasRoAtt = (listRo.structured?.attachments ?? []).some((a) => a.projectSlug === roSlug);
  check("3. list_attachments shows read-only entry", hasRoAtt);

  // 4. project_memory_summary shows attached vault count
  const summary = await callTool("project_memory_summary", { cwd: consumingRepo });
  const summaryHasAttached = (summary.structured?.notes?.attachedVault ?? 0) > 0;
  check("4. project_memory_summary shows attached vaults", summaryHasAttached);

  // 5. list with storedIn:attached returns attached notes
  const listAttached = await callTool("list", {
    cwd: consumingRepo,
    storedIn: "attached",
    limit: 10,
  });
  const attachedNotesPresent = (listAttached.structured?.notes ?? []).length > 0;
  check("5. list(storedIn:attached) returns attached notes", attachedNotesPresent);

  // 6. where_is_memory for attached note
  const where = await callTool("where_is_memory", { id: attachedNoteId, cwd: consumingRepo });
  const whereIsAttached = where.text.includes("attached:");
  check("6. where_is_memory shows attached label", whereIsAttached);

  // 7. Remove read-only attachment and re-add as writable before mutation tests
  const removeResult = await callTool("remove_attachment", {
    cwd: consumingRepo,
    projectSlug: roSlug,
  });
  check("7. remove_attachment succeeds", !removeResult.isError);

  const addWr = await callTool("add_attachment", {
    cwd: consumingRepo,
    localPath: attachedRepo,
    branch: "main",
    writable: true,
    pushBranch: "main",
  });
  const wrSlug = addWr.structured?.attachment?.projectSlug;
  check("8. add_attachment writable returns slug", wrSlug);

  // 9. Toggle attachment off and on
  const toggleOff = await callTool("set_attachment_enabled", {
    cwd: consumingRepo,
    projectSlug: wrSlug,
    enabled: false,
  });
  check("9. set_attachment_enabled off succeeds", !toggleOff.isError);

  const listAfterToggleOff = await callTool("list", {
    cwd: consumingRepo,
    storedIn: "attached",
    limit: 10,
  });
  const attachedHidden = (listAfterToggleOff.structured?.notes ?? []).length === 0;
  check("10. attached notes hidden when disabled", attachedHidden);

  const toggleOn = await callTool("set_attachment_enabled", {
    cwd: consumingRepo,
    projectSlug: wrSlug,
    enabled: true,
  });
  check("11. set_attachment_enabled on succeeds", !toggleOn.isError);

  const listAfterToggleOn = await callTool("list", {
    cwd: consumingRepo,
    storedIn: "attached",
    limit: 10,
  });
  const attachedVisibleAgain = (listAfterToggleOn.structured?.notes ?? []).length > 0;
  check("12. attached notes visible when re-enabled", attachedVisibleAgain);

  // 13. Seed a note in consuming repo
  const conRemember = await callTool("remember", {
    title: "Consuming repo requirement",
    content: "# Consuming repo requirement\n\nWe need cross-repo memory access.",
    lifecycle: "permanent",
    tags: ["requirements"],
    scope: "project",
    cwd: consumingRepo,
    allowProtectedBranch: true,
  });
  const consumingNoteId = parseId(conRemember.text);
  check("13a. remember in consuming repo", consumingNoteId);

  // 10. Cross-vault relate (requires writable attached vault)
  const relateResult = await callTool("relate", {
    fromId: consumingNoteId,
    toId: attachedNoteId,
    type: "explains",
    cwd: consumingRepo,
    allowProtectedBranch: true,
  });
  check("13. cross-vault relate succeeds", !relateResult.isError);

  // 11. get with includeRelationships shows vaultPath in raw relatedTo
  const getResult = await callTool("get", {
    ids: [consumingNoteId],
    cwd: consumingRepo,
    includeRelationships: true,
  });
  const note = getResult.structured?.notes?.[0];
  const hasVaultPath = note?.relatedTo?.some((r) => r.vaultPath);
  check("14. get relatedTo includes vaultPath", hasVaultPath);

  // 12. memory_graph resolves cross-vault edge
  const graphResult = await callTool("memory_graph", { cwd: consumingRepo });
  const graphHasCrossVault =
    graphResult.text.includes(attachedNoteId) || graphResult.text.includes("attached:");
  check("15. memory_graph resolves cross-vault", graphHasCrossVault);

  // 13. Cross-vault unrelate
  const unrelateResult = await callTool("unrelate", {
    fromId: consumingNoteId,
    toId: attachedNoteId,
    cwd: consumingRepo,
    allowProtectedBranch: true,
  });
  check("16. cross-vault unrelate succeeds", !unrelateResult.isError);

  // 14. Verify relationship was removed from consuming note
  const getAfterUnrelate = await callTool("get", {
    ids: [consumingNoteId],
    cwd: consumingRepo,
  });
  const consumingNoteAfter = getAfterUnrelate.structured?.notes?.[0];
  const relationshipRemoved = !consumingNoteAfter?.relatedTo?.some((r) => r.id === attachedNoteId);
  check("17. relationship removed from consuming note", relationshipRemoved);

  // 15. Write-through: update existing attached note
  const updateWr = await callTool("update", {
    id: attachedNoteId,
    content:
      "# Attached repo architecture decision\n\nWe chose federated reads over a centralised service. Updated via write-through.",
    cwd: consumingRepo,
    allowProtectedBranch: true,
  });
  check("18. update across writable attached vault", !updateWr.isError);

  // 19. forget on attached vault via consuming project
  const forgetWr = await callTool("forget", {
    id: attachedNoteId,
    cwd: consumingRepo,
    allowProtectedBranch: true,
  });
  check("19. forget on writable attached vault", !forgetWr.isError);

  // 20. Verify attached note is gone
  const getAfterForget = await callTool("get", {
    ids: [attachedNoteId],
    cwd: consumingRepo,
  });
  check(
    "20. attached note no longer found after forget",
    getAfterForget.text.includes("Not found"),
  );

  // 18. Sync mentions attached vault
  const syncResult = await callTool("sync", { cwd: consumingRepo });
  const syncMentions =
    syncResult.text.includes("attached") || syncResult.text.includes("Attachment");
  check("21. sync output mentions attached vault", syncMentions);

  // Summary
  const failed = checks.filter((c) => !c.ok);
  console.log("\n" + (failed.length === 0 ? "ALL PASSED" : `${failed.length} FAILED`));
  for (const f of failed) {
    console.log(`  ✗ ${f.label}`);
  }

  child.stdin.end();
  rmSync(mainVaultDir, { recursive: true, force: true });
  rmSync(consumingRepo, { recursive: true, force: true });
  rmSync(attachedRepo, { recursive: true, force: true });
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e.stack || e.message || String(e));
  child.stdin.end();
  rmSync(mainVaultDir, { recursive: true, force: true });
  rmSync(consumingRepo, { recursive: true, force: true });
  rmSync(attachedRepo, { recursive: true, force: true });
  process.exit(1);
});
