#!/usr/bin/env node
import { spawn } from "child_process";
import { resolve } from "path";
import { mkdtempSync } from "fs";
import { execFileSync } from "child_process";
import os from "os";

const vaultDir = mkdtempSync(`${os.tmpdir()}/mnemonic-dogfood-test-`);
execFileSync("git", ["init", "-q"], { cwd: vaultDir });
execFileSync("git", ["config", "user.name", "Test"], { cwd: vaultDir });
execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: vaultDir });

const entry = resolve(process.cwd(), "build/index.js");
const child = spawn("node", [entry], {
  env: { ...process.env, VAULT_PATH: vaultDir, DISABLE_GIT: "true" },
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
      reject(new Error("timeout"));
    }, 15000);
    pending.set(msgId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msgId, method, params }) + "\n");
  });
}

async function main() {
  await rpc("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });

  const cwd = vaultDir;

  // Remember a note
  const rem = await rpc("tools/call", {
    name: "remember",
    arguments: {
      title: "Dogfood Test",
      content: "# Dogfood Test\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B.\n",
      lifecycle: "temporary",
      tags: ["dogfood"],
      scope: "project",
      cwd,
      allowProtectedBranch: true,
    },
  });
  const remText = rem.result?.content?.[0]?.text ?? "";
  const idMatch = remText.match(/`([^`]+)`/);
  const noteId = idMatch ? idMatch[1] : null;
  console.log("remembered:", noteId);

  if (!noteId) {
    console.log("FAIL: Could not parse note id");
    child.stdin.end();
    process.exit(1);
  }

  // Patch: insert after Section A
  const p1 = await rpc("tools/call", {
    name: "update",
    arguments: {
      id: noteId,
      semanticPatch: [
        {
          selector: { heading: "Section A" },
          operation: { op: "insertAfter", value: "Patched content." },
        },
      ],
      cwd,
      allowProtectedBranch: true,
    },
  });
  const p1Ok = p1.result?.content?.[0]?.text?.includes("Updated memory");
  console.log("patch1 (insertAfter):", p1Ok);

  // Get to verify
  const g1 = await rpc("tools/call", { name: "get", arguments: { ids: [noteId], cwd } });
  const g1t = g1.result?.content?.[0]?.text ?? "";
  const hasPatched = g1t.includes("Patched content.");
  const hasHeadingB = g1t.includes("Section B");
  const hasContentB = g1t.includes("Content B.");
  console.log("  has patched content:", hasPatched);
  console.log("  has heading B:", hasHeadingB);

  // Lint rejection
  const p2 = await rpc("tools/call", {
    name: "update",
    arguments: {
      id: noteId,
      semanticPatch: [
        {
          selector: { heading: "Section B" },
          operation: { op: "insertAfter", value: "[broken](<>)" },
        },
      ],
      cwd,
      allowProtectedBranch: true,
    },
  });
  const lintRejected = p2.result?.content?.[0]?.text?.includes("Semantic patch failed");
  console.log("lint rejected:", lintRejected);

  // Retry after lint rejection with valid patch under Section B
  const p3 = await rpc("tools/call", {
    name: "update",
    arguments: {
      id: noteId,
      semanticPatch: [
        {
          selector: { heading: "Section B" },
          operation: { op: "insertAfter", value: "Retry success." },
        },
      ],
      cwd,
      allowProtectedBranch: true,
    },
  });
  const retryOk = p3.result?.content?.[0]?.text?.includes("Updated memory");
  console.log("retry ok:", retryOk);

  const g2 = await rpc("tools/call", { name: "get", arguments: { ids: [noteId], cwd } });
  const retryContentOk = (g2.result?.content?.[0]?.text ?? "").includes("Retry success.");
  console.log("retry content ok:", retryContentOk);

  // Also verify heading B still exists (lint rejection didn't mutate)
  const stillHasB = (g2.result?.content?.[0]?.text ?? "").includes("Section B");
  console.log("heading B still present:", stillHasB);

  // Summary
  const allOk = p1Ok && hasPatched && hasHeadingB && lintRejected && retryOk && retryContentOk && stillHasB;
  console.log("\n" + (allOk ? "ALL PASSED" : "SOME FAILED"));

  child.stdin.end();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  child.stdin.end();
  process.exit(1);
});
