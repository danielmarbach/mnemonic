import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("local MCP script", () => {
  it("supports global remember and forget with git disabled", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    tempDirs.push(vaultDir);
    const embeddingServer = await startFakeEmbeddingServer();

    try {
      const rememberText = await callLocalMcp(vaultDir, "remember", {
        title: "Integration dogfood note",
        content: "Temporary integration-test note created through the local MCP script.",
        tags: ["integration", "dogfood"],
        summary: "Create integration dogfood note with git disabled",
        scope: "global",
      }, embeddingServer.url);

      const noteId = extractRememberedId(rememberText);
      const notePath = path.join(vaultDir, "notes", `${noteId}.md`);

      await expect(stat(notePath)).resolves.toBeDefined();
      await expect(readFile(notePath, "utf-8")).resolves.toContain("Integration dogfood note");

      const forgetText = await callLocalMcp(vaultDir, "forget", { id: noteId }, embeddingServer.url);
      expect(forgetText).toContain(`Forgotten '${noteId}'`);
      await expect(stat(notePath)).rejects.toThrow();
    } finally {
      await embeddingServer.close();
    }
  }, 15000);

  it("supports overriding project identity to use upstream", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-vault-"));
    const repoDir = await mkdtemp(path.join(os.tmpdir(), "mnemonic-mcp-project-"));
    tempDirs.push(vaultDir, repoDir);

    await execFileAsync("git", ["init"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "add", "origin", "git@github.com:user/myapp-fork.git"], { cwd: repoDir });
    await execFileAsync("git", ["remote", "add", "upstream", "git@github.com:acme/myapp.git"], { cwd: repoDir });

    const before = await callLocalMcp(vaultDir, "get_project_identity", { cwd: repoDir });
    expect(before).toContain("`github-com-user-myapp-fork`");
    expect(before).toContain("**remote:** origin");

    const setResult = await callLocalMcp(vaultDir, "set_project_identity", {
      cwd: repoDir,
      remoteName: "upstream",
    });
    expect(setResult).toContain("default=`github-com-user-myapp-fork`");
    expect(setResult).toContain("effective=`github-com-acme-myapp`");

    const after = await callLocalMcp(vaultDir, "get_project_identity", { cwd: repoDir });
    expect(after).toContain("`github-com-acme-myapp`");
    expect(after).toContain("**remote:** upstream");
    expect(after).toContain("**default id:** `github-com-user-myapp-fork`");
  }, 15000);
});

async function callLocalMcp(
  vaultDir: string,
  toolName: string,
  arguments_: Record<string, unknown>,
   ollamaUrl?: string,
): Promise<string> {
  const messages = [
    {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: arguments_,
      },
    },
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("./scripts/mcp-local.sh", {
      cwd: repoRoot,
      env: {
        ...process.env,
        DISABLE_GIT: "true",
        VAULT_PATH: vaultDir,
        ...(ollamaUrl ? { OLLAMA_URL: ollamaUrl } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`MCP script exited with ${code}: ${stderrData}`));
        return;
      }
      resolve(stdoutData);
    });

    child.stdin.end(messages.map((message) => JSON.stringify(message)).join("\n") + "\n");
  });

  const lines = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
    id?: number;
    result?: { content?: Array<{ text?: string }> };
  });
  const response = lines.find((line) => line.id === 1);
  const text = response?.result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`Missing tool response for ${toolName}`);
  }

  return text;
}

function extractRememberedId(text: string): string {
  const match = text.match(/`([^`]+)`/);
  if (!match) {
    throw new Error(`Could not parse remembered id from: ${text}`);
  }

  return match[1];
}

async function startFakeEmbeddingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embeddings") {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine fake embedding server address");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}
