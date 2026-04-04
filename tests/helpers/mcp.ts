import { afterAll, afterEach, beforeAll } from "vitest";
import { access, mkdir, mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { execFile } from "child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const execFileAsync = promisify(execFile);
export const builtEntryPoint = path.join(repoRoot, "build", "index.js");
const buildLockDir = path.join(repoRoot, ".mcp-test-build-lock");
let buildReadyPromise: Promise<void> | undefined;

export const tempDirs: string[] = [];

export async function ensureBuiltEntryPointReady(options?: {
  entryPoint?: string;
  lockDir?: string;
  runBuild?: () => Promise<void>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  resetMemoizedState?: boolean;
}): Promise<void> {
  if (options?.resetMemoizedState) {
    buildReadyPromise = undefined;
  }

  if (!buildReadyPromise) {
    buildReadyPromise = ensureBuiltEntryPointReadyInternal(options).catch((error) => {
      buildReadyPromise = undefined;
      throw error;
    });
  }

  await buildReadyPromise;
}

async function ensureBuiltEntryPointReadyInternal(options?: {
  entryPoint?: string;
  lockDir?: string;
  runBuild?: () => Promise<void>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<void> {
  const entryPoint = options?.entryPoint ?? builtEntryPoint;
  const lockDir = options?.lockDir ?? buildLockDir;
  const runBuild = options?.runBuild ?? (() => execFileAsync("npm", ["run", "build"], { cwd: repoRoot }).then(() => undefined));
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      await access(entryPoint);
      return;
    } catch {
      // entry point not ready yet
    }

    try {
      await mkdir(lockDir);
      try {
        await runBuild();
      } finally {
        await rm(lockDir, { recursive: true, force: true });
      }
      await access(entryPoint);
      return;
    } catch (error) {
      const isLockHeld = error instanceof Error && "code" in error && error.code === "EEXIST";
      if (!isLockHeld) {
        throw error;
      }
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for MCP build lock at ${lockDir}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function initTestRepo(repoDir: string, branch = "feature/test"): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: repoDir });
  await execFileAsync("git", ["checkout", "-B", branch], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: repoDir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
}

export async function initTestVaultRepo(vaultDir: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: vaultDir });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: vaultDir });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: vaultDir });
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

beforeAll(async () => {
  await ensureBuiltEntryPointReady();
}, 120000);

export async function startFakeEmbeddingServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || req.url !== "/api/embed") {
      res.writeHead(404).end();
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }));
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

export function extractRememberedId(text: string): string {
  const match = text.match(/`([^`]+)`/);
  if (!match) {
    throw new Error(`Could not parse remembered id from: ${text}`);
  }

  return match[1];
}

export async function callLocalMcpMethod(
  vaultDir: string,
  id: number,
  method: string,
  params: Record<string, unknown>,
  options?: { ollamaUrl?: string; disableGit?: boolean },
): Promise<{ id?: number; result?: Record<string, unknown> }> {
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
      id,
      method,
      params,
    },
  ];

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("node", [builtEntryPoint], {
      cwd: repoRoot,
      env: {
        ...process.env,
        DISABLE_GIT: options?.disableGit === false ? "false" : "true",
        VAULT_PATH: vaultDir,
        ...(options?.ollamaUrl ? { OLLAMA_URL: options.ollamaUrl } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";
    let stdinReady = false;

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`MCP script exited with code ${code}: ${stderrData}`));
        return;
      }
      resolve(stdoutData);
    });

    child.stdin.write(messages.map((message) => JSON.stringify(message)).join("\n") + "\n", () => {
      stdinReady = true;
      setTimeout(() => child.stdin.end(), 200);
    });
  });

  if (!stdout.trim()) {
    throw new Error(`Empty stdout from MCP process`);
  }

  const lines = stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
    id?: number;
    result?: Record<string, unknown>;
  });

  return lines.find((line) => line.id === id) ?? {};
}

export async function callLocalMcp(
  vaultDir: string,
  toolName: string,
  arguments_: Record<string, unknown>,
  options?: string | { ollamaUrl?: string; disableGit?: boolean },
): Promise<string> {
  const response = await callLocalMcpResponse(vaultDir, toolName, arguments_, options);
  return response.text;
}

export async function callLocalMcpResponse(
  vaultDir: string,
  toolName: string,
  arguments_: Record<string, unknown>,
  options?: string | { ollamaUrl?: string; disableGit?: boolean },
): Promise<{ text: string; structuredContent?: Record<string, unknown> }> {
  const resolvedOptions = typeof options === "string" ? { ollamaUrl: options } : options;
  const response = await callLocalMcpMethod(vaultDir, 1, "tools/call", {
    name: toolName,
    arguments: arguments_,
  }, resolvedOptions);
  const text = response?.result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`Missing tool response for ${toolName}`);
  }

  return { text, structuredContent: response?.result?.structuredContent as Record<string, unknown> | undefined };
}

export async function callLocalMcpPrompt(vaultDir: string, promptName: string): Promise<string> {
  const response = await callLocalMcpMethod(vaultDir, 1, "prompts/get", { name: promptName });
  const messages = response?.result?.messages as Array<{ content?: { text?: string } }> | undefined;
  const text = messages?.[0]?.content?.text;
  if (!text) {
    throw new Error(`Missing prompt response for ${promptName}`);
  }

  return text;
}

export async function listLocalMcpTools(vaultDir: string): Promise<Array<{ name: string; description?: string }>> {
  const response = await callLocalMcpMethod(vaultDir, 1, "tools/list", {});
  const tools = response?.result?.tools as Array<{ name: string; description?: string }> | undefined;
  if (!tools) {
    throw new Error("Missing tools/list response");
  }

  return tools;
}
